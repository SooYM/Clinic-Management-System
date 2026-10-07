import { idSchema } from '../shared/identifiers.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool, transaction, camel, type Database } from './db.js';
import { hashPassword, verifyPassword, roles } from './security.js';
import { DomainError } from '../domain/models.js';
import { PASSWORD_MIN_LENGTH } from '../shared/password-policy.js';
import {
  moduleDefinitions,
  moduleIds,
  roleIds,
  type ModuleId,
} from '../shared/module-permissions.js';
import { effectiveModules } from './module-access.js';

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128);
const userInput = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    name: z.string().trim().min(1).max(150),
    password,
    role: z.enum(['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'THERAPIST']),
    branchId: idSchema,
    licenseNumber: z.string().trim().max(100).nullable().optional(),
  })
  .strict()
  .refine((v) => v.role !== 'DOCTOR' || Boolean(v.licenseNumber), {
    message: 'Doctor registration number is required.',
    path: ['licenseNumber'],
  });
async function audit(db: Database, req: Request, action: string, entity: string, id: number) {
  await db.query(
    'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      req.context.actor.tenantId,
      req.context.branchId,
      req.context.actor.id,
      action,
      entity,
      id,
      req.context.requestId,
      '{}',
    ],
  );
}

export function administrationRouter() {
  const router = Router();
  router.get(
    '/admin/role-modules',
    roles('ADMIN'),
    route(async (req, res) => {
      const result = [];
      for (const role of roleIds)
        result.push({
          role,
          modules: await effectiveModules(pool, req.context.actor.tenantId, role),
          editable: role !== 'ADMIN',
        });
      res.json({ roles: result, moduleDefinitions });
    }),
  );
  router.put(
    '/admin/role-modules',
    roles('ADMIN'),
    route(async (req, res) => {
      const input = z
        .object({
          role: z.enum(['DOCTOR', 'RECEPTIONIST', 'NURSE', 'THERAPIST']),
          modules: z
            .array(
              z.enum([
                'queue',
                'patients',
                'appointments',
                'clinical',
                'inventory',
                'billing',
                'reports',
              ]),
            )
            .max(moduleIds.length),
        })
        .strict()
        .parse(req.body);
      const modules = moduleIds.filter((module) => input.modules.includes(module));
      await transaction(async (db) => {
        await db.query(
          'INSERT INTO role_module_permissions(tenant_id,role,modules) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE modules=$3,updated_at=UTC_TIMESTAMP(3)',
          [req.context.actor.tenantId, input.role, JSON.stringify(modules)],
        );
        await db.query(
          'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,NULL,$6,$7)',
          [
            req.context.actor.tenantId,
            req.context.branchId,
            req.context.actor.id,
            'ROLE_MODULES_CHANGED',
            'role',
            req.context.requestId,
            JSON.stringify({ role: input.role, modules }),
          ],
        );
      });
      res.json({ role: input.role, modules });
    }),
  );
  router.get(
    '/queue/estimate',
    route(async (req, res) => {
      const history = await pool.query(
        `SELECT COUNT(*) sample_count,AVG(TIMESTAMPDIFF(SECOND,created_at,signed_at))/60 average_minutes FROM encounters
      WHERE tenant_id=$1 AND branch_id=$2 AND status='SIGNED' AND signed_at>created_at AND TIMESTAMPDIFF(MINUTE,created_at,signed_at) BETWEEN 1 AND 120 AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)`,
        [req.context.actor.tenantId, req.context.branchId],
      );
      const doctors = await pool.query(
        "SELECT COUNT(*) count FROM users u JOIN user_branches ub ON ub.user_id=u.id WHERE u.tenant_id=$1 AND ub.branch_id=$2 AND u.active=1 AND u.role='DOCTOR'",
        [req.context.actor.tenantId, req.context.branchId],
      );
      const waiting = await pool.query(
        "SELECT COUNT(*) count FROM queue_tickets WHERE tenant_id=$1 AND branch_id=$2 AND status IN ('REGISTERED','TRIAGE_WAITING') AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))",
        [req.context.actor.tenantId, req.context.branchId],
      );
      const sampleCount = Number(history.rows[0].sample_count),
        practitionerCount = Number(doctors.rows[0].count);
      res.json({
        sampleCount,
        practitionerCount,
        waiting: Number(waiting.rows[0].count),
        estimatedMinutes:
          sampleCount >= 5 && practitionerCount > 0
            ? Math.ceil(
                (Number(waiting.rows[0].count) * Number(history.rows[0].average_minutes)) /
                  practitionerCount,
              )
            : null,
        basis:
          'Approximate queue clearance using recent signed consultation duration and registered active doctors; requires at least five observations.',
      });
    }),
  );
  router.get(
    '/admin/users',
    roles('ADMIN'),
    route(async (req, res) => {
      const { rows } = await pool.query(
        'SELECT id,name,email,role,branch_id,license_number,active,created_at FROM users WHERE tenant_id=$1 ORDER BY name LIMIT 200',
        [req.context.actor.tenantId],
      );
      res.json({ data: camel(rows) });
    }),
  );
  router.post(
    '/admin/users',
    roles('ADMIN'),
    route(async (req, res) => {
      const input = userInput.parse(req.body);
      const passwordHash = await hashPassword(input.password);
      const user = await transaction(async (db) => {
        const { rows } = await db.query(
          'SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [req.context.actor.tenantId, input.branchId],
        );
        if (!rows[0])
          throw new DomainError('INVALID_BRANCH', 'Choose a branch in your clinic.', 422);
        const inserted = await db.query(
          'INSERT INTO users(tenant_id,branch_id,email,name,password_hash,role,license_number) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            req.context.actor.tenantId,
            input.branchId,
            input.email,
            input.name,
            passwordHash,
            input.role,
            input.licenseNumber || null,
          ],
        );
        const id = inserted.insertId!;
        await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)', [
          id,
          input.branchId,
        ]);
        await audit(db, req, 'USER_CREATED', 'user', id);
        return {
          id,
          email: input.email,
          name: input.name,
          role: input.role,
          branchId: input.branchId,
        };
      });
      res.status(201).json(user);
    }),
  );
  router.put(
    '/admin/users/:id',
    roles('ADMIN'),
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const input = z.object({ active: z.boolean() }).strict().parse(req.body);
      if (id === req.context.actor.id && !input.active)
        throw new DomainError(
          'SELF_DEACTIVATION',
          'Another administrator must deactivate your account.',
          409,
        );
      await transaction(async (db) => {
        // Lock all clinic admins consistently to protect the final active administrator.
        const admins = await db.query(
          "SELECT id FROM users WHERE tenant_id=$1 AND role='ADMIN' AND active=1 ORDER BY id FOR UPDATE",
          [req.context.actor.tenantId],
        );
        const target = await db.query(
          'SELECT id,role FROM users WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
          [req.context.actor.tenantId, id],
        );
        if (!target.rows[0]) throw new DomainError('NOT_FOUND', 'Staff account not found.', 404);
        if (!input.active && target.rows[0].role === 'ADMIN' && admins.rows.length <= 1)
          throw new DomainError('LAST_ADMIN', 'Keep at least one active administrator.', 409);
        await db.query('UPDATE users SET active=$3 WHERE tenant_id=$1 AND id=$2', [
          req.context.actor.tenantId,
          id,
          input.active,
        ]);
        if (!input.active) await db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
        await audit(db, req, 'USER_STATUS_CHANGED', 'user', id);
      });
      res.json({ id, active: input.active });
    }),
  );
  router.post(
    '/auth/change-password',
    route(async (req, res) => {
      const input = z
        .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
        .strict()
        .parse(req.body);
      const { rows } = await pool.query(
        'SELECT password_hash FROM users WHERE id=$1 AND tenant_id=$2',
        [req.context.actor.id, req.context.actor.tenantId],
      );
      if (!rows[0] || !(await verifyPassword(input.currentPassword, rows[0].password_hash)))
        throw new DomainError('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
      const passwordHash = await hashPassword(input.newPassword);
      await transaction(async (db) => {
        await db.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
          req.context.actor.id,
          passwordHash,
        ]);
        await db.query('DELETE FROM sessions WHERE user_id=$1', [req.context.actor.id]);
        await audit(db, req, 'PASSWORD_CHANGED', 'user', req.context.actor.id);
      });
      res.setHeader('Set-Cookie', 'cms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      res.json({ message: 'Password changed. Sign in again.' });
    }),
  );
  router.get(
    '/admin/branches',
    roles('ADMIN'),
    route(async (req, res) => {
      const { rows } = await pool.query(
        'SELECT id,id branch_number,name,address FROM branches WHERE tenant_id=$1 ORDER BY name',
        [req.context.actor.tenantId],
      );
      res.json({ data: camel(rows) });
    }),
  );
  router.post(
    '/admin/branches',
    roles('ADMIN'),
    route(async (req, res) => {
      const input = z
        .object({ name: z.string().trim().min(1).max(150), address: z.string().trim().max(1000) })
        .strict()
        .parse(req.body);
      const id = await transaction(async (db) => {
        const inserted = await db.query(
          'INSERT INTO branches(tenant_id,name,address) VALUES($1,$2,$3)',
          [req.context.actor.tenantId, input.name, input.address],
        );
        const id = inserted.insertId!;
        await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)', [
          req.context.actor.id,
          id,
        ]);
        await audit(db, req, 'BRANCH_CREATED', 'branch', id);
        return id;
      });
      const branch = (await pool.query('SELECT id branch_number FROM branches WHERE id=$1', [id]))
        .rows[0];
      res.status(201).json({ id, branchNumber: branch.branch_number, ...input });
    }),
  );
  router.get(
    '/admin/audit',
    roles('ADMIN'),
    route(async (req, res) => {
      const { rows } = await pool.query(
        'SELECT a.id,a.action,a.entity_type,a.entity_id,a.request_id,a.created_at,u.name actor_name FROM audit_logs a JOIN users u ON u.id=a.actor_id WHERE a.tenant_id=$1 AND a.branch_id=$2 ORDER BY a.id DESC LIMIT 200',
        [req.context.actor.tenantId, req.context.branchId],
      );
      res.json({ data: camel(rows) });
    }),
  );
  router.get(
    '/admin/rooms',
    roles('ADMIN'),
    route(async (req, res) => {
      const { rows } = await pool.query(
        'SELECT r.id,r.name,r.active,r.branch_id,b.name branch_name FROM rooms r JOIN branches b ON b.id=r.branch_id WHERE r.tenant_id=$1 AND r.branch_id=$2 ORDER BY r.name',
        [req.context.actor.tenantId, req.context.branchId],
      );
      res.json({ data: camel(rows.map((room) => ({ ...room, active: Boolean(room.active) }))) });
    }),
  );
  router.post(
    '/admin/rooms',
    roles('ADMIN'),
    route(async (req, res) => {
      const input = z
        .object({ name: z.string().trim().min(1).max(100), branchId: idSchema })
        .strict()
        .parse(req.body);
      const id = await transaction(async (db) => {
        const branch = await db.query(
          'SELECT b.id FROM branches b JOIN user_branches ub ON ub.branch_id=b.id WHERE b.id=$1 AND b.tenant_id=$2 AND ub.user_id=$3 FOR UPDATE',
          [input.branchId, req.context.actor.tenantId, req.context.actor.id],
        );
        if (!branch.rows[0])
          throw new DomainError('INVALID_BRANCH', 'Choose a branch in your clinic.', 422);
        const inserted = await db.query(
          'INSERT INTO rooms(tenant_id,branch_id,name) VALUES($1,$2,$3)',
          [req.context.actor.tenantId, input.branchId, input.name],
        );
        const id = inserted.insertId!;
        await audit(db, req, 'ROOM_CREATED', 'room', id);
        return id;
      });
      res.status(201).json({ id, ...input, active: true });
    }),
  );
  router.put(
    '/admin/rooms/:id',
    roles('ADMIN'),
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const input = z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .refine(
          (value) => value.name !== undefined || value.active !== undefined,
          'Provide room name or active status.',
        )
        .parse(req.body);
      const result = await transaction(async (db) => {
        const room = (
          await db.query(
            'SELECT id,name,active,branch_id FROM rooms WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
            [id, req.context.actor.tenantId, req.context.branchId],
          )
        ).rows[0];
        if (!room) throw new DomainError('NOT_FOUND', 'Room not found in selected branch.', 404);
        const busy = await db.query(
          "SELECT id FROM queue_tickets WHERE room_id=$1 AND status IN ('CALLED_TO_ROOM','IN_CONSULTATION') LIMIT 1",
          [id],
        );
        if (busy.rowCount)
          throw new DomainError(
            'ROOM_BUSY',
            'Finish or requeue the current consultation before changing this room.',
            409,
          );
        if (input.active === false) {
          const booked = await db.query(
            "SELECT id FROM appointments WHERE room_id=$1 AND status IN ('BOOKED','CHECKED_IN') AND ends_at>UTC_TIMESTAMP(3) LIMIT 1",
            [id],
          );
          if (booked.rowCount)
            throw new DomainError(
              'ROOM_BOOKED',
              'Cancel upcoming room appointments before archiving this room.',
              409,
            );
        }
        await db.query('UPDATE rooms SET name=$2,active=$3 WHERE id=$1', [
          id,
          input.name ?? room.name,
          input.active ?? Boolean(room.active),
        ]);
        await audit(
          db,
          req,
          input.active === false
            ? 'ROOM_ARCHIVED'
            : input.active === true
              ? 'ROOM_RESTORED'
              : 'ROOM_RENAMED',
          'room',
          id,
        );
        return {
          id,
          name: input.name ?? room.name,
          active: input.active ?? Boolean(room.active),
          branchId: room.branch_id,
        };
      });
      res.json(result);
    }),
  );
  router.post(
    '/notifications/:id/retry',
    roles('ADMIN'),
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      await transaction(async (db) => {
        const result = await db.query(
          "UPDATE notification_outbox SET status='PENDING',attempts=0,available_at=UTC_TIMESTAMP(6),last_error=NULL WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status IN ('FAILED','UNCONFIGURED')",
          [id, req.context.actor.tenantId, req.context.branchId],
        );
        if (!result.rowCount)
          throw new DomainError(
            'NOT_RETRYABLE',
            'Notification is missing or cannot be retried.',
            409,
          );
        await audit(db, req, 'NOTIFICATION_RETRY', 'notification', id);
      });
      res.json({ id, status: 'PENDING' });
    }),
  );
  return router;
}
