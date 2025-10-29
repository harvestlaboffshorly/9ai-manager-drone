import Docker from 'dockerode';
import fs from 'node:fs';
import { InfraProvider } from '../types.js';

export class DockerProvider implements InfraProvider {
  readonly name = 'docker';
  private docker: Docker;

  constructor() {
    const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    if (process.env.DOCKER_HOST) this.docker = new Docker({ host: process.env.DOCKER_HOST });
    else {
      if (!fs.existsSync(socketPath)) throw new Error(`Docker socket not found at ${socketPath}`);
      this.docker = new Docker({ socketPath });
    }
  }

  async containerStatus(idOrName: string) {
    const c = this.docker.getContainer(idOrName);
    try {
      const data = await c.inspect();
      return { running: Boolean(data.State?.Running), state: data.State };
    } catch (err: any) {
      if (err?.statusCode === 404) return { running: false, state: { error: 'not_found' } };
      throw err;
    }
  }

  async restartContainer(idOrName: string) {
    const c = this.docker.getContainer(idOrName);
    await c.restart();
    return (await c.inspect()).State;
  }
}