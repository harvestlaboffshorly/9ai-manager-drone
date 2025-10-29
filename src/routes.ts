import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyJwt } from './lib/jwt.js';
import { getService, registry } from './registry.js';


export async function requireAuth(req: FastifyRequest, rep: FastifyReply) {
  try {
    const hdr = req.headers["authorization"];
    const token = hdr?.startsWith("Bearer ") ? hdr.slice(7) : undefined;

    if (!token) {
      return rep.code(401).send({ error: "Missing Authorization header" });
    }

    const payload = await verifyJwt(token);
    if (!payload) {
      return rep.code(401).send({ error: "Invalid or expired token" });
    }

    // Optionally attach payload to request for downstream handlers
    (req as any).user = payload;
  } catch (err) {
    console.error("Auth check failed:", (err as Error).message);
    
    return rep.internalServerError();
  }
}

export async function registerRoutes(f: FastifyInstance) {
  f.addHook('preHandler', async (req, rep) => requireAuth(req, rep));

  f.get('/health', async () => ({ ok: true }));

  f.get('/services', async () => registry.map(r => ({ id: r.id, label: r.label, kind: r.adapter.kind })));

  f.get('/services/:id/status', async (req, rep) => {
    const s = getService((req.params as any).id);
    if (!s) return rep.code(404).send({ error: 'not_found' });
    return await s.adapter.status();
  });

  f.post('/services/:id/restart', async (req, rep) => {
    const s = getService((req.params as any).id);
    if (!s) return rep.notFound();
    return await s.adapter.restart();
  });

  f.post('/services/:id/action/:name', async (req, rep) => {
    const { id, name } = req.params as any;
    const s = getService(id);
    if (!s) return rep.code(404).send({ error: 'not_found' });
    if (!s.adapter.action) return rep.code(400).send({ error: 'action_not_supported' });
    return await s.adapter.action(name, req.body);
  });
  f.post('/services/:id/stop', async (req, rep) => {
    const { id, name } = req.params as any;
    const s = getService(id);
    if(!s) return rep.notFound();
    if(!s.adapter.action) return rep.badRequest("action not supported");

    return await s.adapter.action('stop')
  })
}