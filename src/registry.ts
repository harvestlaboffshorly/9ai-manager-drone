import { DockerProvider } from "./providers/docker.js";
import { MilvusService } from "./services/milvus.js";
import { RedisService } from "./services/redis.js";
import type { RegistryItem } from "./types.js";

const ENABLE_REDIS = process.env.ENABLE_REDIS === "1";
const ENABLE_MILVUS = process.env.ENABLE_MILVUS === "1";

console.log({ ENABLE_MILVUS, ENABLE_REDIS });

const REDIS_CONFIG = {
  id: "REDIS_MAIN",
  label: "Redis @ Bare",
  adapter: new RedisService({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
  }),
};

const registry: RegistryItem[] = [];

if (ENABLE_MILVUS) {
  const docker = new DockerProvider();
  const MILVUS_CONFIG = {
    id: "MILVUS_MAIN",
    label: "Milvus @ Docker",
    adapter: new MilvusService(
      {
        host: process.env.MILVUS_HOST || "127.0.0.1",
        port: Number(process.env.MILVUS_PORT || 19530),
        containerName: process.env.MILVUS_CONTAINER_NAME || "milvus-standalone",
      },
      docker,
    ),
  };
  registry.push(MILVUS_CONFIG);
}

if (ENABLE_REDIS) registry.push(REDIS_CONFIG);

export { registry };

export const getService = (id: string) => registry.find((r) => r.id === id);
