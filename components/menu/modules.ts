import {
  UserPlus,
  Ticket,
  Users,
  Contact,
  Stethoscope,
  FileCheck2,
  Building2,
  FlaskConical,
  Sparkles,
  Pill,
  BellRing,
  CreditCard,
  Coins,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type Hue = "blue" | "teal" | "amber" | "slate";
export type GroupId = "frontdesk" | "clinical" | "treatment" | "finance";

export interface MenuGroup {
  id: GroupId;
  label: string;
  hue: Hue;
  blurb: string;
}

export const GROUPS: MenuGroup[] = [
  {
    id: "frontdesk",
    label: "Front Desk & Reception",
    hue: "blue",
    blurb: "Patient registration, waiting room queue & master directory",
  },
  {
    id: "clinical",
    label: "Consultation & Clinical",
    hue: "teal",
    blurb: "Doctor EMR charting, Digital MCs, referrals & lab orders",
  },
  {
    id: "treatment",
    label: "Treatment & Pharmacy",
    hue: "amber",
    blurb: "Prepaid aesthetic punch-cards & FEFO inventory dispensing",
  },
  {
    id: "finance",
    label: "Billing & Administration",
    hue: "slate",
    blurb: "Multi-rail checkout, practitioner commissions & WhatsApp logs",
  },
];

export type RoleType = "receptionist" | "doctor" | "nurse" | "manager";

export interface MenuItem {
  key: string;
  group: GroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  shortcut: string;
  actionType: "route" | "modal" | "refill";
  routeTarget?: "queue" | "patients" | "consultation" | "documents" | "packages" | "inventory" | "billing";
  modalTarget?: "register" | "ticket" | "mc" | "referral" | "lab" | "alerts" | "permissions";
  allowedRoles?: RoleType[];
  adminOnly?: boolean;
}

export const MENU: MenuItem[] = [
  // Front Desk
  {
    key: "register",
    group: "frontdesk",
    label: "Register Patient",
    description: "New patient enrollment & queue ticket",
    icon: UserPlus,
    shortcut: "1",
    actionType: "modal",
    modalTarget: "register",
  },
  {
    key: "ticket",
    group: "frontdesk",
    label: "Issue Queue Ticket",
    description: "Check-in returning patient to waiting room",
    icon: Ticket,
    shortcut: "2",
    actionType: "modal",
    modalTarget: "ticket",
  },
  {
    key: "queue",
    group: "frontdesk",
    label: "Live Queue & Rooms",
    description: "Real-time waiting room & doctor dispatch",
    icon: Users,
    shortcut: "3",
    actionType: "route",
    routeTarget: "queue",
  },
  {
    key: "patients",
    group: "frontdesk",
    label: "Patient Directory",
    description: "Search medical files, NRIC & allergies",
    icon: Contact,
    shortcut: "4",
    actionType: "route",
    routeTarget: "patients",
    allowedRoles: ["receptionist", "manager"],
  },

  // Clinical
  {
    key: "consultation",
    group: "clinical",
    label: "Doctor EMR Charting",
    description: "SOAP notes, vitals & ICD-10 diagnosis",
    icon: Stethoscope,
    shortcut: "5",
    actionType: "route",
    routeTarget: "consultation",
    allowedRoles: ["doctor", "manager"],
  },
  {
    key: "mc",
    group: "clinical",
    label: "Digital Medical Cert",
    description: "DigiMC QR-verified employer certificate",
    icon: FileCheck2,
    shortcut: "6",
    actionType: "modal",
    modalTarget: "mc",
    allowedRoles: ["doctor", "manager"],
  },
  {
    key: "referral",
    group: "clinical",
    label: "Hospital Referral",
    description: "Outbound specialist referral letter",
    icon: Building2,
    shortcut: "7",
    actionType: "modal",
    modalTarget: "referral",
    allowedRoles: ["doctor", "manager"],
  },
  {
    key: "lab",
    group: "clinical",
    label: "Lab Requisition",
    description: "Blood panels & pathology investigation",
    icon: FlaskConical,
    shortcut: "8",
    actionType: "modal",
    modalTarget: "lab",
    allowedRoles: ["doctor", "manager"],
  },

  // Treatment & Pharmacy
  {
    key: "packages",
    group: "treatment",
    label: "Treatment Packages",
    description: "Kumo prepaid punch-cards & sessions",
    icon: Sparkles,
    shortcut: "9",
    actionType: "route",
    routeTarget: "packages",
  },
  {
    key: "inventory",
    group: "treatment",
    label: "Pharmacy FEFO Stock",
    description: "First-Expiry-First-Out batch dispensation",
    icon: Pill,
    shortcut: "0",
    actionType: "route",
    routeTarget: "inventory",
    allowedRoles: ["nurse", "manager"],
  },
  {
    key: "refill",
    group: "treatment",
    label: "3-Day Refill Alert",
    description: "Simulate automated WhatsApp refill alert",
    icon: BellRing,
    shortcut: "R",
    actionType: "refill",
  },

  // Billing & Admin
  {
    key: "billing",
    group: "finance",
    label: "POS Billing & Checkout",
    description: "Split payments, Cash, Card, QR & Insurance",
    icon: CreditCard,
    shortcut: "C",
    actionType: "route",
    routeTarget: "billing",
    allowedRoles: ["receptionist", "manager"],
  },
  {
    key: "ledger",
    group: "finance",
    label: "Commission Ledger",
    description: "Real-time doctor & therapist split revenue",
    icon: Coins,
    shortcut: "L",
    actionType: "route",
    routeTarget: "billing",
    allowedRoles: ["receptionist", "manager"],
  },
  {
    key: "alerts",
    group: "finance",
    label: "WhatsApp Alert Logs",
    description: "Delivery status for bookings & queue bumps",
    icon: MessageSquare,
    shortcut: "W",
    actionType: "modal",
    modalTarget: "alerts",
  },
  {
    key: "permissions",
    group: "finance",
    label: "Role Access Control",
    description: "Custom role permissions for Front Desk, Doctor & Nurse",
    icon: ShieldCheck,
    shortcut: "A",
    actionType: "modal",
    modalTarget: "permissions",
    allowedRoles: ["manager"],
    adminOnly: true,
  },
];
