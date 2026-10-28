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
  | "portal_settings"
  | "database";

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
    "database",
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
  idType?: "nric" | "passport";
  nric: string;
  firstName?: string;
  lastName?: string;
  name: string;
  phone: string;
  countryCode?: string;
  email: string;
  dob: string;
  age: number;
  gender: "Female" | "Male" | "Other" | "Unknown";
  nationality?: string;
  addressLine1?: string;
  addressLine2?: string;
  postcode?: string;
  city?: string;
  state?: string;
  country?: string;
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
  { id: "staff-1", username: "admin", fullName: "Clinic Administrator", email: "admin@clinic.local", role: "manager", specialty: "Clinic Administration & Operations", isActive: true, createdAt: "2026-01-01" },
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

const INITIAL_NOTIFICATIONS: NotificationLogData[] = [];

const INITIAL_PATIENTS: PatientRecord[] = [];

const INITIAL_QUEUE: QueueTicketData[] = [];

const EMPTY_PATIENT: PatientRecord = { id: "", nric: "", name: "No patient selected", phone: "", email: "", dob: "", age: 0, gender: "Unknown", bloodGroup: "", allergies: [], chronicConditions: [] };

interface QueueApiRow {
  id: string;
  patient_id: string;
  ticket_number: string;
  status: string;
  registered_at: string;
  called_at?: string | null;
  room_id?: string | null;
}

function toQueueTicket(row: QueueApiRow, patients: PatientRecord[]): QueueTicketData {
  const patient = patients.find(p => p.id === row.patient_id);
  const statuses: Record<string, QueueTicketData["status"]> = {
    registered: "WAITING", triage_waiting: "WAITING", called_to_room: "CALLED_TO_ROOM",
    in_consultation: "IN_CONSULTATION", dispensary_waiting: "DISPENSARY",
    payment_waiting: "PAYMENT", completed: "COMPLETED", no_show: "COMPLETED",
  };
  return {
    id: row.id, patientId: row.patient_id, ticketNumber: row.ticket_number,
    databaseStatus: row.status, status: statuses[row.status] ?? "WAITING",
    patientName: patient?.name ?? "Unknown patient", phone: patient?.phone ?? "", email: patient?.email ?? "",
    roomId: row.room_id ?? undefined, practitionerName: "Unassigned", registeredAt: row.registered_at,
    calledAt: row.called_at ?? undefined, waitTimeMinutes: 0,
  };
}

