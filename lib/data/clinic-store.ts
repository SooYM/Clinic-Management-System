"use client";

import { useEffect, useState } from "react";
import { notify } from "../../components/toast";
import { genderFromMalaysianIc } from "../../src/domain/MalaysianIc";

export type Role = "doctor" | "receptionist" | "nurse" | "manager";

export type ModuleKey =
  | "register"
  | "ticket"
  | "queue"
  | "patients"
  | "consultation"
  | "mc"
  | "referral"
  | "lab"
  | "inventory"
  | "drugs"
  | "billing"
  | "ledger"
  | "users"
  | "alerts"
  | "permissions"
  | "portal_settings";

export type RolePermissions = Record<Role, ModuleKey[]>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  receptionist: [
    "register",
    "ticket",
    "queue",
    "patients",
    "billing",
    "ledger",
    "alerts",
  ],
  doctor: [
    "queue",
    "consultation",
    "mc",
    "referral",
    "lab",
    "drugs",
    "inventory",
    "alerts",
  ],
  nurse: [
    "queue",
    "inventory",
    "drugs",
    "alerts",
  ],
  manager: [
    "register",
    "ticket",
    "queue",
    "patients",
    "consultation",
    "mc",
    "referral",
    "lab",
    "inventory",
    "drugs",
    "billing",
    "ledger",
    "users",
    "alerts",
    "permissions",
    "portal_settings",
  ],
};

export interface ClinicPortalConfig {
  portalName: string;
  portalTagline: string;
  legalEntityName: string;
  branchName: string;
  addressLine: string;
  customDuitNowQrImage?: string;
}

export const DEFAULT_PORTAL_CONFIG: ClinicPortalConfig = {
  portalName: "CLINIC MANAGEMENT SYSTEM",
  portalTagline: "Medical & Healthcare Specialist",
  legalEntityName: "Clinic Management Sdn Bhd",
  branchName: "Main Branch",
  addressLine: "Kuala Lumpur, Malaysia",
};

export interface PatientRecord {
  id: string;
  medicalRecordNumber?: string;
  nric: string;
  name: string;
  phone: string;
  email: string;
  dob: string;
  age: number;
  gender: "Female" | "Male" | "Other" | "Unknown";
  nationality?: string;
  address?: string;
  bloodGroup: string;
  allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
  chronicConditions: string[];
}

export interface ConsultationRoomData {
  id: string;
  name: string;
  practitionerName: string;
  specialty: string;
  isOccupied: boolean;
  currentTicketNumber?: string;
}

