import { idSchema } from '../shared/identifiers.js';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { pool } from './db.js';
import { DomainError } from '../domain/models.js';
import type { ModuleId } from '../shared/module-permissions.js';
export interface Actor {
  id: number;
  tenantId: number;
  branchId: number;
  email: string;
  name: string;
  role: string;
  licenseNumber: string | null;
}
export interface Context {
  actor: Actor;
  branchId: number;
  requestId: string;
  csrfToken: string;
  modules?: ModuleId[];
}
declare global {
  namespace Express {
    interface Request {
      context: Context;
    }
  }
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, digest] = encoded.split(':');
  if (!salt || !digest) return false;
  const actual = await derive(password, salt),
    expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const sessionCookie = (token: string) =>
  `cms_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('cms_session='))
      ?.slice(12);
    if (!token) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.', 401);
    const { rows } = await pool.query(
      `SELECT u.*,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
      [hashToken(token)],
    );
    if (!rows[0]) throw new DomainError('UNAUTHENTICATED', 'Session expired. Sign in again.', 401);
    const u = rows[0],
      branchId = idSchema.parse(
        req.headers['x-branch-id'] ||
          (/\/(events|display|pdf|receipt|image)$/.test(req.path)
            ? req.query.branchId
            : undefined) ||
          u.branch_id,
      );
    const access = await pool.query(
      `SELECT 1 FROM user_branches ub JOIN branches b ON b.id=ub.branch_id WHERE ub.user_id=$1 AND ub.branch_id=$2 AND b.tenant_id=$3`,
      [u.id, branchId, u.tenant_id],
    );
    if (!access.rowCount)
      throw new DomainError('BRANCH_FORBIDDEN', 'You cannot access this branch.', 403);
    req.context = {
      actor: {
        id: u.id,
        tenantId: u.tenant_id,
        branchId: u.branch_id,
        email: u.email,
        name: u.name,
        role: u.role,
        licenseNumber: u.license_number,
      },
      branchId,
      requestId: String(_res.locals.requestId),
      csrfToken: u.csrf_token,
    };
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers['x-csrf-token'] !== u.csrf_token
    )
      throw new DomainError('CSRF_FAILED', 'Refresh this page before saving.', 403);
    next();
  } catch (error) {
    next(error);
  }
}
export function roles(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) =>
    allowed.includes(req.context.actor.role)
      ? next()
      : next(new DomainError('FORBIDDEN', 'Your role cannot perform this action.', 403));
}
