export type Status = { ok: boolean; details?: Record<string, unknown> };

export interface ServiceAdapter {
  readonly kind: string;
  status(): Promise<Status>;
  restart(): Promise<{ message: string; providerStatus?: unknown }>;
  action?(name: string, payload?: unknown): Promise<unknown>;
}

export interface InfraProvider {
  readonly name: string;
  containerStatus(idOrName: string): Promise<{ running: boolean; state?: any }>;
  restartContainer(idOrName: string): Promise<any>;
}

export type RegistryItem = {
  id: string;
  label: string;
  adapter: ServiceAdapter;
};