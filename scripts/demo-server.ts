import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Free Render transport serves static demo assets only. It never starts the clinical API or a database. */
export function createDemoServer(directory = join(process.cwd(), 'dist-demo')) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.get('/healthz', (_req, res) =>
    res.json({ status: 'ok', mode: 'browser-session-demo', database: false }),
  );
  app.use('/api', (_req, res) =>
    res.status(503).json({
      error: {
        code: 'DEMO_BACKEND_UNAVAILABLE',
        message:
          'Browser demo has no clinical backend. Use the local MySQL application for authenticated records, PDFs, verification and message delivery.',
      },
    }),
  );
  app.get('/demo-unavailable', (_req, res) =>
    res
      .status(200)
      .type('html')
      .send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo feature unavailable</title><body><main><h1>Clinical backend required</h1><p>This free demo keeps simulated data in your browser tab. It cannot issue real medical certificates, signed QR codes, PDF receipts, or send patient messages.</p><p>Run the local application with MySQL for these features. Do not enter real patient data or passwords here.</p><p><a href="/">Return to demo</a></p></main></body></html>',
      ),
  );
  app.use(express.static(directory, { index: false }));
  app.get('*', (_req, res) => res.sendFile(join(directory, 'index.html')));
  return app;
}
if (process.argv[1]?.endsWith('demo-server.ts')) {
  const port = Number(process.env.PORT || 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid integer port.');
  const directory = join(process.cwd(), 'dist-demo');
  if (!existsSync(join(directory, 'index.html')))
    throw new Error('Build demo assets with npm run build:demo before starting.');
  const server = createDemoServer(directory).listen(port, process.env.HOST || '0.0.0.0', () =>
    console.log(`Browser demo listening on port ${port}; no database or clinical backend.`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => server.close(() => process.exit(0)));
}
