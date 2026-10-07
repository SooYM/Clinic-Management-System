import 'dotenv/config';
import { transaction, pool } from '../db.js';
import { hashPassword } from '../security.js';
import { ClinicService } from '../service.js';
import { PASSWORD_MIN_LENGTH } from '../../shared/password-policy.js';
/** Explicit opt-in sample fixtures. Uses fictional patients; no real patient files or reused source database. */
export async function seed() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Sample seed is disabled in production.');
  const password = process.env.SEED_PASSWORD || process.env.BOOTSTRAP_PASSWORD;
  if (!password || password.length < PASSWORD_MIN_LENGTH)
    throw new Error(`Set SEED_PASSWORD (at least ${PASSWORD_MIN_LENGTH} characters).`);
  const hash = await hashPassword(password);
  return transaction(async (db) => {
    const { rows } = await db.query(
      "SELECT * FROM users WHERE role='ADMIN' ORDER BY created_at LIMIT 1",
    );
    const admin = rows[0];
    if (!admin) throw new Error('Bootstrap first.');
    const exists = await db.query('SELECT id FROM patients WHERE tenant_id=$1 LIMIT 1', [
      admin.tenant_id,
    ]);
    if (exists.rowCount) throw new Error('Seed requires tenant with no patients.');
    const tenant = admin.tenant_id,
      branch = admin.branch_id;
    for (const [email, name, role, license] of [
      ['doctor@clinic.local', 'Dr. Aisha Rahman', 'DOCTOR', 'SAMPLE-MMC-001'],
      ['reception@clinic.local', 'Nadia Farah', 'RECEPTIONIST', null],
      ['nurse@clinic.local', 'Nurse Daniel Lee', 'NURSE', null],
      ['therapist@clinic.local', 'Sarah Lim', 'THERAPIST', null],
    ]) {
      const id = (
        await db.query(
          'INSERT INTO users(tenant_id,branch_id,email,name,password_hash,role,license_number) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [tenant, branch, email, name, hash, role, license],
        )
      ).insertId!;
      await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)', [id, branch]);
    }
    const patientIds = [];
    for (const [index, name] of [
      'Amir Hassan',
      'Mei Lin Tan',
      'Priya Nair',
      'Adam Wong',
      'Sofia Ismail',
    ].entries()) {
      const id = (
        await db.query(
          'INSERT INTO patients(tenant_id,branch_id,name,national_id,date_of_birth,sex,phone,email,blood_group,allergies,conditions,notification_consent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)',
          [
            tenant,
            branch,
            name,
            `SAMPLE-${String(index + 1).padStart(4, '0')}`,
            '1990-06-15',
            index % 2 ? 'FEMALE' : 'MALE',
            '+60000000000',
            '',
            index % 2 ? 'A+' : 'O+',
            JSON.stringify(index === 0 ? ['Penicillin'] : []),
            JSON.stringify(index === 0 ? ['Hypertension'] : []),
          ],
        )
      ).insertId!;
      patientIds.push(id);
    }
    for (const [name, sku, ingredient, price, qty] of [
      ['Paracetamol 500mg', 'PARA500', 'Paracetamol', 50, 320],
      ['Amlodipine 5mg', 'AMLO5', 'Amlodipine', 120, 180],
      ['Amoxicillin 500mg', 'AMOX500', 'Penicillin;Amoxicillin', 180, 120],
      ['Sterile Gauze', 'GAUZE', '', 200, 12],
    ] as const) {
      const item = (
        await db.query(
          'INSERT INTO inventory_items(tenant_id,branch_id,name,sku,ingredient,category,unit,price_cents,reorder_level) VALUES($1,$2,$3,$4,$5,$6,$7,$8,20)',
          [
            tenant,
            branch,
            name,
            sku,
            ingredient,
            ingredient ? 'MEDICATION' : 'CONSUMABLE',
            'unit',
            price,
          ],
        )
      ).insertId!;
      const batch = (
        await db.query(
          'INSERT INTO inventory_batches(tenant_id,branch_id,item_id,batch_number,expires_on,quantity) VALUES($1,$2,$3,$4,$5,$6)',
          [tenant, branch, item, `DEMO-${sku}`, '2028-12-31', qty],
        )
      ).insertId!;
      await db.query(
        "INSERT INTO stock_movements(tenant_id,branch_id,batch_id,quantity_delta,reason,actor_id) VALUES($1,$2,$3,$4,'RECEIVED',$5)",
        [tenant, branch, batch, qty, admin.id],
      );
    }
    for (let i = 0; i < 3; i++)
      await db.query(
        "INSERT INTO queue_tickets(tenant_id,branch_id,patient_id,ticket_number,service_date,status,priority) VALUES($1,$2,$3,$4,DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)),'TRIAGE_WAITING','NORMAL')",
        [tenant, branch, patientIds[i], `Q-${String(i + 1).padStart(3, '0')}`],
      );
    console.log('Fictional clinic sample data created. Sample staff use explicit seed password.');
  });
}
if (process.argv[1]?.endsWith('seed.ts'))
  seed()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e.message);
      await pool.end();
      process.exitCode = 1;
    });
