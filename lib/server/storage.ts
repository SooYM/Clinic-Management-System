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
  idType?: "nric" | "passport";
  nric: string;
  firstName?: string;
  lastName?: string;
  name: string;
  phone: string;
  email: string;
  dob: string;
  age: number;
  gender: "Female" | "Male" | "Other" | "Unknown";
  nationality: string;
  addressLine1?: string;
  addressLine2?: string;
  postcode?: string;
  city?: string;
  state?: string;
  country?: string;
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
    full_name: "Clinic Administrator",
    role: "manager",
    specialty: "Clinic Administration & Operations",
    license_number: null,
    active: true,
    createdAt: "2026-01-01",
  },
];

const SEED_PATIENTS: StoredPatient[] = [];

const SEED_ROOMS: StoredConsultationRoom[] = [
  { id: "rm-1", name: "Room 01", practitionerName: "Unassigned", specialty: "General Practice", isOccupied: false },
  { id: "rm-2", name: "Room 02", practitionerName: "Unassigned", specialty: "General Practice", isOccupied: false },
];

const SEED_QUEUE: StoredQueueTicket[] = [];

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
  manager: ["register", "ticket", "queue", "patients", "consultation", "mc", "referral", "lab", "inventory", "drugs", "billing", "ledger", "users", "alerts", "permissions", "portal_settings", "database"],
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
