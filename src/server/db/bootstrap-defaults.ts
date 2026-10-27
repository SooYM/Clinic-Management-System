import { createBillingCategoryDefaults } from './billing-category-defaults.js';
import { createPatientGroupDefaults } from './patient-group-defaults.js';
import { defaultBillingCategories, defaultPatientGroups } from '../../shared/catalogs.js';
import { z } from 'zod';
import type { Database } from '../db.js';
import { PASSWORD_MIN_LENGTH } from '../../shared/password-policy.js';
import type { DatabaseResetDefaults } from '../../shared/database-reset.js';

/** One source of initial configuration for first setup and explicitly authorized database reset. */
export function bootstrapConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const configuration = z
    .object({
      email: z.string().email().max(254),
      password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
      clinicName: z.string().trim().min(1).max(150),
    })
    .parse({
      email: env.BOOTSTRAP_EMAIL?.toLowerCase(),
      password: env.BOOTSTRAP_PASSWORD,
      clinicName: env.CLINIC_NAME || 'Meridian Clinic',
    });
  const defaults: DatabaseResetDefaults = {
    clinicName: configuration.clinicName,
    branchName: 'Main Branch',
    clinicAddress: 'Kuala Lumpur, Malaysia',
    administratorEmail: configuration.email,
    administratorName: 'Clinic Administrator',
    rooms: ['Room 01', 'Room 02', 'Treatment Room'],
    catalogs: {
      PATIENT_GROUP: [...defaultPatientGroups],
      BILLING_CATEGORY: [...defaultBillingCategories],
      LAB_PANEL: [],
      SPECIMEN_TYPE: [],
      INVENTORY_UNIT: [],
      REFERRAL_DESTINATION: [],
    },
  };
  return { defaults, password: configuration.password };
}
export async function createBootstrapDefaults(
  db: Database,
  defaults: DatabaseResetDefaults,
  passwordHash: string,
) {
  const tenantId = (await db.query('INSERT INTO tenants(name) VALUES($1)', [defaults.clinicName]))
    .insertId!;
  const branchId = (
    await db.query('INSERT INTO branches(tenant_id,name,address) VALUES($1,$2,$3)', [
      tenantId,
      defaults.branchName,
      defaults.clinicAddress,
    ])
  ).insertId!;
  await createBillingCategoryDefaults(db, tenantId, branchId);
  await createPatientGroupDefaults(db, tenantId, branchId);
  const id = (
    await db.query(
      "INSERT INTO users(tenant_id,branch_id,email,name,password_hash,role,is_super_admin) VALUES($1,$2,$3,$4,$5,'ADMIN',TRUE)",
      [tenantId, branchId, defaults.administratorEmail, defaults.administratorName, passwordHash],
    )
  ).insertId!;
  await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)', [id, branchId]);
  for (const name of defaults.rooms)
    await db.query('INSERT INTO rooms(tenant_id,branch_id,name) VALUES($1,$2,$3)', [
      tenantId,
      branchId,
      name,
    ]);
  return { tenantId, branchId, id };
}
