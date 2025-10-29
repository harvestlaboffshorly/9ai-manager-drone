import { DockerProvider } from './providers/docker.js';
import { MilvusService } from './services/milvus.js';
import type { RegistryItem } from './types.js';

const docker = new DockerProvider();

export const registry: RegistryItem[] = [
  {
    id: 'milvus',
    label: 'Milvus @ Docker',
    adapter: new MilvusService({
      host: process.env.MILVUS_HOST || '127.0.0.1',
      port: Number(process.env.MILVUS_PORT || 19530),
      containerName: process.env.MILVUS_CONTAINER_NAME || 'milvus-standalone'
    }, docker)
  }
];

export const getService = (id: string) => registry.find(r => r.id === id);