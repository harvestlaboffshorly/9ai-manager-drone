import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import type { InfraProvider, ServiceAdapter, Status } from '../types.js';

export class MilvusService implements ServiceAdapter {
  readonly kind = 'milvus';

  constructor(private cfg: any, private infra?: InfraProvider) {}

  private client() {
    const address = `${this.cfg.host}:${this.cfg.port}`;
    return new MilvusClient({ address, ssl: false, logLevel: 'error' });
  }

  async status(): Promise<Status> {
    try {
      const client = this.client();
      const collections = await client.listCollections();
      const provider = this.infra && this.cfg.containerName
        ? await this.infra.containerStatus(this.cfg.containerName)
        : undefined;
      return { ok: true, details: { collections: collections.data, provider } };
    } catch (e: any) {
      return { ok: false, details: { error: String(e) } };
    }
  }

  async restart() {
    if (!this.infra || !this.cfg.containerName) throw new Error('Missing infra or containerName');
    const state = await this.infra.restartContainer(this.cfg.containerName);
    return { message: 'Restarted', providerStatus: state };
  }

  async action(name: string, payload?: any) {
    const client = this.client();
    switch (name) {
      case 'list_collections':
        return (await client.listCollections()).data;
      case 'describe_collection':
        return (await client.describeCollection({ collection_name: payload.collection_name }));
      case 'search': {
        const { collection_name, query_vectors, vector_field = 'embeddings', top_k = 5 } = payload;
        await client.loadCollectionSync({ collection_name });
        // TODO: fix bruh
        return (await client.search({ collection_name, vector: query_vectors, anns_field: vector_field, topk: top_k, data: []})).results;
      }
      default:
        throw new Error(`Unsupported action: ${name}`);
    }
  }
}