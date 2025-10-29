import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import 'dotenv/config';
import Fastify from 'fastify';
import { registerRoutes } from './routes.js';

const app = Fastify({ logger: true });
await app.register(helmet);
await app.register(cors, { origin: false });
await app.register(sensible);
await registerRoutes(app);

const port = Number(process.env.PORT || 8080);
await app.listen({ port, host: '0.0.0.0' });