export function useClinicStore(isAuthenticated = false, role: Role = "doctor") {
  const demoMode = process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE === "true";
  const [staffList, setStaffList] = useState<StaffUserRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>(INITIAL_PATIENTS);
  const [rooms, setRooms] = useState<ConsultationRoomData[]>([]);
  const [queue, setQueue] = useState<QueueTicketData[]>(INITIAL_QUEUE);
  const [operationalLoadError, setOperationalLoadError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItemData[]>([]);
  const [notifications, setNotifications] = useState<NotificationLogData[]>(INITIAL_NOTIFICATIONS);
  const [digitalMcs, setDigitalMcs] = useState<DigitalMCData[]>([]);
  const [referrals, setReferrals] = useState<ReferralLetterData[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderData[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [portalConfig, setPortalConfig] = useState<ClinicPortalConfig>(DEFAULT_PORTAL_CONFIG);
  const [activePatientId, setActivePatientId] = useState<string>("");

  async function syncToBackend(payload: Record<string, unknown>): Promise<boolean> {
    if (!isAuthenticated || !demoMode) {
      notify("This workflow requires authenticated local demo mode; live persistence is not available.", "error");
      return false;
    }
    try {
      const response = await fetch("/api/clinic-data", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Could not save clinic data.");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save clinic data.", "error");
      return false;
    }
  }

  // Load persistent state from backend API on mount
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (!isAuthenticated) {
        setPatients([]); setQueue([]); setRooms([]); setStaffList([]); setInventory([]);
        setDigitalMcs([]); setReferrals([]); setLabOrders([]); setNotifications([]);
        setOperationalLoadError(null);
        return;
      }
      try {
        if (!demoMode) {
          const responses = await Promise.all([fetch("/api/patients"), fetch("/api/queue"), fetch("/api/rooms"), fetch("/api/staff")]);
          const [patientResult, queueResult, roomResult, staffResult] = await Promise.all(responses.map(response => response.json()));
          if (!responses[0].ok || !patientResult.ok) throw new Error(patientResult.error?.message ?? "Could not load patients.");
          if (!responses[1].ok || !queueResult.ok) throw new Error(queueResult.error?.message ?? "Could not load queue.");
          if (!responses[2].ok || !roomResult.ok) throw new Error(roomResult.error?.message ?? "Could not load rooms.");
          if (!responses[3].ok || !staffResult.ok) throw new Error(staffResult.error?.message ?? "Could not load staff.");
          if (cancelled) return;
          setPatients(patientResult.patients);
          setQueue(queueResult.queue.map((row: QueueApiRow) => toQueueTicket(row, patientResult.patients)));
          setRooms(roomResult.rooms);
          setStaffList(staffResult.staff);
          setOperationalLoadError(null);
          return;
        }
        const response = await fetch("/api/clinic-data");
        const res = await response.json();
        if (!response.ok || !res.ok || !res.data) throw new Error(res.error?.message ?? "Could not load clinic data.");
        if (cancelled) return;

        const d = res.data;
        if (d.patients && Array.isArray(d.patients)) setPatients(d.patients);
        if (d.queue && Array.isArray(d.queue)) {
          setQueue(d.queue.map((t: QueueTicketData) => ({
            ...t,
            waitTimeMinutes: t.waitTimeMinutes ?? 0,
          })));
        }
        if (d.rooms && Array.isArray(d.rooms)) setRooms(d.rooms);
        if (d.staff && Array.isArray(d.staff)) setStaffList(d.staff);
        if (d.inventory && Array.isArray(d.inventory)) setInventory(d.inventory);
        if (d.digitalMcs && Array.isArray(d.digitalMcs)) setDigitalMcs(d.digitalMcs);
        if (d.referrals && Array.isArray(d.referrals)) setReferrals(d.referrals);
        if (d.labOrders && Array.isArray(d.labOrders)) setLabOrders(d.labOrders);
        if (d.portalConfig) setPortalConfig(d.portalConfig);
        if (d.rolePermissions) setRolePermissions(d.rolePermissions as RolePermissions);
        setOperationalLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setOperationalLoadError(err instanceof Error ? err.message : "Could not load clinic data.");
        }
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [isAuthenticated, demoMode]);

  const activePatient = patients.find((p) => p.id === activePatientId) || patients[0] || EMPTY_PATIENT;

  async function toggleRolePermission(targetRole: Role, moduleKey: ModuleKey) {
    if (targetRole === "manager" && moduleKey === "permissions") {
      notify("Admin permissions access cannot be revoked.", "warning");
      return;
    }

    const currentList = rolePermissions[targetRole] || [];
    const has = currentList.includes(moduleKey);
    const updatedList = has
      ? currentList.filter((m) => m !== moduleKey)
      : [...currentList, moduleKey];

    const next = { ...rolePermissions, [targetRole]: updatedList };
    if (!await syncToBackend({ rolePermissions: next })) return;
    setRolePermissions(next);

    const roleDisplayName =
      targetRole === "receptionist"
        ? "Front Desk"
        : targetRole.charAt(0).toUpperCase() + targetRole.slice(1);

    notify(
      `${has ? "Revoked" : "Granted"} access to [${moduleKey}] for ${roleDisplayName}!`,
      has ? "info" : "success"
    );

  }

  async function grantAllRolePermissions(targetRole: Role) {
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
    const next = { ...rolePermissions, [targetRole]: allModules };
    if (!await syncToBackend({ rolePermissions: next })) return;
    setRolePermissions(next);
    notify(`Granted full module access to ${targetRole}!`, "success");
  }

  async function resetDefaultPermissions() {
    if (!await syncToBackend({ rolePermissions: DEFAULT_ROLE_PERMISSIONS })) return;
    setRolePermissions(DEFAULT_ROLE_PERMISSIONS);
    notify("Reset all role access permissions to clinical defaults.", "info");
  }

  function hasAccess(targetRole: Role, moduleKey: ModuleKey): boolean {
    return rolePermissions[targetRole]?.includes(moduleKey) ?? false;
  }

  async function updatePortalConfig(updates: Partial<ClinicPortalConfig>) {
    const next = { ...portalConfig, ...updates };
    if (!await syncToBackend({ portalConfig: next })) return;
    setPortalConfig(next);
    try {
      localStorage.setItem("clinic_portal_config", JSON.stringify(next));
    } catch {}
    notify(`Portal updated: "${updates.portalName || "Settings"}"`, "success");
  }

  async function resetPortalConfig() {
    if (!await syncToBackend({ portalConfig: DEFAULT_PORTAL_CONFIG })) return;
    setPortalConfig(DEFAULT_PORTAL_CONFIG);
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.ticket) {
        throw new Error(payload.error?.message ?? "Could not update queue status.");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not update queue status.", "error");
      return false;
    }
    return true;
  }

  async function callPatientToRoom(ticketId: string, roomId?: string) {
    const ticket = queue.find((t) => t.id === ticketId);
    const room = roomId ? rooms.find((r) => r.id === roomId) : undefined;
    if (!ticket) return;

    if (!await persistQueueTransition(ticket, "CALLED_TO_ROOM", room?.id)) return;

    setQueue((prev) => {
      const next = prev.map((t) =>
        t.id === ticketId
          ? { ...t, status: "CALLED_TO_ROOM" as const, databaseStatus: "called_to_room", roomId: room?.id, roomName: room?.name, calledAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }) }
          : t
      );
      return next;
    });

    if (room) {
      setRooms((prev) => {
        const next = prev.map((r) => r.id === room.id ? { ...r, isOccupied: true, currentTicketNumber: ticket.ticketNumber } : r);
        return next;
      });
    }

    notify(`${ticket.ticketNumber} called${room ? ` to ${room.name}` : ""}.`, "success");
  }

  async function startConsultation(ticketId: string): Promise<boolean> {
    const ticket = queue.find((t) => t.id === ticketId);
    if (!ticket) return false;

    if (!await persistQueueTransition(ticket, "IN_CONSULTATION")) return false;
    setActivePatientId(ticket.patientId);

    setQueue((prev) => {
      const next = prev.map((t) => (t.id === ticketId ? { ...t, status: "IN_CONSULTATION" as const, databaseStatus: "in_consultation" } : t));
      return next;
    });

    notify(`Consultation started for ${ticket.patientName}.`, "info");
    return true;
  }

  async function completeConsultation(ticketId: string) {
    const ticket = queue.find((t) => t.id === ticketId);
    if (!ticket) return;

    if (!await persistQueueTransition(ticket, "DISPENSARY")) return;

    setQueue((prev) => {
      const next = prev.map((t) => (t.id === ticketId ? { ...t, status: "DISPENSARY" as const, databaseStatus: "dispensary_waiting" } : t));
      return next;
    });

    if (ticket.roomId) {
      setRooms((prev) => {
        const next = prev.map((r) =>
          r.id === ticket.roomId
            ? { ...r, isOccupied: false, currentTicketNumber: undefined }
            : r
        );
        return next;
      });
    }
    notify(`Consultation status updated to dispensary for ${ticket.patientName}.`, "success");
  }

  async function issueDigitalMC(params: {
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

    const next = [newMc, ...digitalMcs];
    if (!await syncToBackend({ digitalMcs: next })) return;
    setDigitalMcs(next);

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

  async function issueReferralLetter(params: {
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

    const next = [newRef, ...referrals];
    if (!await syncToBackend({ referrals: next })) return;
    setReferrals(next);

    notify(`Referral Letter #${refNum} for ${targetPatient.name} issued!`, "success");
    return newRef;
  }

  async function issueLabOrder(params: {
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

    const next = [newOrder, ...labOrders];
    if (!await syncToBackend({ labOrders: next })) return;
    setLabOrders(next);

    notify(`Lab Requisition #${orderNum} created (${params.panels.length} panels).`, "success");
    return newOrder;
  }

  async function updateInventoryItem(updated: InventoryItemData) {
    const next = inventory.map((item) => (item.id === updated.id ? updated : item));
    if (!await syncToBackend({ inventory: next })) return;
    setInventory(next);
    notify(`Medicine "${updated.name}" updated in formulary!`, "success");
    return true;
  }

  async function addInventoryItem(newItem: Omit<InventoryItemData, "id">) {
    const created: InventoryItemData = {
      ...newItem,
      id: `inv-${Date.now()}`,
    };
    const next = [created, ...inventory];
    if (!await syncToBackend({ inventory: next })) return;
    setInventory(next);
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
      if (!response.ok || !data.ok || !data.staff) {
        throw new Error(data.error?.message ?? "Failed to register staff user.");
      }
      const newStaff = data.staff as StaffUserRecord;
      setStaffList((prev) => [...prev, newStaff]);
      notify(`Registered ${newStaff.fullName} as ${params.role.toUpperCase()}!`, "success");
      return newStaff;
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to register staff user.", "error");
      return;
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
      if (!response.ok || !data.ok) {
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
      if (!response.ok || !data.ok) {
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

  async function dispenseStockItem(itemId: string, qty: number) {
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;

    if (!Number.isFinite(qty) || qty <= 0) {
      notify("Dispense quantity must be positive and finite.", "error");
      return;
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const totalAvailable = item.batches.filter(b => b.expiryDate >= today).reduce((sum, b) => sum + b.quantity, 0);
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
        if (remainingToDeduct === 0 || batch.quantity === 0 || batch.expiryDate < today) return batch;
        const deduct = Math.min(batch.quantity, remainingToDeduct);
        remainingToDeduct -= deduct;
        return { ...batch, quantity: batch.quantity - deduct };
      })
      .filter((b) => b.quantity > 0);

    const next = inventory.map((i) => (i.id === itemId ? { ...i, batches: updatedBatches } : i));
    if (!await syncToBackend({ inventory: next })) return;
    setInventory(next);

    notify(`Dispensed ${qty} unit(s) of ${item.name} via FEFO order!`, "success");
  }

  async function receiveStockBatch(params: {
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
    if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
      notify("Quantity must be greater than zero.", "error");
      return;
    }

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const expiry = new Date(`${params.expiryDate}T00:00:00Z`);
    if (!params.batchNumber.trim() || !Number.isFinite(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== params.expiryDate || params.expiryDate < today) {
      notify("Enter a batch number and valid unexpired expiry date.", "error");
      return;
    }
    const next = inventory.map((i) => {
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
    if (!await syncToBackend({ inventory: next })) return;
    setInventory(next);

    notify(
      `Stock In: Received ${params.quantity} units of ${item.name} (Batch #${params.batchNumber.trim().toUpperCase()}).`,
      "success"
    );
  }

  async function registerPatient(params: {
    idType?: "nric" | "passport";
    nric: string;
    firstName?: string;
    lastName?: string;
    name: string;
    phone?: string;
    countryCode?: string;
    email: string;
    dob: string;
    gender: "Female" | "Male" | "Other";
    nationality?: string;
    addressLine1?: string;
    addressLine2?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
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
        body: JSON.stringify({ ...params, phone, gender: effectiveGender, medicalRecordNumber: demoMode ? assignedMrn : undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.ok && payload.patient) {
        savedPatient = payload.patient;
      } else {
        throw new Error(payload.error?.message ?? "Registration error");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Patient registration failed.", "error");
      return;
    }

    setPatients((prev) => {
      const next = [savedPatient, ...prev.filter((p) => p.id !== savedPatient.id)];
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
        if (queueRes.ok && qPayload.ok && qPayload.ticket) {
          newTicket = toQueueTicket(qPayload.ticket, [savedPatient]);
        } else {
          throw new Error(qPayload.error?.message ?? "Patient registered, but queue ticket creation failed.");
        }
      } catch (error) {
        notify(error instanceof Error ? error.message : "Patient registered, but queue ticket creation failed.", "error");
        return { patient: savedPatient, ticket: undefined };
      }

      setQueue((prev) => {
        const next = [...prev, newTicket!];
        return next;
      });
    }

    notify(`Registered ${savedPatient.name} (MRN #${savedPatient.medicalRecordNumber})${params.enqueueNow ? ` · Ticket ${newTicket?.ticketNumber} issued.` : ""}`, "success");
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
      if (response.ok && payload.ok && payload.ticket) {
        newTicket = toQueueTicket(payload.ticket, [pat]);
      } else {
        throw new Error(payload.error?.message ?? "Could not issue ticket");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not issue queue ticket.", "error");
      return;
    }

    setQueue((prev) => {
      const next = [...prev, newTicket];
      return next;
    });

    notify(`Queue ticket ${newTicket.ticketNumber} issued for ${pat.name}.`, "success");
    return newTicket;
  }

  return {
    role,
    patients,
    operationalLoadError,
    demoMode,
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