export interface QueueTicketData {
  id: string;
  databaseStatus?: string;
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

export interface DigitalMCData {
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

export interface ReferralLetterData {
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

export interface LabOrderData {
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

export interface InventoryBatchData {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface InventoryItemData {
  id: string;
  sku: string;
  name: string;
  category: "MEDICATION" | "AESTHETIC_CONSUMABLE" | "SKINCARE_RETAIL";
  dosageForm?: string;
  strength?: string;
  instructions?: string;
  minimumParLevel: number;
  sellingPrice: number;
  batches: InventoryBatchData[];
}

export interface StaffUserRecord {
  id: string;
  auth_user_id?: string;
  username?: string;
  fullName: string;
  email: string;
  role: Role;
  specialty?: string;
  licenseNumber?: string;
  isActive: boolean;
  createdAt: string;
}

export const INITIAL_STAFF: StaffUserRecord[] = [
  { id: "staff-1", username: "admin", fullName: "Operations Director", email: "admin@clinic.local", role: "manager", specialty: "Clinical Governance & Operations", isActive: true, createdAt: "2026-01-01" },
  { id: "staff-2", username: "doctor", fullName: "Dr. Alicia Tan", email: "doctor@clinic.local", role: "doctor", specialty: "General Medicine & Chronic Care", licenseNumber: "MMC-48219", isActive: true, createdAt: "2026-01-01" },
  { id: "staff-3", username: "marcus", fullName: "Dr. Marcus Wong", email: "marcus@clinic.local", role: "doctor", specialty: "Pediatrics & Minor Surgery", licenseNumber: "MMC-51022", isActive: true, createdAt: "2026-01-15" },
  { id: "staff-4", username: "reception", fullName: "Sarah Lim", email: "reception@clinic.local", role: "receptionist", specialty: "Front Desk & Patient Services", isActive: true, createdAt: "2026-01-10" },
  { id: "staff-5", username: "nurse", fullName: "Chloe Lim", email: "nurse@clinic.local", role: "nurse", specialty: "Clinical Nursing & Dispensary", licenseNumber: "NC-88219", isActive: true, createdAt: "2026-01-12" },
];

export interface NotificationLogData {
  id: string;
  channel: "WHATSAPP" | "EMAIL";
  template: "BOOKING_CONFIRMATION" | "QUEUE_ALERT" | "REFILL_REMINDER";
  recipient: string;
  patientName: string;
  messagePreview: string;
  sentAt: string;
}

const INITIAL_PATIENTS: PatientRecord[] = [
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
  },
];

const INITIAL_ROOMS: ConsultationRoomData[] = [
  { id: "rm-1", name: "Room 01", practitionerName: "Dr. Alicia Tan", specialty: "Family Medicine & General Practice", isOccupied: false },
  { id: "rm-2", name: "Room 02", practitionerName: "Dr. Marcus Wong", specialty: "Pediatrics & Minor Surgery", isOccupied: false },
  { id: "rm-3", name: "Suite A", practitionerName: "Therapist Chloe Lim", specialty: "Laser & Skin Rejuvenation", isOccupied: false },
];

const INITIAL_QUEUE: QueueTicketData[] = [
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

const INITIAL_INVENTORY: InventoryItemData[] = [
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

const INITIAL_NOTIFICATIONS: NotificationLogData[] = [
  {
    id: "notif-1",
    channel: "WHATSAPP",
    template: "BOOKING_CONFIRMATION",
    recipient: "+60 12-345 6789",
    patientName: "Patricia Koh",
    messagePreview: "Confirmed: Follow-up Appointment with Dr. Alicia Tan on Mon 10:00 AM.",
    sentAt: "Today 08:30 AM",
  },
  {
    id: "notif-2",
    channel: "WHATSAPP",
    template: "QUEUE_ALERT",
    recipient: "+60 12-345 6789",
    patientName: "Patricia Koh",
    messagePreview: "You are 2 turns away (Ticket Q-101). Please prepare to enter Consultation Room 01.",
    sentAt: "Today 09:25 AM",
  },
];

const EMPTY_PATIENT: PatientRecord = { id: "", nric: "", name: "No patient selected", phone: "", email: "", dob: "", age: 0, gender: "Unknown", bloodGroup: "", allergies: [], chronicConditions: [] };

function syncToBackend(payload: Record<string, unknown>) {
  fetch("/api/clinic-data", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function useClinicStore(isAuthenticated = false) {
  const [role, setRole] = useState<Role>("doctor");
  const [staffList, setStaffList] = useState<StaffUserRecord[]>(INITIAL_STAFF);
  const [patients, setPatients] = useState<PatientRecord[]>(INITIAL_PATIENTS);
  const [rooms, setRooms] = useState<ConsultationRoomData[]>(INITIAL_ROOMS);
  const [queue, setQueue] = useState<QueueTicketData[]>(INITIAL_QUEUE);
  const [operationalLoadError, setOperationalLoadError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItemData[]>(INITIAL_INVENTORY);
  const [notifications, setNotifications] = useState<NotificationLogData[]>(INITIAL_NOTIFICATIONS);
  const [digitalMcs, setDigitalMcs] = useState<DigitalMCData[]>([]);
  const [referrals, setReferrals] = useState<ReferralLetterData[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderData[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [portalConfig, setPortalConfig] = useState<ClinicPortalConfig>(DEFAULT_PORTAL_CONFIG);
  const [activePatientId, setActivePatientId] = useState<string>("pat-1");

  // Load persistent state from backend API on mount
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const response = await fetch("/api/clinic-data");
        if (!response.ok) return;
        const res = await response.json();
        if (cancelled || !res.ok || !res.data) return;

        const d = res.data;
        if (d.patients && Array.isArray(d.patients) && d.patients.length > 0) setPatients(d.patients);
        if (d.queue && Array.isArray(d.queue)) {
          setQueue(d.queue.map((t: QueueTicketData) => ({
            ...t,
            waitTimeMinutes: t.waitTimeMinutes ?? 0,
          })));
        }
        if (d.rooms && Array.isArray(d.rooms) && d.rooms.length > 0) setRooms(d.rooms);
        if (d.staff && Array.isArray(d.staff) && d.staff.length > 0) setStaffList(d.staff);
        if (d.inventory && Array.isArray(d.inventory) && d.inventory.length > 0) setInventory(d.inventory);
        if (d.digitalMcs && Array.isArray(d.digitalMcs)) setDigitalMcs(d.digitalMcs);
        if (d.referrals && Array.isArray(d.referrals)) setReferrals(d.referrals);
        if (d.labOrders && Array.isArray(d.labOrders)) setLabOrders(d.labOrders);
        if (d.portalConfig) setPortalConfig(d.portalConfig);
        if (d.rolePermissions) setRolePermissions(d.rolePermissions as RolePermissions);
        setOperationalLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setOperationalLoadError(err instanceof Error ? err.message : null);
        }
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const activePatient = patients.find((p) => p.id === activePatientId) || patients[0] || EMPTY_PATIENT;

  function toggleRolePermission(targetRole: Role, moduleKey: ModuleKey) {
    if (targetRole === "manager" && moduleKey === "permissions") {
      notify("Admin permissions access cannot be revoked.", "warning");
      return;
    }

    setRolePermissions((prev) => {
      const currentList = prev[targetRole] || [];
      const has = currentList.includes(moduleKey);
      const updatedList = has
        ? currentList.filter((m) => m !== moduleKey)
        : [...currentList, moduleKey];

      const next = { ...prev, [targetRole]: updatedList };
      syncToBackend({ rolePermissions: next });

      const roleDisplayName =
        targetRole === "receptionist"
          ? "Front Desk"
          : targetRole.charAt(0).toUpperCase() + targetRole.slice(1);

      notify(
        `${has ? "Revoked" : "Granted"} access to [${moduleKey}] for ${roleDisplayName}!`,
        has ? "info" : "success"
      );

      return next;
    });
  }

  function grantAllRolePermissions(targetRole: Role) {
    const allModules: ModuleKey[] = [
      "register",
      "ticket",
      "queue",
      "patients",
      "consultation",
      "mc",
      "referral",
      "lab",
      "inventory",
      "drugs",
      "users",
      "billing",
      "ledger",
      "alerts",
    ];
    setRolePermissions((prev) => {
      const next = { ...prev, [targetRole]: allModules };
      syncToBackend({ rolePermissions: next });
      return next;
    });
    notify(`Granted full module access to ${targetRole}!`, "success");
  }

  function resetDefaultPermissions() {
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    syncToBackend({ rolePermissions: DEFAULT_ROLE_PERMISSIONS });
    notify("Reset all role access permissions to clinical defaults.", "info");
  }

  function hasAccess(targetRole: Role, moduleKey: ModuleKey): boolean {
    return rolePermissions[targetRole]?.includes(moduleKey) ?? false;
  }

  function updatePortalConfig(updates: Partial<ClinicPortalConfig>) {
    setPortalConfig((prev) => {
      const next = { ...prev, ...updates };
      syncToBackend({ portalConfig: next });
      try {
        localStorage.setItem("clinic_portal_config", JSON.stringify(next));
      } catch {}
      return next;
    });
    notify(`Portal updated: "${updates.portalName || "Settings"}"`, "success");
  }

  function resetPortalConfig() {
    setPortalConfig(DEFAULT_PORTAL_CONFIG);
    syncToBackend({ portalConfig: DEFAULT_PORTAL_CONFIG });
    try {
      localStorage.removeItem("clinic_portal_config");
    } catch {}
    notify("Portal branding reset to default.", "info");
  }

  async function persistQueueTransition(ticket: QueueTicketData, status: QueueTicketData["status"], roomId?: string): Promise<boolean> {
    try {
      const response = await fetch("/api/queue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: ticket.id, expectedStatus: ticket.databaseStatus ?? ticket.status, status, roomId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error?.message ?? "Could not update queue status.");
      }
    } catch (err) {
      // Sync locally even if network has issue
      console.warn("Queue API call fallback to local sync", err);
    }
    return true;
  }

  async function callPatientToRoom(ticketId: string, roomId?: string) {
    const ticket = queue.find((t) => t.id === ticketId);
    const room = roomId ? rooms.find((r) => r.id === roomId) : undefined;
    if (!ticket) return;

    await persistQueueTransition(ticket, "CALLED_TO_ROOM", room?.id);

    setQueue((prev) => {
      const next = prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: "CALLED_TO_ROOM" as const, databaseStatus: "called_to_room", roomId: room?.id, roomName: room?.name, calledAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }) }
          : t
      );
      syncToBackend({ queue: next });
      return next;
    });

    if (room) {
      setRooms((prev) => {
        const next = prev.map((r) => r.id === room.id ? { ...r, isOccupied: true, currentTicketNumber: ticket.ticketNumber } : r);
        syncToBackend({ rooms: next });
        return next;
      });
    }

    notify(`${ticket.ticketNumber} called${room ? ` to ${room.name}` : ""}.`, "success");
  }

  async function startConsultation(ticketId: string): Promise<boolean> {
    const ticket = queue.find((t) => t.id === ticketId);
    if (!ticket) return false;

    await persistQueueTransition(ticket, "IN_CONSULTATION");
    setActivePatientId(ticket.patientId);

    setQueue((prev) => {
      const next = prev.map((t) => (t.id === ticketId ? { ...t, status: "IN_CONSULTATION" as const, databaseStatus: "in_consultation" } : t));
      syncToBackend({ queue: next });
      return next;
    });

    notify(`Consultation started for ${ticket.patientName}.`, "info");
    return true;
  }

  async function completeConsultation(ticketId: string) {
    const ticket = queue.find((t) => t.id === ticketId);
    if (!ticket) return;

    await persistQueueTransition(ticket, "DISPENSARY");

    setQueue((prev) => {
      const next = prev.map((t) => (t.id === ticketId ? { ...t, status: "DISPENSARY" as const, databaseStatus: "dispensary_waiting" } : t));
      syncToBackend({ queue: next });
      return next;
    });

    if (ticket.roomId) {
      setRooms((prev) => {
        const next = prev.map((r) =>
          r.id === ticket.roomId
            ? { ...r, isOccupied: false, currentTicketNumber: undefined }
            : r
        );
        syncToBackend({ rooms: next });
        return next;
      });
    }
    notify(`Consultation status updated to dispensary for ${ticket.patientName}.`, "success");
  }

  function issueDigitalMC(params: {
    patientId?: string;
    doctorName?: string;
    days: number;
    startDate: string;
    diagnosis: string;
    isDiagnosisRedacted: boolean;
  }) {
    const targetPatient = params.patientId
      ? (patients.find((p) => p.id === params.patientId) || activePatient)
      : activePatient;
    const docName = params.doctorName || "Dr. Alicia Tan";

    const start = new Date(params.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (params.days - 1));

    const mcNum = `MC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const newMc: DigitalMCData = {
      id: `mc-${Date.now()}`,
      mcNumber: mcNum,
      patientId: targetPatient.id,
      patientName: targetPatient.name,
      patientNric: targetPatient.nric,
      doctorName: docName,
      licenseNumber: "MMC-48219",
      startDate: params.startDate,
      endDate: end.toISOString().split("T")[0],
      totalDays: params.days,
      diagnosis: params.diagnosis,
      isDiagnosisRedacted: params.isDiagnosisRedacted,
      qrHash: `VERIFY-CLINIC-${mcNum}-${crypto.randomUUID()}`,
      issuedAt: new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }),
    };

    setDigitalMcs((prev) => {
      const next = [newMc, ...prev];
      syncToBackend({ digitalMcs: next });
      return next;
    });

    const alert: NotificationLogData = {
      id: `notif-${Date.now()}`,
      channel: "WHATSAPP",
      template: "BOOKING_CONFIRMATION",
      recipient: targetPatient.phone,
      patientName: targetPatient.name,
      messagePreview: `Digital MC #${mcNum} for ${params.days} day(s) issued.`,
      sentAt: "Just now",
    };
    setNotifications((prev) => [alert, ...prev]);

    notify(`Digital MC #${mcNum} for ${targetPatient.name} issued and saved!`, "success");
    return newMc;
  }

  function issueReferralLetter(params: {
    patientId?: string;
    doctorName?: string;
    hospitalOrSpecialty: string;
    urgency: "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY";
    reason: string;
    summary: string;
    medications: string[];
  }) {
    const targetPatient = params.patientId
      ? (patients.find((p) => p.id === params.patientId) || activePatient)
      : activePatient;
    const docName = params.doctorName || "Dr. Alicia Tan";

    const refNum = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    const newRef: ReferralLetterData = {
      id: `ref-${Date.now()}`,
      referralNumber: refNum,
      patientId: targetPatient.id,
      patientName: targetPatient.name,
      referringDoctor: docName,
      targetHospitalOrSpecialty: params.hospitalOrSpecialty,
      urgency: params.urgency,
      reasonForReferral: params.reason,
      clinicalSummary: params.summary,
      medications: params.medications,
      issuedAt: new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }),
    };

    setReferrals((prev) => {
      const next = [newRef, ...prev];
      syncToBackend({ referrals: next });
      return next;
    });

    notify(`Referral Letter #${refNum} for ${targetPatient.name} issued!`, "success");
    return newRef;
  }

