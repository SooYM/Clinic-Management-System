import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { CatalogService } from './catalog-service.js';
import { catalogKinds } from '../shared/catalogs.js';
import { idSchema } from '../shared/identifiers.js';
import { DomainError } from '../domain/models.js';
import { roles } from './security.js';
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export function catalogRouter() {
  const router = Router(),
    service = new CatalogService();
  router.get(
    '/admin/catalogs',
    roles('ADMIN'),
    route(async (req, res) => {
      res.json({
        data: await service.list(
          req.context,
          z.enum(catalogKinds).optional().parse(req.query.kind),
        ),
      });
    }),
  );
  router.post(
    '/admin/catalogs',
    roles('ADMIN'),
    route(async (req, res) => {
      res.status(201).json(await service.create(req.context, req.body));
    }),
  );
  router.put(
    '/admin/catalogs/:id',
    roles('ADMIN'),
    route(async (req, res) => {
      res.json(await service.update(req.context, idSchema.parse(req.params.id), req.body));
    }),
  );
  router.put(
    '/admin/inventory/:id',
    roles('ADMIN'),
    route(async (req, res) => {
      res.json(await service.updateInventory(req.context, idSchema.parse(req.params.id), req.body));
    }),
  );
  router.get(
    '/references/catalogs',
    route(async (req, res) => {
      const kind = z.enum(catalogKinds).parse(req.query.kind),
        module = kind === 'INVENTORY_UNIT' ? 'inventory' : 'clinical';
      if (!req.context.modules?.includes(module))
        throw new DomainError(
          'MODULE_FORBIDDEN',
          'Catalog reference access requires its module.',
          403,
        );
      res.json({ data: await service.list(req.context, kind, true) });
    }),
  );
  return router;
}
