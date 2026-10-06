import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface StoredStaffAccount {
  id: string;
  auth_user_id: string;
  username: string;
  email: string;
  password: string; // Plain/hashed password for local verification
  full_name: string;
  role: "doctor" | "receptionist" | "nurse" | "manager";
  specialty?: string;
  license_number?: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface StoredPatient {
  id: string;
  medicalRecordNumber: string;
  nric: string;
  name: string;
  phone: string;
  email: string;
  dob: string;
  age: number;
  gender: "Female" | "Male" | "Other" | "Unknown";
  nationality: string;
  address: string;
  bloodGroup: string;
  allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
  chronicConditions: string[];
  createdAt: string;
}

export interface StoredQueueTicket {
  id: string;
  ticketNumber: string;
  patientId: string;
  patientName: string;
  phone: string;
  email: string;
  status: "WAITING" | "CALLED_TO_ROOM" | "IN_CONSULTATION" | "DISPENSARY" | "PAYMENT" | "COMPLETED";
  roomId?: string;
  roomName?: string;
  practitionerName: string;
  registeredAt: string;
  calledAt?: string;
  waitTimeMinutes: number;
}

export interface StoredConsultationRoom {
  id: string;
  name: string;
  practitionerName: string;
  specialty: string;
  isOccupied: boolean;
  currentTicketNumber?: string;
}

export interface StoredInventoryBatch {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface StoredInventoryItem {
  id: string;
  sku: string;
  name: string;
  category: "MEDICATION" | "AESTHETIC_CONSUMABLE" | "SKINCARE_RETAIL";
  dosageForm?: string;
  strength?: string;
  instructions?: string;
  minimumParLevel: number;
  sellingPrice: number;
  batches: StoredInventoryBatch[];
}

export interface StoredDigitalMC {
  id: string;
  mcNumber: string;
  patientId: string;
  patientName: string;
  patientNric: string;
  doctorName: string;
  licenseNumber: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  diagnosis: string;
  isDiagnosisRedacted: boolean;
  qrHash: string;
  issuedAt: string;
}

export interface StoredReferralLetter {
  id: string;
  referralNumber: string;
  patientId: string;
  patientName: string;
  referringDoctor: string;
  targetHospitalOrSpecialty: string;
  urgency: "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY";
  clinicalSummary: string;
  reasonForReferral: string;
  medications: string[];
  issuedAt: string;
}

export interface StoredLabOrder {
  id: string;
  orderNumber: string;
  patientId: string;
  patientName: string;
  orderingDoctor: string;
  panels: string[];
  specimenType: "BLOOD" | "URINE" | "SWAB" | "BIOPSY";
  isFastingRequired: boolean;
  clinicalNotes: string;
  status: "ORDERED" | "COLLECTED" | "PENDING_LAB" | "RESULT_RECEIVED";
  issuedAt: string;
}

export interface StoredPortalConfig {
  portalName: string;
  portalTagline: string;
  legalEntityName: string;
  branchName: string;
  addressLine: string;
  customDuitNowQrImage?: string;
}

export interface ClinicDatabaseState {
  version: number;
  staff: StoredStaffAccount[];
  patients: StoredPatient[];
  queue: StoredQueueTicket[];
  rooms: StoredConsultationRoom[];
  inventory: StoredInventoryItem[];
  digitalMcs: StoredDigitalMC[];
  referrals: StoredReferralLetter[];
  labOrders: StoredLabOrder[];
  portalConfig: StoredPortalConfig;
  rolePermissions: Record<string, string[]>;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "clinic-database.json");

const SEED_STAFF: StoredStaffAccount[] = [
  {
    id: "staff-1",
    auth_user_id: "00000000-0000-4000-8000-000000000001",
    username: "admin",
    email: "admin@clinic.local",
    password: "admin123",
    full_name: "Operations Director",
    role: "manager",
    specialty: "Clinical Governance & Operations",
    license_number: null,
    active: true,
    createdAt: "2026-01-01",
  },
  {
    id: "staff-2",
    auth_user_id: "00000000-0000-4000-8000-000000000002",
    username: "doctor",
    email: "doctor@clinic.local",
    password: "doctor123",
    full_name: "Dr. Alicia Tan",
    role: "doctor",
    specialty: "General Medicine & Chronic Care",
    license_number: "MMC-48219",
    active: true,
    createdAt: "2026-01-01",
  },
  {
    id: "staff-3",
    auth_user_id: "00000000-0000-4000-8000-000000000003",
    username: "marcus",
    email: "marcus@clinic.local",
    password: "doctor123",
    full_name: "Dr. Marcus Wong",
    role: "doctor",
    specialty: "Pediatrics & Minor Surgery",
    license_number: "MMC-51022",
    active: true,
    createdAt: "2026-01-15",
  },
  {
    id: "staff-4",
    auth_user_id: "00000000-0000-4000-8000-000000000004",
    username: "reception",
    email: "reception@clinic.local",
    password: "reception123",
    full_name: "Sarah Lim",
    role: "receptionist",
    specialty: "Front Desk & Patient Services",
    license_number: null,
    active: true,
    createdAt: "2026-01-10",
  },
  {
    id: "staff-5",
    auth_user_id: "00000000-0000-4000-8000-000000000005",
    username: "nurse",
    email: "nurse@clinic.local",
    password: "nurse123",
    full_name: "Chloe Lim",
    role: "nurse",
    specialty: "Clinical Nursing & Dispensary",
    license_number: "NC-88219",
    active: true,
    createdAt: "2026-01-12",
  },
];

const SEED_PATIENTS: StoredPatient[] = [
  {
    id: "pat-1",
    medicalRecordNumber: "1",
    nric: "880412-10-1234",
    name: "Patricia Koh",
    phone: "+60 12-345 6789",
    email: "patricia.koh@example.com",
    dob: "1988-04-12",
    age: 38,
    gender: "Female",
    nationality: "Malaysian",
    address: "12 Jalan Ampang, 50450 Kuala Lumpur",
    bloodGroup: "O+",
    allergies: [
      { substance: "Penicillin", severity: "SEVERE" },
      { substance: "Aspirin", severity: "MODERATE" },
    ],
    chronicConditions: ["Hypertension", "Borderline HbA1c"],
    createdAt: "2026-01-10T09:00:00Z",
  },
  {
    id: "pat-2",
    medicalRecordNumber: "2",
    nric: "920825-14-1235",
    name: "Marcus Lee Wei Jie",
    phone: "+60 12-876 5432",
    email: "marcus.lee@example.com",
    dob: "1992-08-25",
    age: 34,
    gender: "Male",
    nationality: "Malaysian",
    address: "45 Jalan Bukit Bintang, 55100 Kuala Lumpur",
    bloodGroup: "A+",
    allergies: [],
    chronicConditions: ["Allergic Rhinitis"],
    createdAt: "2026-01-12T10:30:00Z",
  },
  {
    id: "pat-3",
    medicalRecordNumber: "3",
    nric: "751103-10-1237",
    name: "Ahmad Bin Razali",
    phone: "+60 13-234 5678",
    email: "ahmad.razali@example.com",
    dob: "1975-11-03",
    age: 51,
    gender: "Male",
    nationality: "Malaysian",
    address: "88 Jalan Bangsar, 59100 Kuala Lumpur",
    bloodGroup: "B+",
    allergies: [{ substance: "Sulfa Drugs", severity: "MODERATE" }],
    chronicConditions: ["Type 2 Diabetes", "Hyperlipidemia"],
    createdAt: "2026-01-15T11:15:00Z",
  },
  {
    id: "pat-4",
    medicalRecordNumber: "4",
    nric: "960214-10-1246",
    name: "Elena Tan Su-Lyn",
    phone: "+60 14-345 6789",
    email: "elena.tan@example.com",
    dob: "1996-02-14",
    age: 30,
    gender: "Female",
    nationality: "Singaporean",
    address: "10 Mont Kiara, 50480 Kuala Lumpur",
    bloodGroup: "AB+",
    allergies: [],
    chronicConditions: ["Acne Vulgaris"],
    createdAt: "2026-01-18T14:20:00Z",
  },
];

const SEED_ROOMS: StoredConsultationRoom[] = [
  { id: "rm-1", name: "Room 01", practitionerName: "Dr. Alicia Tan", specialty: "Family Medicine & General Practice", isOccupied: false },
  { id: "rm-2", name: "Room 02", practitionerName: "Dr. Marcus Wong", specialty: "Pediatrics & Minor Surgery", isOccupied: false },
  { id: "rm-3", name: "Suite A", practitionerName: "Therapist Chloe Lim", specialty: "Laser & Skin Rejuvenation", isOccupied: false },
];

const SEED_QUEUE: StoredQueueTicket[] = [
  {
    id: "q-1",
    ticketNumber: "Q-101",
    patientId: "pat-1",
    patientName: "Patricia Koh",
    phone: "+60 12-345 6789",
    email: "patricia.koh@example.com",
    status: "WAITING",
    practitionerName: "Dr. Alicia Tan",
    registeredAt: "09:15 AM",
    waitTimeMinutes: 12,
  },
  {
    id: "q-2",
    ticketNumber: "Q-102",
    patientId: "pat-2",
    patientName: "Marcus Lee Wei Jie",
    phone: "+60 12-876 5432",
    email: "marcus.lee@example.com",
    status: "WAITING",
    practitionerName: "Dr. Marcus Wong",
    registeredAt: "09:22 AM",
    waitTimeMinutes: 18,
  },
  {
    id: "q-3",
    ticketNumber: "Q-103",
    patientId: "pat-3",
    patientName: "Ahmad Bin Razali",
    phone: "+60 13-234 5678",
    email: "ahmad.razali@example.com",
    status: "WAITING",
    practitionerName: "Dr. Alicia Tan",
    registeredAt: "09:35 AM",
    waitTimeMinutes: 25,
  },
  {
    id: "q-4",
    ticketNumber: "Q-104",
    patientId: "pat-4",
    patientName: "Elena Tan Su-Lyn",
    phone: "+60 14-345 6789",
    email: "elena.tan@example.com",
    status: "WAITING",
    practitionerName: "Therapist Chloe Lim",
    registeredAt: "09:40 AM",
    waitTimeMinutes: 30,
  },
];

const SEED_INVENTORY: StoredInventoryItem[] = [
  {
    id: "inv-1",
    sku: "MED-AMLO-05",
    name: "Amlodipine Besylate 5mg",
    category: "MEDICATION",
    dosageForm: "Tablet",
    strength: "5mg",
    instructions: "1 tablet once daily in the morning",
    minimumParLevel: 50,
    sellingPrice: 18.0,
    batches: [
      { batchNumber: "B-2025-08A", expiryDate: "2026-12-31", quantity: 120 },
      { batchNumber: "B-2026-02B", expiryDate: "2027-08-31", quantity: 200 },
    ],
  },
  {
    id: "inv-2",
    sku: "MED-AUGM-625",
    name: "Augmentin (Amoxicillin/Clavulanate) 625mg",
    category: "MEDICATION",
    dosageForm: "Tablet",
    strength: "625mg",
    instructions: "1 tablet twice daily after meals",
    minimumParLevel: 30,
    sellingPrice: 35.0,
    batches: [{ batchNumber: "B-2026-01A", expiryDate: "2027-03-31", quantity: 45 }],
  },
  {
    id: "inv-3",
    sku: "MED-PCM-500",
    name: "Paracetamol 500mg",
    category: "MEDICATION",
    dosageForm: "Tablet",
    strength: "500mg",
    instructions: "2 tablets every 6 hours as needed for fever/pain",
    minimumParLevel: 100,
    sellingPrice: 8.0,
    batches: [{ batchNumber: "PCM-2026-03", expiryDate: "2028-05-31", quantity: 250 }],
  },
  {
    id: "inv-4",
    sku: "MED-CET-10",
    name: "Cetirizine Hydrochloride 10mg",
    category: "MEDICATION",
    dosageForm: "Tablet",
    strength: "10mg",
    instructions: "1 tablet once daily at bedtime",
    minimumParLevel: 40,
    sellingPrice: 12.0,
    batches: [{ batchNumber: "CET-2026-09", expiryDate: "2028-02-28", quantity: 80 }],
  },
  {
    id: "inv-5",
    sku: "MED-MET-500",
    name: "Metformin HCl 500mg",
    category: "MEDICATION",
    dosageForm: "Tablet",
    strength: "500mg",
    instructions: "1 tablet twice daily with or after meals",
    minimumParLevel: 60,
    sellingPrice: 15.0,
    batches: [{ batchNumber: "MET-2026-02", expiryDate: "2027-11-30", quantity: 150 }],
  },
  {
    id: "inv-6",
    sku: "MED-OME-20",
    name: "Omeprazole 20mg",
    category: "MEDICATION",
    dosageForm: "Capsule",
    strength: "20mg",
    instructions: "1 capsule once daily before breakfast",
    minimumParLevel: 30,
    sellingPrice: 22.0,
    batches: [{ batchNumber: "OME-2026-04", expiryDate: "2027-10-31", quantity: 60 }],
  },
  {
    id: "inv-7",
    sku: "MED-IBU-400",
    name: "Ibuprofen 400mg",
    category: "MEDICATION",
    dosageForm: "Tablet",
    strength: "400mg",
    instructions: "1 tablet 3 times daily after meals as needed",
    minimumParLevel: 40,
    sellingPrice: 14.0,
    batches: [{ batchNumber: "IBU-2026-01", expiryDate: "2027-12-31", quantity: 90 }],
  },
];

const DEFAULT_ROLE_PERMS: Record<string, string[]> = {
  receptionist: ["register", "ticket", "queue", "patients", "billing", "ledger", "alerts"],
  doctor: ["queue", "consultation", "mc", "referral", "lab", "drugs", "inventory", "alerts"],
  nurse: ["queue", "inventory", "drugs", "alerts"],
  manager: ["register", "ticket", "queue", "patients", "consultation", "mc", "referral", "lab", "inventory", "drugs", "billing", "ledger", "users", "alerts", "permissions", "portal_settings"],
};

const DEFAULT_PORTAL: StoredPortalConfig = {
  portalName: "CLINIC MANAGEMENT SYSTEM",
  portalTagline: "Medical & Healthcare Specialist",
  legalEntityName: "Clinic Management Sdn Bhd",
  branchName: "Main Branch",
  addressLine: "Kuala Lumpur, Malaysia",
};

function initDatabase(): ClinicDatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(content) as Partial<ClinicDatabaseState>;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.staff)) {
        return {
          version: parsed.version ?? 1,
          staff: parsed.staff ?? SEED_STAFF,
          patients: parsed.patients ?? SEED_PATIENTS,
          queue: parsed.queue ?? SEED_QUEUE,
          rooms: parsed.rooms ?? SEED_ROOMS,
          inventory: parsed.inventory ?? SEED_INVENTORY,
          digitalMcs: parsed.digitalMcs ?? [],
          referrals: parsed.referrals ?? [],
          labOrders: parsed.labOrders ?? [],
          portalConfig: parsed.portalConfig ?? DEFAULT_PORTAL,
          rolePermissions: parsed.rolePermissions ?? DEFAULT_ROLE_PERMS,
          updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        };
      }
    } catch (err) {
      console.error("Error reading clinic database, re-initializing:", err);
    }
  }

  const initial: ClinicDatabaseState = {
    version: 1,
    staff: SEED_STAFF,
    patients: SEED_PATIENTS,
    queue: SEED_QUEUE,
    rooms: SEED_ROOMS,
    inventory: SEED_INVENTORY,
    digitalMcs: [],
    referrals: [],
    labOrders: [],
    portalConfig: DEFAULT_PORTAL,
    rolePermissions: DEFAULT_ROLE_PERMS,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write initial clinic database:", err);
  }

  return initial;
}