  function issueLabOrder(params: {
    panels: string[];
    specimenType: "BLOOD" | "URINE" | "SWAB" | "BIOPSY";
    isFastingRequired: boolean;
    notes: string;
  }) {
    const orderNum = `LAB-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder: LabOrderData = {
      id: `lab-${Date.now()}`,
      orderNumber: orderNum,
      patientId: activePatient.id,
      patientName: activePatient.name,
      orderingDoctor: "Dr. Alicia Tan",
      panels: params.panels,
      specimenType: params.specimenType,
      isFastingRequired: params.isFastingRequired,
      clinicalNotes: params.notes,
      status: "ORDERED",
      issuedAt: new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }),
    };

    setLabOrders((prev) => {
      const next = [newOrder, ...prev];
      syncToBackend({ labOrders: next });
      return next;
    });

    notify(`Lab Requisition #${orderNum} created (${params.panels.length} panels).`, "success");
    return newOrder;
  }

  function updateInventoryItem(updated: InventoryItemData) {
    setInventory((prev) => {
      const next = prev.map((item) => (item.id === updated.id ? updated : item));
      syncToBackend({ inventory: next });
      return next;
    });
    notify(`Medicine "${updated.name}" updated in formulary!`, "success");
  }

  function addInventoryItem(newItem: Omit<InventoryItemData, "id">) {
    const created: InventoryItemData = {
      ...newItem,
      id: `inv-${Date.now()}`,
    };
    setInventory((prev) => {
      const next = [created, ...prev];
      syncToBackend({ inventory: next });
      return next;
    });
    notify(`New drug "${created.name}" added to formulary!`, "success");
    return created;
  }

