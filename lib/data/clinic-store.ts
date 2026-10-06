"use client";

import { useEffect, useState } from "react";
import { notify } from "../../components/toast";
import { genderFromMalaysianIc, normalizeMalaysianPhone } from "../../src/domain/MalaysianIc";

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
  | "packages"
  | "inventory"
  | "refill"
  | "billing"
  | "ledger"
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
    "packages",
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
    "packages",
    "refill",
    "alerts",
  ],
  nurse: [
    "queue",
    "packages",
    "inventory",
    "refill",
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
    "packages",
    "inventory",
    "refill",
    "billing",
    "ledger",
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
}

export const DEFAULT_PORTAL_CONFIG: ClinicPortalConfig = {
  portalName: "KUMO CLINIC",
  portalTagline: "Medical & Aesthetic Specialist",
  legalEntityName: "Kumo Clinic Sdn Bhd",
  branchName: "KL Sentral Branch",
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
  bloodGroup: string;
  allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
  chronicConditions: string[];
}

export interface ConsultationRoomData {
  id: string;
  name: string; // e.g. "Room 01"
  practitionerName: string;
  specialty: string;
  isOccupied: boolean;
  currentTicketNumber?: string;
}

export interface QueueTicketData {
  id: string;
  databaseStatus?: string;
  ticketNumber: string; // e.g. "Q-101"
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

export interface TreatmentPackageData {
  id: string;
  patientId: string;
  patientName: string;
  packageName: string;
  totalSessions: number;
  completedSessions: number;
  purchaseDate: string;
  expiryDate: string;
  pricePaid: number;
  history: Array<{
    sessionNumber: number;
    date: string;
    practitionerName: string;
    notes: string;
  }>;
}

export interface InventoryItemData {
  id: string;
  sku: string;
  name: string;
  category: "MEDICATION" | "AESTHETIC_CONSUMABLE" | "SKINCARE_RETAIL";
  minimumParLevel: number;
  sellingPrice: number;
  batches: Array<{
    batchNumber: string;
    expiryDate: string;
    quantity: number;
  }>;
}

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
    nric: "880412-10-1234",
    name: "Patricia Koh",
    phone: "+60 12-345 6789",
    email: "patricia.koh@example.com",
    dob: "1988-04-12",
    age: 38,
    gender: "Female",
    bloodGroup: "O+",
    allergies: [
      { substance: "Penicillin", severity: "SEVERE" },
      { substance: "Aspirin", severity: "MODERATE" },
    ],
    chronicConditions: ["Hypertension", "Borderline HbA1c"],
  },
  {
    id: "pat-2",
    nric: "920825-14-1235",
    name: "Marcus Lee Wei Jie",
    phone: "+60 12-876 5432",
    email: "marcus.lee@example.com",
    dob: "1992-08-25",
    age: 34,
    gender: "Male",
    bloodGroup: "A+",
    allergies: [],
    chronicConditions: ["Allergic Rhinitis"],
  },
  {
    id: "pat-3",
    nric: "751103-10-1237",
    name: "Ahmad Bin Razali",
    phone: "+60 13-234 5678",
    email: "ahmad.razali@example.com",
    dob: "1975-11-03",
    age: 51,
    gender: "Male",
    bloodGroup: "B+",
    allergies: [{ substance: "Sulfa Drugs", severity: "MODERATE" }],
    chronicConditions: ["Type 2 Diabetes", "Hyperlipidemia"],
  },
  {
    id: "pat-4",
    nric: "960214-10-1246",
    name: "Elena Tan Su-Lyn",
    phone: "+60 14-345 6789",
    email: "elena.tan@example.com",
    dob: "1996-02-14",
    age: 30,
    gender: "Female",
    bloodGroup: "AB+",
    allergies: [],
    chronicConditions: ["Acne Vulgaris"],
  },
];

