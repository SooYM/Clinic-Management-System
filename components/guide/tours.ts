export interface GuideStep {
  /** value of a data-guide attribute; omitted = centred card with no highlight */
  target?: string;
  /** short name: shown as "Step 2 of 7 · {label}" and on the tag pinned to the highlighted element */
  label: string;
  /** one or two short sentences */
  body: string;
}

export type TourId =
  | "menu"
  | "queue"
  | "patients"
  | "consultation"
  | "inventory"
  | "billing"
  | "ledger"
  | "packages";

/**
 * Top bar items available across module screens.
 */
const TOP_BAR: GuideStep[] = [
  {
    target: "back-menu",
    label: "Back to Main Menu",
    body: "Returns to the Main Menu from any screen. On a keyboard, press Esc when not typing.",
  },
  {
    target: "breadcrumb",
    label: "Current Screen",
    body: "Displays the active clinic module and clinical navigation path.",
  },
  {
    target: "guide-btn",
    label: "Interactive Guide",
    body: "Reopens the interactive coachmark guide for the screen you are currently on. Press ? anytime.",
  },
  {
    target: "user-role-select",
    label: "Staff Role Switcher",
    body: "Switch between Receptionist, Doctor, Nurse, and Clinic Manager roles to test role-based access.",
  },
];

export const TOURS: Record<TourId, GuideStep[]> = {
  menu: [
    {
      label: "Welcome to Clinical Management System",
      body: "This interactive guide walks you through every station of clinical operations. Use Next and Back, or Skip to close. Reopen anytime with the Guide button or ? key.",
    },
    {
      target: "group-frontdesk",
      label: "Front Desk & Reception",
      body: "Enroll new patients with MyKad or foreign passports, issue queue tickets, and manage the patient directory.",
    },
    {
      target: "group-clinical",
      label: "Consultation & Clinical",
      body: "Doctor EMR SOAP charting, digital medical certificates (MC) with QR verification, specialist referrals, and lab tests.",
    },
    {
      target: "group-treatment",
      label: "Treatment & Pharmacy",
      body: "Prepaid aesthetic punch-cards, First-Expiry-First-Out (FEFO) dispensary inventory, batch receiving, and master drug formulary.",
    },
    {
      target: "group-finance",
      label: "Billing & Administration",
      body: "Multi-rail cashier POS (Card, Cash, DuitNow QR, Insurance), practitioner commission split ledger, and clinic branding settings.",
    },
    {
      target: "menu-shortcuts",
      label: "Keyboard Shortcuts",
      body: "Press the number or letter key shown on any tile to jump directly into that module without touching the mouse.",
    },
    {
      target: "guide-btn",
      label: "User Guide",
      body: "Opens this interactive guide at any time. Every module has its own tailored guide.",
    },
    {
      target: "user-role-select",
      label: "Role-Based Access Control",
      body: "Switch roles between Doctor, Front Desk, Nurse, and Manager. Features your role cannot access are hidden automatically.",
    },
  ],
  queue: [
    {
      target: "queue-actions",
      label: "Queue Dispatch Actions",
      body: "Register a walk-in patient, check-in a returning patient from directory, or jump directly to POS checkout.",
    },
    {
      target: "queue-table",
      label: "Waiting Room & Rooms",
      body: "Live waiting room list. Call the next patient, reassign consultation rooms, or send completed patients to dispensary.",
    },
    ...TOP_BAR,
  ],
  patients: [
    {
      target: "patient-search",
      label: "Patient Directory Search",
      body: "Instantly find patient files by full name, phone number, medical record number (MRN), or national ID.",
    },
    {
      target: "patient-register",
      label: "Register Patient",
      body: "Add a new patient with MyKad IC or foreign passport, optional phone with international country code, allergies, and PDPA consent.",
    },
    {
      target: "patient-table",
      label: "Patient Medical Records",
      body: "View allergy alerts, issue a queue ticket directly with one click, or open the patient chart.",
    },
    ...TOP_BAR,
  ],
  consultation: [
    {
      target: "emr-patient",
      label: "Active Patient Profile",
      body: "Shows current patient demographics, allergies, known conditions, and assigned room.",
    },
    {
      target: "emr-soap",
      label: "SOAP EMR Clinical Notes",
      body: "Document Subjective complaints, Objective vital signs, Assessment diagnosis, and clinical Plan.",
    },
    {
      target: "emr-actions",
      label: "Clinical Directives",
      body: "Prescribe medications, issue Digital MCs, generate specialist hospital referrals, or requisition laboratory panels.",
    },
    ...TOP_BAR,
  ],
  inventory: [
    {
      target: "stock-receive-btn",
      label: "Stock In / Receive Goods",
      body: "Record new incoming stock batches with supplier info, batch number, expiry date, and quantity received.",
    },
    {
      target: "stock-table",
      label: "FEFO Inventory Engine",
      body: "Tracks stock batches ordered by earliest expiry date first to prevent delivering expired medications to patients.",
    },
    ...TOP_BAR,
  ],
  billing: [
    {
      target: "billing-bill",
      label: "Patient Consultation Invoice",
      body: "Consolidated bill breakdown including doctor consultation fee, dispensed medications, and prepaid package credits.",
    },
    {
      target: "billing-rails",
      label: "Payment Rails",
      body: "Accept credit card, cash, insurance panel, or display your clinic's uploaded DuitNow QR code.",
    },
    {
      target: "billing-receipts",
      label: "Receipt Log",
      body: "Review, print, or download official clinic receipts with itemized tax and payment verification QR codes.",
    },
    ...TOP_BAR,
  ],
  ledger: [
    {
      target: "ledger-overview",
      label: "Practitioner Commission Ledger",
      body: "Automated revenue attribution for doctors and aesthetic therapists based on consultation shares and procedural commissions.",
    },
    ...TOP_BAR,
  ],
  packages: [
    {
      target: "packages-list",
      label: "Treatment Package Punch-Cards",
      body: "Prepaid aesthetic courses (e.g. 5x Pico Laser, 10x Facials) with session tracking and one-click redemption.",
    },
    ...TOP_BAR,
  ],
};