  async function registerStaffUser(params: {
    username?: string;
    fullName: string;
    email: string;
    password?: string;
    role: Role;
    specialty?: string;
    licenseNumber?: string;
  }) {
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Failed to register staff user.");
      }
      const newStaff = data.staff;
      setStaffList((prev) => [...prev, newStaff]);
      if (params.role === "doctor") {
        const nextRoom = rooms.length + 1;
        const newRoom: ConsultationRoomData = {
          id: `rm-${Date.now()}`,
          name: `Room 0${nextRoom}`,
          practitionerName: params.fullName.trim(),
          specialty: params.specialty?.trim() || "General Practice",
          isOccupied: false,
        };
        setRooms((prev) => [...prev, newRoom]);
      }
      notify(`Registered ${newStaff.fullName} as ${params.role.toUpperCase()}!`, "success");
      return newStaff;
    } catch (err) {
      // Fallback local registration
      const newStaff: StaffUserRecord = {
        id: `staff-${Date.now()}`,
        username: params.username || params.email.split("@")[0],
        fullName: params.fullName.trim(),
        email: params.email.trim(),
        role: params.role,
        specialty: params.specialty?.trim(),
        licenseNumber: params.licenseNumber?.trim(),
        isActive: true,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setStaffList((prev) => {
        const next = [...prev, newStaff];
        syncToBackend({ staff: next });
        return next;
      });
      notify(`Registered ${newStaff.fullName} as ${params.role.toUpperCase()}!`, "success");
      return newStaff;
    }
  }

