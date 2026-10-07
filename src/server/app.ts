import { idSchema } from '../shared/identifiers.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { ZodError, z } from 'zod';
import { pool, camel } from './db.js';
import { authenticate, hashToken, verifyPassword, sessionCookie, roles } from './security.js';
import { ClinicService } from './service.js';
import { DomainError } from '../domain/models.js';
import { schemas } from './validation.js';
import { recordRouter } from './record-router.js';
import { administrationRouter } from './administration.js';
import { authorizeModules } from './module-access.js';
import { referenceRouter } from './reference-router.js';
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

export function createApp(service = new ClinicService()) {
  const app = express();
  app.disable('x-powered-by');
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0 && trustProxyHops <= 3)
    app.set('trust proxy', trustProxyHops);
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
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== (process.env.APP_ORIGIN || 'http://localhost:5173')
    )
      return res
        .status(403)
        .json({ error: 'Request origin is not allowed.', code: 'ORIGIN_FORBIDDEN' });
    next();
  });
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }),
  );
  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    }),
  );
  const loginLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  app.post(
    '/api/auth/login',
    loginLimit,
    asyncRoute(async (req, res) => {
      const input = schemas.login.parse(req.body);
      const { rows } = await pool.query('SELECT * FROM users WHERE lower(email)=$1 AND active', [
        input.email,
      ]);
      const encoded =
        rows[0]?.password_hash ||
        '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
      if (!(await verifyPassword(input.password, encoded)) || !rows[0])
        throw new DomainError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
      const u = rows[0],
        token = randomBytes(32).toString('hex'),
        csrfToken = randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))`,
        [hashToken(token), u.id, csrfToken],
      );
      res.setHeader('Set-Cookie', sessionCookie(token));
      res.json({
        user: camel({
          id: u.id,
          tenant_id: u.tenant_id,
          branch_id: u.branch_id,
          name: u.name,
          email: u.email,
          role: u.role,
          license_number: u.license_number,
        }),
        csrfToken,
        branchId: u.branch_id,
      });
    }),
  );
  app.get(
    '/api/verify/:token',
    rateLimit({ windowMs: 60000, limit: 30 }),
    asyncRoute(async (req, res) => {
      res.json(
        camel(
          await service.verifyDocument(
            z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(req.params.token),
          ),
        ),
      );
    }),
  );
  const api = express.Router();
  api.use(authenticate);
  api.use(authorizeModules);
  api.use(referenceRouter());
  api.use(recordRouter());
  api.use(administrationRouter());
  api.get('/auth/me', (req, res) =>
    res.json({
      user: req.context.actor,
      csrfToken: req.context.csrfToken,
      branchId: req.context.branchId,
      modules: req.context.modules,
    }),
  );
  api.post(
    '/auth/logout',
    asyncRoute(async (req, res) => {
      const token = req.headers.cookie
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('cms_session='))
        ?.slice(12);
      if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
      res.setHeader('Set-Cookie', 'cms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      res.status(204).end();
    }),
  );
  api.get(
    '/bootstrap',
    asyncRoute(async (req, res) => {
      res.json(await service.bootstrap(req.context));
    }),
  );
  api.get(
    '/dashboard',
    asyncRoute(async (req, res) => {
      res.json(await service.dashboard(req.context));
    }),
  );
  for (const kind of [
    'patients',
    'appointments',
    'queue',
    'encounters',
    'inventory',
    'invoices',
    'documents',
    'notifications',
  ]) {
    api.get(
      `/${kind}`,
      asyncRoute(async (req, res) => {
        res.json({ data: await service.list(req.context, kind, String(req.query.search || '')) });
      }),
    );
  }
  api.get(
    '/patients/:id',
    asyncRoute(async (req, res) => {
      res.json(await service.getPatient(req.context, idSchema.parse(req.params.id)));
    }),
  );
  const mutation = (
    path: string,
    schema: any,
    method: (req: Request, input: any) => Promise<any>,
    verb: 'post' | 'put' = 'post',
  ) =>
    api[verb](
      path,
      ...(path.startsWith('/encounters') || path.startsWith('/documents') ? [roles('DOCTOR')] : []),
      asyncRoute(async (req, res) => {
        if (req.params.id) idSchema.parse(req.params.id);
        const value = await method(req, schema.parse(req.body));
        res.status(verb === 'put' || path.endsWith('/cancel') ? 200 : 201).json(value);
      }),
    );
  mutation('/patients', schemas.patient, (r, i) => service.savePatient(r.context, i));
  mutation(
    '/patients/:id',
    schemas.patient.refine((v) => !!v.version, 'Version is required.'),
    (r, i) => service.savePatient(r.context, i, idSchema.parse(r.params.id)),
    'put',
  );
  mutation('/appointments', schemas.appointment, (r, i) => service.schedule(r.context, i));
  mutation(
    '/appointments/:id/cancel',
    z.object({ version: z.number().int().positive() }).strict(),
    (r, i) => service.cancelAppointment(r.context, idSchema.parse(r.params.id), i.version),
  );
  mutation('/queue', schemas.queue, async (r, i) => {
    const result = await service.checkIn(r.context, i);
    broadcast(r.context.branchId);
    return result;
  });
  mutation('/queue/:id/transition', schemas.transition, async (r, i) => {
    const result = await service.transitionQueue(r.context, idSchema.parse(r.params.id), i);
    broadcast(r.context.branchId);
    return result;
  });
  mutation('/encounters', schemas.encounter, (r, i) => service.saveEncounter(r.context, i));
  mutation(
    '/encounters/:id',
    schemas.encounter.refine((v) => !!v.version, 'Version is required.'),
    (r, i) => service.saveEncounter(r.context, i, idSchema.parse(r.params.id)),
    'put',
  );
  mutation('/inventory', schemas.item, (r, i) => service.addItem(r.context, i));
  mutation('/inventory/batches', schemas.batch, (r, i) => service.receiveBatch(r.context, i));
  mutation('/dispenses', schemas.dispense, (r, i) => service.dispense(r.context, i));

  mutation('/invoices', schemas.invoice, (r, i) => service.createInvoice(r.context, i));
  mutation('/deposits', schemas.deposit, (r, i) => service.addDeposit(r.context, i));
  mutation('/documents', schemas.document, (r, i) => service.issueDocument(r.context, i));
  mutation(
    '/documents/:id/revoke',
    z.object({ reason: z.string().trim().min(1).max(2000) }).strict(),
    (r, i) => service.revokeDocument(r.context, idSchema.parse(r.params.id), i.reason),
  );
  api.get(
    '/invoices/:id/receipt',
    asyncRoute(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const invoice = (
        await pool.query(
          `SELECT i.*,p.name patient_name,b.name branch_name,b.address FROM invoices i JOIN patients p ON p.id=i.patient_id JOIN branches b ON b.id=i.branch_id WHERE i.id=$1 AND i.tenant_id=$2 AND i.branch_id=$3`,
          [id, req.context.actor.tenantId, req.context.branchId],
        )
      ).rows[0];
      if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found.', 404);
      const payments = (
        await pool.query('SELECT method,amount_cents,reference FROM payments WHERE invoice_id=$1', [
          id,
        ])
      ).rows;
      const doc = new PDFDocument({ size: 'A4', margin: 55 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
      doc.pipe(res);
      const currency = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;
      doc
        .fontSize(22)
        .text(invoice.branch_name)
        .fontSize(10)
        .text(invoice.address)
        .moveDown()
        .fontSize(18)
        .text('Payment Receipt')
        .fontSize(11)
        .text(`Invoice: ${invoice.invoice_number}`)
        .text(`Patient: ${invoice.patient_name}`)
        .text(`Issued: ${camel(invoice.created_at)}`)
        .moveDown();
      for (const line of invoice.lines)
        doc.text(
          `${line.description} — ${line.quantity} x ${currency(line.unitPriceCents)} = ${currency(line.quantity * line.unitPriceCents)}`,
        );
      doc
        .moveDown()
        .fontSize(15)
        .text(`Total: ${currency(invoice.total_cents)}`)
        .fontSize(11);
      for (const payment of payments)
        doc.text(
          `${payment.method}: ${currency(payment.amount_cents)}${payment.reference ? ` (${payment.reference})` : ''}`,
        );
      doc.moveDown().text('Payment methods are staff-recorded settlement references.').end();
    }),
  );
  api.get(
    '/patients/:id/deposit-balance',
    asyncRoute(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      await service.getPatient(req.context, id);
      const { rows } = await pool.query(
        'SELECT coalesce(sum(amount_cents),0) balance_cents FROM patient_deposits WHERE tenant_id=$1 AND branch_id=$2 AND patient_id=$3',
        [req.context.actor.tenantId, req.context.branchId, id],
      );
      res.json({ patientId: id, balanceCents: Number(rows[0].balance_cents) });
    }),
  );
  mutation('/notifications/:id/retry', z.object({}).strict(), async (r) => {
    const result = await pool.query(
      "UPDATE notification_outbox SET status='PENDING',attempts=0,last_error=NULL,available_at=UTC_TIMESTAMP() WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status IN ('UNCONFIGURED','FAILED')",
      [idSchema.parse(r.params.id), r.context.actor.tenantId, r.context.branchId],
    );
    if (!result.rowCount)
      throw new DomainError('NOT_FOUND', 'Retryable notification not found.', 404);
    return { id: idSchema.parse(r.params.id), status: 'PENDING' };
  });
  api.get(
    '/documents/:id/pdf',
    asyncRoute(async (req, res) => {
      const d = await service.document(req.context, idSchema.parse(req.params.id)),
        p = d.payload;
      const doc = new PDFDocument({ size: 'A4', margin: 55 });
      const qr = await QRCode.toBuffer(
        `${process.env.PUBLIC_URL || process.env.APP_ORIGIN || 'http://localhost:5173'}/verify/${d.verification_hash}`,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${d.document_number}.pdf"`);
      doc.pipe(res);
      doc
        .fontSize(22)
        .text(p.branchName)
        .fontSize(10)
        .text(p.branchAddress || '')
        .moveDown();
      doc
        .fontSize(18)
        .text(
          d.kind === 'MC'
            ? 'Medical Certificate'
            : d.kind === 'REFERRAL'
              ? 'Referral Letter'
              : 'Lab Investigation Requisition',
        )
        .fontSize(10)
        .text(`Reference: ${d.document_number}`)
        .moveDown();
      if (d.revoked_at) doc.fillColor('red').text('REVOKED').fillColor('black');
      doc
        .text(`Patient: ${p.patientName}`)
        .text(`National ID: ${p.nationalId}`)
        .text(
          `Practitioner: ${p.practitionerName} | Registration: ${p.licenseNumber || 'Not recorded'}`,
        )
        .moveDown();
      if (d.kind === 'MC') {
        doc
          .text(
            `Leave: ${String(d.start_date).slice(0, 10)} to ${String(d.end_date).slice(0, 10)} (${p.days} days)`,
          )
          .text(p.lightDuty ? 'Fit for light duties only.' : 'Unfit for duty.');
        if (!d.diagnosis_redacted) doc.text(`Assessment: ${p.assessment}`);
      }
      if (d.kind === 'REFERRAL')
        doc
          .text(`To: ${p.target}`)
          .text(`Urgency: ${p.urgency}`)
          .text(`Reason: ${p.reason}`)
          .text(`Clinical summary: ${p.assessment}`)
          .text(`Vitals: ${JSON.stringify(p.vitals)}`)
          .text(`Allergies: ${p.allergies.join(', ') || 'None recorded'}`)
          .text(`Conditions: ${p.conditions.join(', ') || 'None recorded'}`)
          .text(`Medications: ${JSON.stringify(p.prescriptions)}`);
      if (d.kind === 'LAB')
        doc
          .text(`Panels: ${p.panels.join(', ')}`)
          .text(`Specimen: ${p.specimenType}`)
          .text(
            `Fasting: ${p.fastingRequired ? 'Required, confirm duration with practitioner' : 'Not required'}`,
          )
          .text(`Notes: ${p.clinicalNotes}`);
      doc
        .moveDown()
        .fontSize(8)
        .text(`Issued: ${new Date(d.created_at).toISOString()}`)
        .text(
          'Scan QR to verify certificate status. Verification does not disclose patient or diagnosis.',
        )
        .image(qr, { width: 90 })
        .end();
    }),
  );
  const listeners = new Map<number, Set<Response>>();
  const broadcast = (branchId: number) => {
    for (const res of listeners.get(branchId) || [])
      res.write(`event: queue\ndata: {"refresh":true}\n\n`);
  };
  api.get('/queue/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const branch = req.context.branchId;
    const set = listeners.get(branch) || new Set<Response>();
    set.add(res);
    listeners.set(branch, set);
    res.write('event: queue\ndata: {"refresh":true}\n\n');
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      set.delete(res);
      if (!set.size) listeners.delete(branch);
    });
  });
  api.get(
    '/queue/display',
    asyncRoute(async (req, res) => {
      const tickets = await service.list(req.context, 'queue');
      res.json({
        data: tickets.map((q: any) => ({
          id: q.id,
          ticketNumber: q.ticketNumber,
          status: q.status,
          roomName: q.roomName,
          practitionerName: q.practitionerName,
          version: q.version,
          calledAt: q.calledAt,
        })),
      });
    }),
  );
  api.use((_req, res) => res.status(404).json({ error: 'Route not found.', code: 'NOT_FOUND' }));
  app.use('/api', api);
  const staticDir = join(process.cwd(), 'dist');
  if (existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => res.sendFile(join(staticDir, 'index.html')));
  }
  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: 'Validation failed.',
        code: 'VALIDATION',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId: res.locals.requestId,
      });
    if (error instanceof DomainError)
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code, requestId: res.locals.requestId });
    if (error.code === 'ER_DUP_ENTRY')
      return res.status(409).json({
        error: 'Record already exists or resource is currently in use.',
        code: 'DUPLICATE',
        requestId: res.locals.requestId,
      });
    if (
      [
        'ER_NO_REFERENCED_ROW_2',
        'ER_CHECK_CONSTRAINT_VIOLATED',
        'ER_TRUNCATED_WRONG_VALUE',
        'ER_DATA_TOO_LONG',
      ].includes(error.code)
    )
      return res.status(422).json({
        error: 'Referenced record or value is invalid for this branch.',
        code: 'INVALID_REFERENCE',
        requestId: res.locals.requestId,
      });
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code))
      return res.status(409).json({
        error: 'Resource changed concurrently. Refresh and retry.',
        code: 'CONCURRENCY_CONFLICT',
        requestId: res.locals.requestId,
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Malformed JSON.', code: 'VALIDATION' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: 'Request too large.', code: 'PAYLOAD_TOO_LARGE' });
    console.error(
      JSON.stringify({
        level: 'error',
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        code: error.code || 'INTERNAL',
      }),
    );
    return res.status(500).json({
      error: 'Request failed. Use request ID when contacting support.',
      code: 'INTERNAL',
      requestId: res.locals.requestId,
    });
  });
  return app;
}