let memoryDb: ClinicDatabaseState | null = null;

export function getDatabase(): ClinicDatabaseState {
  if (!memoryDb) {
    memoryDb = initDatabase();
  }
  return memoryDb;
}

export function saveDatabase(nextState: Partial<ClinicDatabaseState>): ClinicDatabaseState {
  const current = getDatabase();
  const merged: ClinicDatabaseState = {
    ...current,
    ...nextState,
    updatedAt: new Date().toISOString(),
  };

  memoryDb = merged;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(merged, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error("Failed to persist clinic database to disk:", err);
  }

  return merged;
}

// -------------------------------------------------------------
// Staff & Authentication Helpers
// -------------------------------------------------------------

export function getStaffList(): StoredStaffAccount[] {
  return getDatabase().staff;
}

export function findStaffByIdentifier(identifier: string): StoredStaffAccount | undefined {
  const norm = identifier.trim().toLowerCase();
  return getDatabase().staff.find((s) => {
    return s.username.toLowerCase() === norm || s.email.toLowerCase() === norm;
  });
}

export function registerStaff(params: {
  username?: string;
  email: string;
  password?: string;
  fullName: string;
  role: "doctor" | "receptionist" | "nurse" | "manager";
  specialty?: string;
  licenseNumber?: string;
}): StoredStaffAccount {
  const db = getDatabase();
  const email = params.email.trim();
  const username = (params.username || email.split("@")[0] || `user_${Date.now()}`).trim().toLowerCase();
  const rawPassword = params.password || "clinic123";

  // Check unique username or email
  const existing = db.staff.find(
    (s) => s.username.toLowerCase() === username || s.email.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    throw new Error(`A user with username '${username}' or email '${email}' already exists.`);
  }

  const newStaff: StoredStaffAccount = {
    id: `staff-${Date.now()}`,
    auth_user_id: crypto.randomUUID(),
    username,
    email,
    password: rawPassword,
    full_name: params.fullName.trim(),
    role: params.role,
    specialty: params.specialty?.trim(),
    license_number: params.licenseNumber?.trim() || null,
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const nextStaff = [...db.staff, newStaff];
  let nextRooms = db.rooms;

  // Auto assign room for doctor
  if (params.role === "doctor") {
    const roomNum = db.rooms.length + 1;
    const newRoom: StoredConsultationRoom = {
      id: `rm-${Date.now()}`,
      name: `Room 0${roomNum}`,
      practitionerName: newStaff.full_name,
      specialty: params.specialty?.trim() || "General Practice",
      isOccupied: false,
    };
    nextRooms = [...db.rooms, newRoom];
  }

  saveDatabase({ staff: nextStaff, rooms: nextRooms });
  return newStaff;
}

export function resetStaffPassword(staffId: string, newPassword: string): StoredStaffAccount {
  const db = getDatabase();
  const staff = db.staff.find((s) => s.id === staffId || s.auth_user_id === staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  const updatedStaff = db.staff.map((s) =>
    s.id === staff.id ? { ...s, password: newPassword } : s
  );

  saveDatabase({ staff: updatedStaff });
  return { ...staff, password: newPassword };
}

export function toggleStaffActive(staffId: string, active: boolean): StoredStaffAccount {
  const db = getDatabase();
  const staff = db.staff.find((s) => s.id === staffId || s.auth_user_id === staffId);
  if (!staff) {
    throw new Error("Staff member not found.");
  }

  const updatedStaff = db.staff.map((s) =>
    s.id === staff.id ? { ...s, active } : s
  );

  saveDatabase({ staff: updatedStaff });
  return { ...staff, active };
}