  async function resetStaffUserPassword(staffId: string, newPassword: string) {
    try {
      const response = await fetch(`/api/staff/${staffId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Could not reset password.");
      }
      notify(`Password reset successfully.`, "success");
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Password reset failed.", "error");
      return false;
    }
  }

  async function toggleStaffStatus(staffId: string, active: boolean) {
    try {
      const response = await fetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message ?? "Could not change status.");
      }
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, isActive: active } : s))
      );
      notify(`Staff access ${active ? "restored" : "revoked"}.`, "success");
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Status update failed.", "error");
      return false;
    }
  }

  function addDoctor(params: { name: string; specialty: string; licenseNumber: string }) {
    return registerStaffUser({
      fullName: params.name,
      email: `${params.name.toLowerCase().replace(/[^a-z0-9]/g, "")}@clinic.com`,
      role: "doctor",
      specialty: params.specialty,
      licenseNumber: params.licenseNumber,
    });
  }

  function dispenseStockItem(itemId: string, qty: number) {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;

    const totalAvailable = item.batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      notify(`Insufficient stock for ${item.name}. Available: ${totalAvailable}`, "error");
      return;
    }

    const sortedBatches = [...item.batches].sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    );

    let remainingToDeduct = qty;
    const updatedBatches = sortedBatches
      .map((batch) => {
        if (remainingToDeduct === 0 || batch.quantity === 0) return batch;
        const deduct = Math.min(batch.quantity, remainingToDeduct);
        remainingToDeduct -= deduct;
        return { ...batch, quantity: batch.quantity - deduct };
      })
      .filter((b) => b.quantity > 0);

    setInventory((prev) => {
      const next = prev.map((i) => (i.id === itemId ? { ...i, batches: updatedBatches } : i));
      syncToBackend({ inventory: next });
      return next;
    });

    notify(`Dispensed ${qty} unit(s) of ${item.name} via FEFO order!`, "success");
  }

  function receiveStockBatch(params: {
    itemId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    supplier?: string;
  }) {
    const item = inventory.find((i) => i.id === params.itemId);
    if (!item) {
      notify("Inventory item not found.", "error");
      return;
    }
    if (params.quantity <= 0) {
      notify("Quantity must be greater than zero.", "error");
      return;
    }

    setInventory((prev) => {
      const next = prev.map((i) => {
        if (i.id !== params.itemId) return i;
        const existingBatchIndex = i.batches.findIndex(
          (b) => b.batchNumber.toLowerCase() === params.batchNumber.trim().toLowerCase()
        );
        let nextBatches: InventoryBatchData[];
        if (existingBatchIndex >= 0) {
          nextBatches = i.batches.map((b, idx) =>
            idx === existingBatchIndex
              ? { ...b, quantity: b.quantity + params.quantity, expiryDate: params.expiryDate || b.expiryDate }
              : b
          );
        } else {
          const newBatch: InventoryBatchData = {
            batchNumber: params.batchNumber.trim().toUpperCase(),
            expiryDate: params.expiryDate,
            quantity: params.quantity,
          };
          nextBatches = [...i.batches, newBatch];
        }
        return { ...i, batches: nextBatches };
      });
      syncToBackend({ inventory: next });
      return next;
    });

    notify(
      `Stock In: Received ${params.quantity} units of ${item.name} (Batch #${params.batchNumber.trim().toUpperCase()}).`,
      "success"
    );
  }

  async function registerPatient(params: {
    idType?: "nric" | "passport";
    nric: string;
    name: string;
    phone?: string;
    countryCode?: string;
    email: string;
    dob: string;
    gender: "Female" | "Male" | "Other";
    nationality?: string;
    address?: string;
    bloodGroup: string;
    allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
    chronicConditions: string[];
    enqueueNow: boolean;
    pdpaConsent: boolean;
  }) {
    const rawPhone = (params.phone || "").trim();
    const phone = rawPhone
      ? (params.countryCode && !rawPhone.startsWith("+") ? `${params.countryCode} ${rawPhone}` : rawPhone)
      : "";
    const isNric = params.idType !== "passport";
    const effectiveGender = (isNric ? (genderFromMalaysianIc(params.nric) as "Female" | "Male" | undefined) : null) ?? params.gender;

    const existingNumericMrns = patients
      .map((p) => parseInt(p.medicalRecordNumber || "0", 10))
      .filter((n) => !isNaN(n) && n > 0);
    const nextMrn = existingNumericMrns.length > 0 ? Math.max(...existingNumericMrns) + 1 : patients.length + 1;
    const assignedMrn = String(nextMrn);

    let savedPatient: PatientRecord;
    try {
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, phone, gender: effectiveGender, medicalRecordNumber: assignedMrn }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.patient) {
        savedPatient = {
          ...payload.patient,
          medicalRecordNumber: payload.patient.medicalRecordNumber || assignedMrn,
          nationality: params.nationality || payload.patient.nationality,
          address: params.address || payload.patient.address,
        };
      } else {
        throw new Error(payload.error?.message ?? "Registration error");
      }
    } catch {
      // Local persistent fallback
      const dob = params.dob ? new Date(params.dob) : null;
      const today = new Date();
      const calculatedAge = dob && !isNaN(dob.getTime())
        ? Math.max(0, today.getFullYear() - dob.getFullYear() - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0))
        : 0;

      savedPatient = {
        id: crypto.randomUUID(),
        medicalRecordNumber: assignedMrn,
        nric: params.nric,
        name: params.name.trim(),
        phone: phone || "—",
        email: params.email.trim(),
        dob: params.dob,
        age: calculatedAge,
        gender: effectiveGender,
        nationality: params.nationality || (isNric ? "Malaysian" : "Foreign"),
        address: params.address?.trim() || "—",
        bloodGroup: params.bloodGroup,
        allergies: params.allergies,
        chronicConditions: params.chronicConditions,
      };
    }

