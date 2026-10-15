import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { PublicRegistrationService } from './public-registration-service.js';
import { idSchema } from '../shared/identifiers.js';
import { lookupPostcode } from './data/postcodes.js';
import { transaction } from './db.js';
import { roles } from './security.js';
import { ClinicService } from './service.js';
import { DomainError } from '../domain/models.js';
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
export function publicRegistrationRouter(service = new PublicRegistrationService()) {
  const router = Router();
  router.use(
    rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
  );
  router.get(
    '/branches/:branchId',
    route(async (req, res) =>
      res.json(await service.metadata(idSchema.parse(req.params.branchId))),
    ),
  );
  router.get(
    '/branches/:branchId/postcodes/:postcode',
    route(async (req, res) => {
      const branch = await service.branch(idSchema.parse(req.params.branchId));
      if (!branch.enabled)
        throw new DomainError(
          'NOT_FOUND',
          'Public registration is unavailable for this branch.',
          404,
        );
      res.json({
        data: lookupPostcode(
          z
            .string()
            .regex(/^\d{5}$/)
            .parse(req.params.postcode),
        ),
      });
    }),
  );
  router.post(
    '/branches/:branchId',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
    route(async (req, res) =>
      res.status(202).json(await service.submit(idSchema.parse(req.params.branchId), req.body)),
    ),
  );
  router.get(
    '/receipts/:token',
    route(async (req, res) => res.json(await service.status(req.params.token))),
  );
  return router;
}
export function registrationStaffRouter(service = new PublicRegistrationService()) {
  const router = Router();
  router.get(
    '/registrations',
    route(async (req, res) => res.json({ data: await service.list(req.context) })),
  );
  router.post(
    '/registrations/:id/confirm',
    route(async (req, res) =>
      res.json(await service.confirm(req.context, idSchema.parse(req.params.id), req.body)),
    ),
  );
  router.post(
    '/registrations/:id/reject',
    route(async (req, res) =>
      res.json(await service.reject(req.context, idSchema.parse(req.params.id), req.body)),
    ),
  );
  const settings = async (req: Request) => {
    const branch = await service.branch(req.context.branchId);
    const origin = new URL(process.env.APP_ORIGIN || 'http://127.0.0.1:3100');
    const url = new URL('/register', origin);
    url.searchParams.set('branchId', String(branch.id));
    return {
      enabled: Boolean(branch.enabled),
      version: branch.version,
      branchId: branch.id,
      branchName: branch.name,
      url: url.href,
      qrCodeDataUrl: await QRCode.toDataURL(url.href),
      mobileReady:
        origin.protocol === 'https:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname),
    };
  };
  router.get(
    '/admin/registration-settings',
    roles('ADMIN'),
    route(async (req, res) => res.json(await settings(req))),
  );
  router.put(
    '/admin/registration-settings',
    roles('ADMIN'),
    route(async (req, res) => {
      const input = z
        .object({ enabled: z.boolean(), version: z.number().int().positive() })
        .strict()
        .parse(req.body);
      await transaction(async (db) => {
        const result = await db.query(
          'UPDATE branches SET public_registration_enabled=$3,public_registration_version=public_registration_version+1 WHERE id=$1 AND tenant_id=$2 AND active=1 AND public_registration_version=$4',
          [req.context.branchId, req.context.actor.tenantId, input.enabled, input.version],
        );
        if (!result.rowCount)
          throw new DomainError(
            'VERSION_CONFLICT',
            'Registration settings changed. Refresh before saving.',
            409,
          );
        await new ClinicService(db, (work) => work(db)).audit(
          db,
          req.context,
          'UPDATE_REGISTRATION_LINK',
          'branch',
          req.context.branchId,
          { enabled: input.enabled },
        );
      });
      res.json(await settings(req));
    }),
  );
  return router;
}
