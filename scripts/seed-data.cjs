const { Pool } = require("pg");
const { createCipheriv, createHmac, randomBytes } = require("node:crypto");

function key(name) {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(name + " missing");
  return Buffer.from(raw, "hex");
}

function encryptPatientNationalId(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("PATIENT_NRIC_ENCRYPTION_KEY"), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((p) => p.toString("base64url")).join(".");
}

function hashPatientNationalId(value) {
  return createHmac("sha256", key("PATIENT_NRIC_HASH_KEY")).update(value).digest("hex");
}

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL || "postgresql://sooyauming@localhost:5432/clinic_db"
});

const CLINIC_ID = "c0000000-0000-4000-8000-000000000001";
const BRANCH_ID = "d0000000-0000-4000-8000-000000000001";
const ADMIN_STAFF_ID = "10000000-0000-4000-8000-000000000001";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // 1. Seed missing permissions
    const extraPerms = [
      "documents.read", "documents.write",
      "prescriptions.read", "prescriptions.write",
      "packages.read", "packages.manage"
    ];
    for (const role of ["manager", "doctor", "receptionist", "nurse"]) {
      for (const p of extraPerms) {
        await client.query(`
          INSERT INTO public.role_permissions (clinic_id, branch_id, role, permission_key, is_allowed)
          VALUES ($1, $2, $3, $4, true)
          ON CONFLICT (clinic_id, branch_id, role, permission_key) DO UPDATE SET is_allowed = true;
        `, [CLINIC_ID, BRANCH_ID, role, p]);
      }
    }
    console.log("Permissions seeded.");

    // 2. Demo Patients
    const patients = [
      {
        id: "e0000000-0000-4000-8000-000000000001",
        mrn: "MY-20261005-PAT01",
        nric: "880412101234",
        name: "Patricia Koh",
        dob: "1988-04-12",
        gender: "female",
        phone: "+60 12-345 6789",
        email: "patricia.koh@example.com",
        bloodGroup: "O+",
        allergies: [
          { substance: "Penicillin", severity: "SEVERE" },
          { substance: "Aspirin", severity: "MODERATE" }
        ],
        conditions: ["Hypertension", "Borderline HbA1c"]
      },
      {
        id: "e0000000-0000-4000-8000-000000000002",
        mrn: "MY-20261005-PAT02",
        nric: "920825141235",
        name: "Marcus Lee Wei Jie",
        dob: "1992-08-25",
        gender: "male",
        phone: "+60 12-876 5432",
        email: "marcus.lee@example.com",
        bloodGroup: "A+",
        allergies: [],
        conditions: ["Allergic Rhinitis"]
      },
      {
        id: "e0000000-0000-4000-8000-000000000003",
        mrn: "MY-20261005-PAT03",
        nric: "751103101237",
        name: "Ahmad Bin Razali",
        dob: "1975-11-03",
        gender: "male",
        phone: "+60 13-234 5678",
        email: "ahmad.razali@example.com",
        bloodGroup: "B+",
        allergies: [{ substance: "Sulfa Drugs", severity: "MODERATE" }],
        conditions: ["Type 2 Diabetes", "Hyperlipidemia"]
      },
      {
        id: "e0000000-0000-4000-8000-000000000004",
        mrn: "MY-20261005-PAT04",
        nric: "960214101246",
        name: "Elena Tan Su-Lyn",
        dob: "1996-02-14",
        gender: "female",
        phone: "+60 14-345 6789",
        email: "elena.tan@example.com",
        bloodGroup: "AB+",
        allergies: [],
        conditions: ["Acne Vulgaris"]
      }
    ];

    for (const pat of patients) {
      const ciphertext = encryptPatientNationalId(pat.nric);
      const hash = hashPatientNationalId(pat.nric);
      await client.query(`
        INSERT INTO public.patients (
          id, clinic_id, branch_id, medical_record_number,
          national_id_ciphertext, national_id_hash, full_name, date_of_birth,
          gender, phone, email, blood_group, allergies, chronic_conditions,
          created_by, pdpa_consent_at, pdpa_consent_version
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), '1'
        ) ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email;
      `, [
        pat.id, CLINIC_ID, BRANCH_ID, pat.mrn,
        ciphertext, Buffer.from(hash, "hex"), pat.name, pat.dob,
        pat.gender, pat.phone, pat.email, pat.bloodGroup,
        JSON.stringify(pat.allergies), JSON.stringify(pat.conditions),
        ADMIN_STAFF_ID
      ]);
    }
    console.log("Patients seeded.");

    // 3. Queue tickets
    const tickets = [
      { id: "f0000000-0000-4000-8000-000000000001", patId: patients[0].id, num: "Q-100001-A101", status: "registered" },
      { id: "f0000000-0000-4000-8000-000000000002", patId: patients[1].id, num: "Q-100002-A102", status: "registered" },
      { id: "f0000000-0000-4000-8000-000000000003", patId: patients[2].id, num: "Q-100003-A103", status: "registered" },
      { id: "f0000000-0000-4000-8000-000000000004", patId: patients[3].id, num: "Q-100004-A104", status: "registered" }
    ];

    for (const t of tickets) {
      await client.query(`
        INSERT INTO public.queue_tickets (
          id, clinic_id, branch_id, patient_id, ticket_number, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING;
      `, [t.id, CLINIC_ID, BRANCH_ID, t.patId, t.num, t.status, ADMIN_STAFF_ID]);
    }
    console.log("Queue tickets seeded.");

    // 4. Treatment Packages
    const pkgs = [
      {
        id: "70000000-0000-4000-8000-000000000001",
        patientId: patients[0].id,
        name: "5x Pico Laser Skin Rejuvenation",
        total: 5,
        amountPaid: 1500,
        purchaseDate: "2026-06-15",
        expiryDate: "2027-06-15"
      },
      {
        id: "70000000-0000-4000-8000-000000000002",
        patientId: patients[3].id,
        name: "10x Medical Acne Clarifying Facial",
        total: 10,
        amountPaid: 1200,
        purchaseDate: "2026-05-10",
        expiryDate: "2027-05-10"
      }
    ];
    for (const p of pkgs) {
      await client.query(`
        INSERT INTO public.treatment_packages (
          id, clinic_id, branch_id, patient_id, package_name,
          total_sessions, amount_paid,
          purchase_date, expiry_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING;
      `, [p.id, CLINIC_ID, BRANCH_ID, p.patientId, p.name, p.total, p.amountPaid, p.purchaseDate, p.expiryDate, ADMIN_STAFF_ID]);
    }
    console.log("Treatment packages seeded.");

    // 5. Inventory Items
    const items = [
      { id: "80000000-0000-4000-8000-000000000001", sku: "MED-AMLO-05", name: "Amlodipine Besylate 5mg", minPar: 50, category: "medication" },
      { id: "80000000-0000-4000-8000-000000000002", sku: "MED-AUGM-625", name: "Augmentin (Amoxicillin/Clavulanate) 625mg", minPar: 30, category: "medication" },
      { id: "80000000-0000-4000-8000-000000000003", sku: "AES-BOTOX-100", name: "Botox Cosmetic (Allergan) 100U", minPar: 10, category: "aesthetic_consumable" },
      { id: "80000000-0000-4000-8000-000000000004", sku: "SKN-HA-SERUM", name: "Kumo Advanced Hyaluronic Acid Serum 50ml", minPar: 20, category: "retail" }
    ];
    for (const it of items) {
      await client.query(`
        INSERT INTO public.inventory_items (
          id, clinic_id, branch_id, sku, name, minimum_par_level, category, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
        ON CONFLICT (id) DO NOTHING;
      `, [it.id, CLINIC_ID, BRANCH_ID, it.sku, it.name, it.minPar, it.category]);
    }
    console.log("Inventory items seeded.");

    await client.query("COMMIT;");
    console.log("All demo data seeded successfully into PostgreSQL!");
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("Seeding error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