    setPatients((prev) => {
      const next = [savedPatient, ...prev.filter((p) => p.id !== savedPatient.id)];
      syncToBackend({ patients: next });
      return next;
    });

    let newTicket: QueueTicketData | undefined;
    if (params.enqueueNow) {
      try {
        const queueRes = await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: savedPatient.id }),
        });
        const qPayload = await queueRes.json().catch(() => ({}));
        if (queueRes.ok && qPayload.ticket) {
          newTicket = {
            id: qPayload.ticket.id,
            databaseStatus: qPayload.ticket.status,
            ticketNumber: qPayload.ticket.ticket_number,
            patientId: savedPatient.id,
            patientName: savedPatient.name,
            phone: savedPatient.phone,
            email: savedPatient.email,
            status: "WAITING",
            practitionerName: "Unassigned",
            registeredAt: new Date(qPayload.ticket.registered_at).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
            waitTimeMinutes: (queue.filter((q) => q.status === "WAITING").length + 1) * 10,
          };
        } else {
          throw new Error("Queue creation failed");
        }
      } catch {
        newTicket = {
          id: crypto.randomUUID(),
          ticketNumber: `Q-${queue.length + 101}`,
          patientId: savedPatient.id,
          patientName: savedPatient.name,
          phone: savedPatient.phone,
          email: savedPatient.email,
          status: "WAITING",
          practitionerName: "Unassigned",
          registeredAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
          waitTimeMinutes: (queue.filter((q) => q.status === "WAITING").length + 1) * 10,
        };
      }

      setQueue((prev) => {
        const next = [...prev, newTicket!];
        syncToBackend({ queue: next });
        return next;
      });
    }

    notify(`Registered ${savedPatient.name} (MRN #${assignedMrn})${params.enqueueNow ? ` · Ticket ${newTicket?.ticketNumber} issued.` : ""}`, "success");
    return { patient: savedPatient, ticket: newTicket };
  }

  async function enqueueExistingPatient(patientId: string) {
    const pat = patients.find((p) => p.id === patientId);
    if (!pat) return;

    const isAlreadyInQueue = queue.some(
      (q) =>
        q.patientId === patientId &&
        (q.status === "WAITING" || q.status === "CALLED_TO_ROOM" || q.status === "IN_CONSULTATION" || q.status === "DISPENSARY" || q.status === "PAYMENT")
    );
    if (isAlreadyInQueue) {
      notify(`${pat.name} is already currently in queue!`, "warning");
      return;
    }

    let newTicket: QueueTicketData;
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ticket) {
        newTicket = {
          id: payload.ticket.id,
          databaseStatus: payload.ticket.status,
          ticketNumber: payload.ticket.ticket_number,
          patientId: pat.id,
          patientName: pat.name,
          phone: pat.phone,
          email: pat.email,
          status: "WAITING",
          practitionerName: "Unassigned",
          registeredAt: new Date(payload.ticket.registered_at).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
          waitTimeMinutes: (queue.filter((q) => q.status === "WAITING").length + 1) * 10,
        };
      } else {
        throw new Error("Could not issue ticket");
      }
    } catch {
      newTicket = {
        id: crypto.randomUUID(),
        ticketNumber: `Q-${queue.length + 101}`,
        patientId: pat.id,
        patientName: pat.name,
        phone: pat.phone,
        email: pat.email,
        status: "WAITING",
        practitionerName: "Unassigned",
        registeredAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
        waitTimeMinutes: (queue.filter((q) => q.status === "WAITING").length + 1) * 10,
      };
    }

    setQueue((prev) => {
      const next = [...prev, newTicket];
      syncToBackend({ queue: next });
      return next;
    });

    notify(`Queue ticket ${newTicket.ticketNumber} issued for ${pat.name}.`, "success");
  }

  return {
    role,
    setRole,
    patients,
    operationalLoadError,
    demoMode: false,
    activePatient,
    setActivePatientId,
    rooms,
    queue,
    inventory,
    notifications,
    digitalMcs,
    referrals,
    labOrders,
    callPatientToRoom,
    startConsultation,
    completeConsultation,
    issueDigitalMC,
    issueReferralLetter,
    issueLabOrder,
    dispenseStockItem,
    receiveStockBatch,
    updateInventoryItem,
    addInventoryItem,
    registerPatient,
    enqueueExistingPatient,
    staffList,
    registerStaffUser,
    resetStaffUserPassword,
    toggleStaffStatus,
    addDoctor,
    rolePermissions,
    toggleRolePermission,
    grantAllRolePermissions,
    resetDefaultPermissions,
    hasAccess,
    portalConfig,
    updatePortalConfig,
    resetPortalConfig,
  };
}
