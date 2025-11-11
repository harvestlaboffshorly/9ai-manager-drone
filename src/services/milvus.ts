import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import type { InfraProvider, ServiceAdapter, Status } from "../types.js";

type Cfg = {
  host: string; // e.g. '127.0.0.1' or 'milvus-standalone'
  port: number; // default 19530
  username?: string;
  password?: string;
  db?: string;
  containerName?: string; // if using Docker provider
  // Optional behavior
  warmupRetries?: number; // tries after restart
  warmupBackoffMs?: number; // wait between retries
  tlsCaPemPath?: string;
  clientCertPath?: string;
  clientKeyPath?: string;
  sniServername?: string;
  ssl?: boolean;
};

export class MilvusService implements ServiceAdapter {
  readonly kind = "milvus";
  constructor(
    private cfg: Cfg,
    private infra?: InfraProvider,
  ) {}

  private address() {
    return `${this.cfg.host}:${this.cfg.port}`;
  }

  private client() {
    const tls: any = {};
    if (this.cfg.tlsCaPemPath) tls.rootCertPath = this.cfg.tlsCaPemPath;
    if (this.cfg.clientCertPath) tls.certChainPath = this.cfg.clientCertPath; // mTLS only
    if (this.cfg.clientKeyPath) tls.privateKeyPath = this.cfg.clientKeyPath; // mTLS only
    if (this.cfg.sniServername) tls.serverName = this.cfg.sniServername;

    return new MilvusClient({
      address: `${this.cfg.host}:${this.cfg.port}`,
      ssl: !!this.cfg.ssl, // enable TLS
      tls: Object.keys(tls).length ? tls : undefined,
      username: this.cfg.username || undefined,
      password: this.cfg.password || undefined,
      database: this.cfg.db || undefined,
      logLevel: "error",
    });
  }

  /** quick TCP probe for clearer errors */
  private async tcpReachable(
    host: string,
    port: number,
    timeoutMs = 800,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      const onDone = (ok: boolean) => {
        socket.destroy();
        resolve(ok);
      };
      const t = setTimeout(() => onDone(false), timeoutMs);
      socket.once("connect", () => {
        clearTimeout(t);
        onDone(true);
      });
      socket.once("error", () => {
        clearTimeout(t);
        onDone(false);
      });
    });
  }

  async status(): Promise<Status> {
    // 1) Infra/container status first (always helpful)
    let provider: any = undefined;
    if (this.infra && this.cfg.containerName) {
      provider = await this.infra.containerStatus(this.cfg.containerName);
    }

    // 2) If container isn't running, report immediately
    if (provider && provider.running === false) {
      return {
        ok: false,
        details: {
          provider,
          milvusReachable: false,
          reason: "container_not_running",
        },
      };
    }

    // 3) TCP probe (faster/clearer than gRPC exceptions)
    const canTcp = await this.tcpReachable(this.cfg.host, this.cfg.port, 800);
    if (!canTcp) {
      return {
        ok: false,
        details: {
          provider,
          milvusReachable: false,
          reason: "tcp_unreachable",
          address: this.address(),
        },
      };
    }

    // 4) gRPC call with gentle warm-up retries (handles post-restart)
    const retries = this.cfg.warmupRetries ?? 4;
    const backoff = this.cfg.warmupBackoffMs ?? 400;

    let lastErr: any = null;
    for (let i = 0; i <= retries; i++) {
      try {
        const client = this.client();
        const collections = await client.listCollections(); // cheap call
        return {
          ok: true,
          details: {
            provider,
            milvusReachable: true,
            collectionsCount: collections?.data?.length ?? 0,
            address: this.address(),
          },
        };
      } catch (e: any) {
        lastErr = e;
        if (i < retries) await sleep(backoff * Math.max(1, i)); // backoff
      }
    }

    // still failing
    return {
      ok: false,
      details: {
        provider,
        milvusReachable: false,
        reason: "grpc_unavailable",
        address: this.address(),
        error: String(lastErr?.message || lastErr),
      },
    };
  }

  async restart() {
    if (!this.infra || !this.cfg.containerName) {
      throw new Error("Missing infra or containerName");
    }
    const state = await this.infra.restartContainer(this.cfg.containerName);
    return { message: "Restarted", providerStatus: state };
  }

  async action(name: string, payload?: any) {
    const client = this.client();
    switch (name) {
      case "list_collections":
        return (await client.listCollections()).data;

      case "describe_collection": {
        const { collection_name } = payload ?? {};
        if (!collection_name) throw new Error("collection_name is required");
        return await client.describeCollection({ collection_name });
      }

      case "search": {
        const {
          collection_name,
          query_vectors,
          vector_field = "embeddings",
          top_k = 5,
          metric_type = "IP",
          params = { nprobe: 10 },
          output_fields = ["id"],
        } = payload ?? {};
        if (!collection_name || !Array.isArray(query_vectors)) {
          throw new Error("collection_name and query_vectors are required");
        }
        await client.loadCollectionSync({ collection_name });
        const res = await client.search({
          collection_name,
          vector: query_vectors,
          anns_field: vector_field,
          topk: top_k,
          metric_type,
          params,
          output_fields,
          // TODO: fix
          data: [],
        });
        return res.results;
      }

      default:
        throw new Error(`Unsupported action: ${name}`);
    }
  }
}