const INITIAL_ROOMS: ConsultationRoomData[] = [
  {
    id: "rm-1",
    name: "Room 01",
    practitionerName: "Dr. Alicia Tan",
    specialty: "Family Medicine & Aesthetics",
    isOccupied: false,
    currentTicketNumber: undefined,
  },
  {
    id: "rm-2",
    name: "Room 02",
    practitionerName: "Dr. Marcus Wong",
    specialty: "Dermatology & Minor Procedures",
    isOccupied: false,
    currentTicketNumber: undefined,
  },
  {
    id: "rm-3",
    name: "Suite A",
    practitionerName: "Therapist Chloe Lim",
    specialty: "Laser & Skin Rejuvenation",
    isOccupied: false,
    currentTicketNumber: undefined,
  },
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

const INITIAL_PACKAGES: TreatmentPackageData[] = [
  {
    id: "pkg-1",
    patientId: "pat-1",
    patientName: "Patricia Koh",
    packageName: "5x Pico Laser Skin Rejuvenation",
    totalSessions: 5,
    completedSessions: 3,
    purchaseDate: "2026-06-15",
    expiryDate: "2027-06-15",
    pricePaid: 1500,
    history: [
      { sessionNumber: 1, date: "2026-06-20", practitionerName: "Dr. Alicia Tan", notes: "Full face 755nm setting, mild erythema post-procedure." },
      { sessionNumber: 2, date: "2026-07-25", practitionerName: "Dr. Alicia Tan", notes: "Cheek pigmentation clearing well, applied cooling peptide mask." },
      { sessionNumber: 3, date: "2026-09-02", practitionerName: "Therapist Chloe Lim", notes: "Tone evening session with hydro-boost ampoule." },
    ],
  },
  {
    id: "pkg-2",
    patientId: "pat-4",
    patientName: "Elena Tan Su-Lyn",
    packageName: "10x Medical Acne Clarifying Facial",
    totalSessions: 10,
    completedSessions: 6,
    purchaseDate: "2026-05-10",
    expiryDate: "2027-05-10",
    pricePaid: 1200,
    history: [
      { sessionNumber: 1, date: "2026-05-15", practitionerName: "Therapist Chloe Lim", notes: "Extraction and salicylic peel." },
      { sessionNumber: 2, date: "2026-06-01", practitionerName: "Therapist Chloe Lim", notes: "Blue light phototherapy session." },
      { sessionNumber: 3, date: "2026-06-22", practitionerName: "Therapist Chloe Lim", notes: "T-zone purifying treatment." },
      { sessionNumber: 4, date: "2026-07-15", practitionerName: "Therapist Chloe Lim", notes: "Soothing seaweed mask applied." },
      { sessionNumber: 5, date: "2026-08-10", practitionerName: "Therapist Chloe Lim", notes: "Mild post-acne mark brightening." },
      { sessionNumber: 6, date: "2026-09-18", practitionerName: "Therapist Chloe Lim", notes: "Hydration booster and pore tightening." },
    ],
  },
];

const INITIAL_INVENTORY: InventoryItemData[] = [
  {
    id: "inv-1",
    sku: "MED-AMLO-05",
    name: "Amlodipine Besylate 5mg",
    category: "MEDICATION",
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
    minimumParLevel: 30,
    sellingPrice: 35.0,
    batches: [
      { batchNumber: "B-2026-01A", expiryDate: "2027-03-31", quantity: 45 },
    ],
  },
  {
    id: "inv-3",
    sku: "AES-BOTOX-100",
    name: "Botox Cosmetic (Allergan) 100U",
    category: "AESTHETIC_CONSUMABLE",
    minimumParLevel: 10,
    sellingPrice: 650.0,
    batches: [
      { batchNumber: "BTX-9018", expiryDate: "2027-04-15", quantity: 14 },
    ],
  },
  {
    id: "inv-4",
    sku: "SKN-HA-SERUM",
    name: "Kumo Advanced Hyaluronic Acid Serum 50ml",
    category: "SKINCARE_RETAIL",
    minimumParLevel: 20,
    sellingPrice: 85.0,
    batches: [
      { batchNumber: "HA-2026-04", expiryDate: "2028-01-31", quantity: 38 },
    ],
  },
];

const INITIAL_NOTIFICATIONS: NotificationLogData[] = [
  {
    id: "notif-1",
    channel: "WHATSAPP",
    template: "BOOKING_CONFIRMATION",
    recipient: "+60 12-345 6789",
    patientName: "Patricia Koh",
    messagePreview: "Confirmed: Follow-up Appointment with Dr. Alicia Tan on Mon 10:00 AM. Location: Kumo Kuala Lumpur Clinic.",
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
  {
    id: "notif-3",
    channel: "WHATSAPP",
    template: "REFILL_REMINDER",
    recipient: "+60 13-234 5678",
    patientName: "Ahmad Bin Razali",
    messagePreview: "Prescription Alert: Your Metformin 500mg supply ends in 3 days. Tap to order repeat dispensing.",
    sentAt: "Yesterday 04:15 PM",
  },
];

const DEMO_MODE = process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE === "true";
const EMPTY_PATIENT: PatientRecord = { id: "", nric: "", name: "No patient selected", phone: "", email: "", dob: "", age: 0, gender: "Unknown", bloodGroup: "", allergies: [], chronicConditions: [] };

export function useClinicStore(isAuthenticated = false) {
  const [role, setRole] = useState<Role>("doctor");
  const [patients, setPatients] = useState<PatientRecord[]>(DEMO_MODE ? INITIAL_PATIENTS : []);
  const [rooms, setRooms] = useState<ConsultationRoomData[]>(DEMO_MODE ? INITIAL_ROOMS : []);
  const [queue, setQueue] = useState<QueueTicketData[]>(DEMO_MODE ? INITIAL_QUEUE : []);
  const [operationalLoadError, setOperationalLoadError] = useState<string | null>(null);
  const [packages, setPackages] = useState<TreatmentPackageData[]>(DEMO_MODE ? INITIAL_PACKAGES : []);
  const [inventory, setInventory] = useState<InventoryItemData[]>(DEMO_MODE ? INITIAL_INVENTORY : []);
  const [notifications, setNotifications] = useState<NotificationLogData[]>(DEMO_MODE ? INITIAL_NOTIFICATIONS : []);
  const [digitalMcs, setDigitalMcs] = useState<DigitalMCData[]>([]);
  const [referrals, setReferrals] = useState<ReferralLetterData[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderData[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);

  useEffect(() => {
    let cancelled = false;
    async function loadOperationalRecords() {
      if (!isAuthenticated || DEMO_MODE) return;
      try {
        const [patientsResponse, queueResponse] = await Promise.all([fetch("/api/patients"), fetch("/api/queue")]);
        if (!patientsResponse.ok || !queueResponse.ok) {
          const failed = !patientsResponse.ok ? patientsResponse : queueResponse;
          const error = await failed.json().catch(() => null) as { error?: { message?: string } } | null;
          throw new Error(error?.error?.message ?? "Could not load patients and queue from the clinic database.");
        }
        const patientPayload = await patientsResponse.json() as { patients: PatientRecord[] };
        const queuePayload = await queueResponse.json() as { queue: Array<{ id: string; patient_id: string; ticket_number: string; status: string; registered_at: string; called_at: string | null; room_id: string | null }> };
        if (cancelled) return;
        setPatients(patientPayload.patients);
        setOperationalLoadError(null);
        setQueue(queuePayload.queue.map((ticket) => {
          const patient = patientPayload.patients.find((item) => item.id === ticket.patient_id);
          const status: QueueTicketData["status"] = ticket.status === "called_to_room" ? "CALLED_TO_ROOM" : ticket.status === "in_consultation" ? "IN_CONSULTATION" : ticket.status === "dispensary_waiting" ? "DISPENSARY" : ticket.status === "payment_waiting" ? "PAYMENT" : ticket.status === "completed" || ticket.status === "no_show" ? "COMPLETED" : "WAITING";
          const registered = new Date(ticket.registered_at);
          return {
            id: ticket.id, ticketNumber: ticket.ticket_number, patientId: ticket.patient_id,
            databaseStatus: ticket.status,
            patientName: patient?.name ?? "Patient", phone: patient?.phone ?? "", email: patient?.email ?? "",
            status, roomId: ticket.room_id ?? undefined, practitionerName: "Unassigned",
            registeredAt: registered.toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
            calledAt: ticket.called_at ? new Date(ticket.called_at).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }) : undefined,
            waitTimeMinutes: Math.max(0, Math.floor((Date.now() - registered.getTime()) / 60000)),
          };
        }));
      } catch (error) {
        if (!cancelled) {
          setPatients([]);
          setQueue([]);
          setOperationalLoadError(error instanceof Error ? error.message : "Could not load clinic records.");
        }
      }
    }
    void loadOperationalRecords();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

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

      const roleDisplayName =
        targetRole === "receptionist"
          ? "Front Desk"
          : targetRole.charAt(0).toUpperCase() + targetRole.slice(1);

      notify(
        `${has ? "Revoked" : "Granted"} access to [${moduleKey}] for ${roleDisplayName}!`,
        has ? "info" : "success"
      );

      return {
        ...prev,
        [targetRole]: updatedList,
      };
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
      "packages",
      "inventory",
      "refill",
      "billing",
      "ledger",
      "alerts",
    ];
    setRolePermissions((prev) => ({
      ...prev,
      [targetRole]: allModules,
    }));
    notify(`Granted full module access to ${targetRole}!`, "success");
  }

  function resetDefaultPermissions() {
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    notify("Reset all role access permissions to clinical defaults.", "info");
  }

  function hasAccess(targetRole: Role, moduleKey: ModuleKey): boolean {
    return rolePermissions[targetRole]?.includes(moduleKey) ?? false;
  }

  // Clinic & Portal Branding Configuration (Editable by Admin)
  const [portalConfig, setPortalConfig] = useState<ClinicPortalConfig>(DEFAULT_PORTAL_CONFIG);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kumo_portal_config");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ClinicPortalConfig>;
        if (parsed && typeof parsed === "object" && parsed.portalName) {
          setPortalConfig((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {}
  }, []);

  function updatePortalConfig(updates: Partial<ClinicPortalConfig>) {
    setPortalConfig((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem("kumo_portal_config", JSON.stringify(next));
      } catch {}
      notify(`Portal updated: "${next.portalName}"`, "success");
      return next;
    });
  }

  function resetPortalConfig() {
    setPortalConfig(DEFAULT_PORTAL_CONFIG);
    try {
      localStorage.removeItem("kumo_portal_config");
    } catch {}
    notify("Portal branding reset to default.", "info");
  }

  // Active consultation patient (defaults to Q-101 Patricia Koh)
  const [activePatientId, setActivePatientId] = useState<string>("pat-1");

  const activePatient = patients.find((p) => p.id === activePatientId) || patients[0] || EMPTY_PATIENT;

  // Actions
  async function persistQueueTransition(ticket: QueueTicketData, status: QueueTicketData["status"], roomId?: string): Promise<boolean> {
    if (DEMO_MODE) return true;
    const response = await fetch("/api/queue", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id, expectedStatus: ticket.databaseStatus ?? ticket.status, status, roomId }),
    });
    const payload = await response.json() as { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? "Could not update queue status.");
    return true;
  }

  async function callPatientToRoom(ticketId: string, roomId?: string) {
    const ticket = queue.find((t) => t.id === ticketId);
    const room = roomId ? rooms.find((r) => r.id === roomId) : undefined;
    if (!ticket) return;
    try {
      await persistQueueTransition(ticket, "CALLED_TO_ROOM", room?.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not call this ticket.", "error");
      return;
    }

    setQueue((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: "CALLED_TO_ROOM", databaseStatus: "called_to_room", roomId: room?.id, roomName: room?.name }
          : t
      )
    );

    if (room) setRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, isOccupied: true, currentTicketNumber: ticket.ticketNumber } : r));

    notify(`${ticket.ticketNumber} marked as called${room ? ` to ${room.name}` : ""}. No WhatsApp message was sent.${DEMO_MODE ? " Demo mode only." : ""}`, "success");
  }

  async function startConsultation(ticketId: string): Promise<boolean> {
    const ticket = queue.find((t) => t.id === ticketId);
    if (ticket) {
      try { await persistQueueTransition(ticket, "IN_CONSULTATION"); }
      catch (error) { notify(error instanceof Error ? error.message : "Could not start consultation.", "error"); return false; }
      setActivePatientId(ticket.patientId);
      setQueue((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: "IN_CONSULTATION", databaseStatus: "in_consultation" } : t))
      );
      notify(`Consultation started for ${ticket.patientName}.${DEMO_MODE ? " Demo mode only." : ""}`, "info");
      return true;
    }
    return false;
  }

  async function completeConsultation(ticketId: string) {
    const ticket = queue.find((t) => t.id === ticketId);
    if (!ticket) return;
    try { await persistQueueTransition(ticket, "DISPENSARY"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not update this consultation.", "error"); return; }

    setQueue((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: "DISPENSARY", databaseStatus: "dispensary_waiting" } : t))
    );

    if (ticket.roomId) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === ticket.roomId
            ? { ...r, isOccupied: false, currentTicketNumber: undefined }
            : r
        )
      );
    }
    notify(`Consultation status updated for ${ticket.patientName}.${DEMO_MODE ? " Demo mode only." : ""}`, "success");
  }

  function issueDigitalMC(params: {
    days: number;
    startDate: string;
    diagnosis: string;
    isDiagnosisRedacted: boolean;
  }) {
    const start = new Date(params.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (params.days - 1));

    const mcNum = `MC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const newMc: DigitalMCData = {
      id: `mc-${Date.now()}`,
      mcNumber: mcNum,
      patientId: activePatient.id,
      patientName: activePatient.name,
      patientNric: activePatient.nric,
      doctorName: "Dr. Alicia Tan",
      licenseNumber: "MMC-DEMO-18293A",
      startDate: params.startDate,
      endDate: end.toISOString().split("T")[0],
      totalDays: params.days,
      diagnosis: params.diagnosis,
      isDiagnosisRedacted: params.isDiagnosisRedacted,
      qrHash: `VERIFY-KUMO-${mcNum}-${crypto.randomUUID()}`,
      issuedAt: new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }),
    };

    setDigitalMcs((prev) => [newMc, ...prev]);

    // Log WhatsApp notification
    const alert: NotificationLogData = {
      id: `notif-${Date.now()}`,
      channel: "WHATSAPP",
      template: "BOOKING_CONFIRMATION",
      recipient: activePatient.phone,
      patientName: activePatient.name,
      messagePreview: `Demo notification preview: Digital MC #${mcNum} for ${params.days} day(s) issued.`,
      sentAt: "Just now",
    };
    setNotifications((prev) => [alert, ...prev]);

    notify(`Demo MC #${mcNum} created. Verification is not configured.`, "info");
    return newMc;
  }

  function issueReferralLetter(params: {
    hospitalOrSpecialty: string;
    urgency: "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY";
    reason: string;
    summary: string;
    medications: string[];
  }) {
    const refNum = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    const newRef: ReferralLetterData = {
      id: `ref-${Date.now()}`,
      referralNumber: refNum,
      patientId: activePatient.id,
      patientName: activePatient.name,
      referringDoctor: "Dr. Alicia Tan",
      targetHospitalOrSpecialty: params.hospitalOrSpecialty,
      urgency: params.urgency,
      reasonForReferral: params.reason,
      clinicalSummary: params.summary,
      medications: params.medications,
      issuedAt: new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }),
    };

    setReferrals((prev) => [newRef, ...prev]);
    notify(`Referral Letter #${refNum} to ${params.hospitalOrSpecialty} compiled!`, "success");
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

    setLabOrders((prev) => [newOrder, ...prev]);
    notify(`Lab Requisition #${orderNum} created (${params.panels.length} panels).`, "success");
    return newOrder;
  }

  function redeemPackageSession(packageId: string, notes: string) {
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;
    if (pkg.completedSessions >= pkg.totalSessions) {
      notify("All sessions for this package have already been redeemed.", "error");
      return;
    }

    const nextSession = pkg.completedSessions + 1;
    const newRecord = {
      sessionNumber: nextSession,
      date: new Date().toISOString().split("T")[0],
      practitionerName: "Therapist Chloe Lim",
      notes: notes || `Session ${nextSession} completed with clinical satisfaction.`,
    };

    setPackages((prev) =>
      prev.map((p) =>
        p.id === packageId
          ? {
              ...p,
              completedSessions: nextSession,
              history: [...p.history, newRecord],
            }
          : p
      )
    );

    notify(`Session ${nextSession}/${pkg.totalSessions} redeemed for ${pkg.patientName}!`, "success");
  }

  function dispenseStockItem(itemId: string, qty: number) {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;

    const totalAvailable = item.batches.reduce((sum, b) => sum + b.quantity, 0);
    if (totalAvailable < qty) {
      notify(`Insufficient stock for ${item.name}. Available: ${totalAvailable}`, "error");
      return;
    }

    // FEFO: Sort by earliest expiry date and deduct
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

    setInventory((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, batches: updatedBatches } : i))
    );

    notify(`Dispensed ${qty} unit(s) of ${item.name} via FEFO order!`, "success");
  }

  function triggerMedicationRefillAlert(patientId: string, medName: string) {
    const pat = patients.find((p) => p.id === patientId);
    if (!pat) return;

    const newAlert: NotificationLogData = {
      id: `notif-${Date.now()}`,
      channel: "WHATSAPP",
      template: "REFILL_REMINDER",
      recipient: pat.phone,
      patientName: pat.name,
      messagePreview: `Refill Reminder: Your supply of ${medName} runs out in 3 days. Tap to confirm delivery.`,
      sentAt: "Just now",
    };

    setNotifications((prev) => [newAlert, ...prev]);
    notify(`Demo refill reminder preview created for ${pat.name}. No message was sent.`, "info");
  }

  async function registerPatient(params: {
    nric: string;
    name: string;
    phone: string;
    email: string;
    dob: string;
    gender: "Female" | "Male";
    bloodGroup: string;
    allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
    chronicConditions: string[];
    enqueueNow: boolean;
    pdpaConsent: boolean;
  }) {
    const normalizedPhone = normalizeMalaysianPhone(params.phone);
    if (!normalizedPhone) {
      throw new Error("Enter a valid Malaysian phone number, such as 012-345 6789.");
    }
    if (DEMO_MODE) {
      const dob = new Date(params.dob);
      const today = new Date();
      const demoPatient: PatientRecord = {
        id: crypto.randomUUID(), medicalRecordNumber: `DEMO-${Date.now()}`, nric: params.nric,
        name: params.name.trim(), phone: normalizedPhone, email: params.email.trim(), dob: params.dob,
        age: Math.max(0, today.getFullYear() - dob.getFullYear() - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)),
        gender: genderFromMalaysianIc(params.nric) ?? params.gender, bloodGroup: params.bloodGroup,
        allergies: params.allergies, chronicConditions: params.chronicConditions,
      };
      setPatients((prev) => [demoPatient, ...prev]);
      let demoTicket: QueueTicketData | undefined;
      if (params.enqueueNow) {
        demoTicket = {
          id: crypto.randomUUID(), ticketNumber: `DEMO-Q-${queue.length + 1}`, patientId: demoPatient.id,
          patientName: demoPatient.name, phone: demoPatient.phone, email: demoPatient.email, status: "WAITING",
          practitionerName: "Unassigned", registeredAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
          waitTimeMinutes: 0,
        };
        setQueue((prev) => [...prev, demoTicket!]);
      }
      notify(`Demo-only patient created: ${demoPatient.name}. This record is not saved to PostgreSQL.`, "info");
      return { patient: demoPatient, ticket: demoTicket };
    }
    const response = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...params, phone: normalizedPhone, gender: genderFromMalaysianIc(params.nric) ?? params.gender }) });
    const payload = await response.json() as { patient?: PatientRecord; error?: { message?: string } };
    if (!response.ok || !payload.patient) throw new Error(payload.error?.message ?? "Patient registration failed.");
    const newPatient = payload.patient;
    setPatients((prev) => [newPatient, ...prev.filter((patient) => patient.id !== newPatient.id)]);

    let newTicket: QueueTicketData | undefined;
    if (params.enqueueNow) {
      const queueResponse = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId: newPatient.id }) });
      const queuePayload = await queueResponse.json() as { ticket?: { id: string; ticket_number: string; status: string; registered_at: string }; error?: { message?: string } };
      if (!queueResponse.ok || !queuePayload.ticket) throw new Error(`Patient saved, but queue ticket was not issued: ${queuePayload.error?.message ?? "request failed"}`);
      const ticketNum = queuePayload.ticket.ticket_number;
      newTicket = {
        id: queuePayload.ticket.id,
        databaseStatus: queuePayload.ticket.status,
        ticketNumber: ticketNum,
        patientId: newPatient.id,
        patientName: newPatient.name,
        phone: newPatient.phone,
        email: newPatient.email,
        status: "WAITING",
        practitionerName: "Unassigned",
        registeredAt: new Date(queuePayload.ticket.registered_at).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
        waitTimeMinutes: (queue.filter((q) => q.status === "WAITING").length + 1) * 10,
      };
      setQueue((prev) => [...prev, newTicket!]);

    }

    notify(`Registered ${newPatient.name}${params.enqueueNow ? ` · ticket ${newTicket?.ticketNumber} issued.` : ""}`, "success");
    return { patient: newPatient, ticket: newTicket };
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

    if (DEMO_MODE) {
      const demoTicket: QueueTicketData = {
        id: crypto.randomUUID(), ticketNumber: `DEMO-Q-${queue.length + 1}`, patientId: pat.id,
        patientName: pat.name, phone: pat.phone, email: pat.email, status: "WAITING",
        practitionerName: "Unassigned", registeredAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
        waitTimeMinutes: 0,
      };
      setQueue((prev) => [...prev, demoTicket]);
      notify(`Demo-only queue ticket ${demoTicket.ticketNumber} created. Not saved to PostgreSQL.`, "info");
      return;
    }

    try {
    const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId }) });
    const payload = await response.json() as { ticket?: { id: string; ticket_number: string; status: string; registered_at: string }; error?: { message?: string } };
    if (!response.ok || !payload.ticket) throw new Error(payload.error?.message ?? "Could not issue queue ticket.");
    const newTicket: QueueTicketData = {
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

    setQueue((prev) => [...prev, newTicket]);

    notify(`Queue ticket ${newTicket.ticketNumber} issued for ${pat.name}. No message was sent.`, "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not issue queue ticket.", "error");
    }
  }

  return {
    role,
    setRole,
    patients,
    operationalLoadError,
    demoMode: DEMO_MODE,
    activePatient,
    setActivePatientId,
    rooms,
    queue,
    packages,
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
    redeemPackageSession,
    dispenseStockItem,
    triggerMedicationRefillAlert,
    registerPatient,
    enqueueExistingPatient,
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
