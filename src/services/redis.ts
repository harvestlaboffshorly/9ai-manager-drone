import { createClient, type RedisClientType } from "redis";
import type { ServiceAdapter, Status } from "../types.js";

type RedisCfg = {
  host?: string; // default 127.0.0.1
  port?: number; // default 6379
  password?: string;
  db?: number;
  // optional unix socket path if you prefer
  socketPath?: string;
};

function toFloat32Buffer(input: number[] | Float32Array): Buffer {
  const arr = input instanceof Float32Array ? input : new Float32Array(input);
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

async function ftList(client: RedisClientType): Promise<string[]> {
  try {
    return await client.sendCommand<string[]>(["FT._LIST"]);
  } catch {
    return []; // RediSearch may not be installed
  }
}

async function ftInfo(
  client: RedisClientType,
  index: string,
): Promise<Record<string, unknown>> {
  const raw = await client.sendCommand<(string | number | unknown[])[]>([
    "FT.INFO",
    index,
  ]);
  const out: Record<string, unknown> = {};
  for (let i = 0; i < raw.length - 1; i += 2) out[String(raw[i])] = raw[i + 1];
  return out;
}

export class RedisService implements ServiceAdapter {
  readonly kind = "redis";

  constructor(private cfg: RedisCfg = {}) {}

  private async client(): Promise<RedisClientType> {
    const {
      host = "127.0.0.1",
      port = 6379,
      password,
      db = 0,
      socketPath,
    } = this.cfg;
    const url = socketPath
      ? `redis+socket://${encodeURIComponent(socketPath)}`
      : `redis://${host}:${port}`;
    const client = createClient({ url, password, database: db });
    client.on("error", () => {
      /* suppress noisy event */
    });
    await client.connect();
    //@ts-expect-error
    return client;
  }

  async status(): Promise<Status> {
    let client: RedisClientType | undefined;
    try {
      client = await this.client();
      const [ping, dbsize, server, memory, replication, modules, searchIdx] =
        await Promise.all([
          client.ping(),
          client.dbSize(),
          client.info("server"),
          client.info("memory"),
          client.info("replication"),
          (async () => {
            try {
              return await client.sendCommand(["MODULE", "LIST"]);
            } catch {
              return [];
            }
          })(),
          ftList(client),
        ]);

      return {
        ok: true,
        details: {
          ping,
          dbsize,
          info: { server, memory, replication, modules },
          searchIndexes: searchIdx,
        },
      };
    } catch (e: any) {
      return { ok: false, details: { error: String(e) } };
    } finally {
      if (client) await client.quit().catch(() => {});
    }
  }

  async restart() {
    // Not supported without an infra provider / service manager.
    return { message: "Restart not supported", providerStatus: "success" };
  }

  /**
   * Actions:
   * - 'keys' { pattern?: string }
   * - 'get' { key: string }
   * - 'set' { key: string, value: string, ex?: number }  // ex in seconds
   * - 'del' { keys: string[] }
   * - 'ft_list'
   * - 'ft_info' { index: string }
   * - 'ft_search' { index: string, query: string, options?: string[] }
   * - 'search' { index: string, query_vectors: number[]|Float32Array, vector_field?: string, top_k?: number, return_fields?: string[] }
   */
  async action(name: string, payload?: any) {
    let client: RedisClientType | undefined;
    try {
      client = await this.client();

      switch (name) {
        case "keys": {
          const pattern = payload?.pattern ?? "*";
          return await client.keys(pattern);
        }
        case "get": {
          const { key } = payload ?? {};
          if (!key) throw new Error("Missing key");
          return await client.get(key);
        }
        case "set": {
          const { key, value, ex } = payload ?? {};
          if (!key) throw new Error("Missing key");
          if (typeof value === "undefined") throw new Error("Missing value");
          return ex
            ? client.set(key, value, { EX: Number(ex) })
            : client.set(key, value);
        }
        case "del": {
          const { keys } = payload ?? {};
          if (!Array.isArray(keys) || keys.length === 0)
            throw new Error("Missing keys");
          return await client.del(keys);
        }

        case "ft_list": {
          return await ftList(client);
        }
        case "ft_info": {
          const { index } = payload ?? {};
          if (!index) throw new Error("Missing index");
          return await ftInfo(client, index);
        }
        case "ft_search": {
          const { index, query, options } = payload ?? {};
          if (!index) throw new Error("Missing index");
          if (typeof query !== "string") throw new Error("Missing query");
          const args = [
            "FT.SEARCH",
            index,
            query,
            ...(Array.isArray(options) ? options : []),
          ];
          return await client.sendCommand(args);
        }

        // Milvus-style alias: vector search via RediSearch KNN
        case "search": {
          const {
            index,
            query_vectors,
            vector_field = "vector",
            top_k = 5,
            return_fields = [],
          } = payload ?? {};

          if (!index) throw new Error("Missing index");
          if (!query_vectors) throw new Error("Missing query_vectors");

          const blob = toFloat32Buffer(query_vectors);

          const query = `*=>[KNN ${Number(top_k)} @${vector_field} $BLOB AS vector_score]`;

          const args: (string | number | Buffer)[] = [
            "FT.SEARCH",
            index,
            query,
            "PARAMS",
            "2",
            "BLOB",
            blob,
            "SORTBY",
            "vector_score",
            "ASC",
            "RETURN",
            String((return_fields?.length ?? 0) + 1),
            "vector_score",
            ...(return_fields || []),
            "DIALECT",
            "2",
          ];
          //@ts-expect-error
          return await client.sendCommand(args);
        }

        default:
          throw new Error(`Unsupported action: ${name}`);
      }
    } finally {
      if (client) await client.quit().catch(() => {});
    }
  }
}
