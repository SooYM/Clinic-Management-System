"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CircleHelp, ChevronRight, ShieldCheck, Building2, Pencil, Users, Plus, Trash2, Edit3, Check, Stethoscope, Pill } from "lucide-react";
import { useClinicStore, type Role, type ModuleKey, type InventoryItemData } from "../lib/data/clinic-store";
import { Modal } from "../components/Modal";
import { notify } from "../components/toast";
import { useSession } from "../lib/state/session";
import { LoginPage } from "../components/auth/LoginPage";
import { MainMenu } from "../components/menu/MainMenu";
import { GuideModal } from "../components/menu/GuideModal";
import { RolePermissionsModal } from "../components/menu/RolePermissionsModal";
import { PortalSettingsModal } from "../components/menu/PortalSettingsModal";
import { UserManagementModal } from "../components/menu/UserManagementModal";
import { AddDrugModal } from "../components/menu/AddDrugModal";
import { type MenuItem } from "../components/menu/modules";
import { QrCode } from "../components/QrCode";
import { genderFromMalaysianIc, normalizeMalaysianPhone } from "../src/domain/MalaysianIc";
import { ClinicDocumentPrintView } from "../components/documents/ClinicDocumentPrintView";
import { documentFromLabOrder, documentFromMC, documentFromReferral } from "../components/documents/fromClinicRecords";
import { createClinicDocumentArtifact, regenerateClinicDocumentArtifact } from "../components/documents";
import type { ClinicDocumentArtifact, DocumentPrintRecord } from "../components/documents/types";
import { GuideProvider, useGuide, useFirstLoginGuide } from "../components/guide/GuideProvider";

interface PrescribedDrugItem {
  id: string;
  name: string;
  frequency: string;
  timing: string;
  quantity: string;
  remarks?: string;
}

import {
  NATIONALITIES,
  COUNTRY_CODES as WORLD_COUNTRY_CODES,
  DOSING_FREQUENCIES,
  MEAL_TIMINGS,
  BLOOD_GROUPS,
  MEDICAL_SPECIALTIES,
} from "../lib/config/dropdown-options";

type Tab = "menu" | "queue" | "patients" | "consultation" | "documents" | "inventory" | "billing";

export default function ClinicDashboard() {
  const { user, isLoaded } = useSession();

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-[var(--muted)]">Loading Clinic Session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <GuideProvider username={user.username}>
      <ClinicDashboardContent />
    </GuideProvider>
  );
}

function ClinicDashboardContent() {
  const { user, signOut } = useSession();
  const store = useClinicStore(Boolean(user));
  const guide = useGuide();
  useFirstLoginGuide(user?.username ?? null);
  const demoMode = process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE === "true";
  const [tab, setTab] = useState<Tab>("menu");
  const [billingSubTab, setBillingSubTab] = useState<"pos" | "commission">("pos");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [portalSettingsModalOpen, setPortalSettingsModalOpen] = useState(false);

  // Sync role with session user when user logs in
  useEffect(() => {
    if (user?.role) {
      store.setRole(user.role);
    }
  }, [user]);

  // Tab permission guard (Requirement 10)
  useEffect(() => {
    if (tab !== "menu" && user && !store.hasAccess(user.role, tab as ModuleKey)) {
      setTab("menu");
    }
  }, [tab, store.rolePermissions, user]);

  // Modal Dialog States
  const [mcModalOpen, setMcModalOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [dispenseModalOpen, setDispenseModalOpen] = useState<string | null>(null);
  const [stockInModalOpen, setStockInModalOpen] = useState(false);
  const [editDrugModal, setEditDrugModal] = useState<InventoryItemData | null>(null);
  const [addDrugModalOpen, setAddDrugModalOpen] = useState(false);
  const [userManagementModalOpen, setUserManagementModalOpen] = useState(false);
  const [inventorySubTab, setInventorySubTab] = useState<"fefo" | "drugs">("drugs");
  const [selectedPaymentRail, setSelectedPaymentRail] = useState<"card" | "cash" | "qr" | "insurance">("card");
  const [cashTendered, setCashTendered] = useState(70);
  const [stockInItemId, setStockInItemId] = useState("");
  const [stockInBatchNumber, setStockInBatchNumber] = useState("");
  const [stockInExpiryDate, setStockInExpiryDate] = useState("");
  const [stockInQuantity, setStockInQuantity] = useState(50);
  const [stockInSupplier, setStockInSupplier] = useState("");
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [checkInSearch, setCheckInSearch] = useState("");
  const [viewPatientModal, setViewPatientModal] = useState<string | null>(null);
  const [viewPatientNric, setViewPatientNric] = useState<string | null>(null);
  const [viewPatientNricError, setViewPatientNricError] = useState(false);

  // Form states for Patient Registration (Requirements 3 & 4)
  const [regIdType, setRegIdType] = useState<"nric" | "passport">("nric");
  const [regCountryCode, setRegCountryCode] = useState("+60");
  const [regName, setRegName] = useState("");
  const [regNric, setRegNric] = useState("");
  const [regNationality, setRegNationality] = useState("Malaysian");
  const [regAddress, setRegAddress] = useState("");
  const [regPdpaConsent, setRegPdpaConsent] = useState(false);
  const [regPhoneRaw, setRegPhoneRaw] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regGender, setRegGender] = useState<"Female" | "Male" | "Other">("Female");
  const [regBloodGroup, setRegBloodGroup] = useState("");
  const [regAllergyText, setRegAllergyText] = useState("");
  const [regConditionsText, setRegConditionsText] = useState("");
  const [regEnqueueNow, setRegEnqueueNow] = useState(true);
  const [paymentQrOpen, setPaymentQrOpen] = useState(false);
  const [documentToPrint, setDocumentToPrint] = useState<ClinicDocumentArtifact | null>(null);
  const [documentVersions, setDocumentVersions] = useState<Record<string, ClinicDocumentArtifact[]>>({});
  const [documentPrintLog, setDocumentPrintLog] = useState<DocumentPrintRecord[]>([]);
  const [receiptLog, setReceiptLog] = useState<ClinicDocumentArtifact[]>([]);
  const [clinicalDocuments, setClinicalDocuments] = useState<ClinicDocumentArtifact[]>([]);
  const [clinicalDocumentsError, setClinicalDocumentsError] = useState<string | null>(null);

  const regIcGender = genderFromMalaysianIc(regNric);

  useEffect(() => {
    if (!viewPatientModal) {
      setViewPatientNric(null);
      setViewPatientNricError(false);
      return;
    }
    const controller = new AbortController();
    setViewPatientNric(null);
    setViewPatientNricError(false);
    fetch("/api/patients/" + viewPatientModal, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("identifier unavailable");
        const payload = await response.json() as { patient?: { nationalId?: string | null } };
        if (!controller.signal.aborted) setViewPatientNric(payload.patient?.nationalId ?? null);
      })
      .catch(() => { if (!controller.signal.aborted) setViewPatientNricError(true); });
    return () => controller.abort();
  }, [viewPatientModal]);

  const clinicDocumentProfile = {
    name: store.portalConfig.portalName,
    addressLines: [store.portalConfig.addressLine],
    currency: "MYR" as const,
  };

  useEffect(() => {
    if (typeof document !== "undefined" && store.portalConfig?.portalName) {
      document.title = `${store.portalConfig.portalName} - Clinic Management Suite`;
    }
  }, [store.portalConfig.portalName]);

  useEffect(() => {
    if (!user || demoMode) return;
    const controller = new AbortController();
    fetch("/api/clinical-documents", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { documents?: ClinicDocumentArtifact[]; error?: { message?: string } };
        if (!response.ok || !payload.documents) throw new Error(payload.error?.message ?? "Could not load the clinical document log.");
        if (!controller.signal.aborted) {
          setClinicalDocuments(payload.documents);
          setClinicalDocumentsError(null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setClinicalDocumentsError(error instanceof Error ? error.message : "Could not load the clinical document log.");
      });
    return () => controller.abort();
  }, [user, demoMode]);

  function openClinicDocument(document: ClinicDocumentArtifact) {
    const latest = clinicalDocuments.find((item) => item.artifactId === document.artifactId);
    setDocumentToPrint(latest ?? documentVersions[document.artifactId]?.at(-1) ?? document);
  }

  async function issueClinicalDocument(kind: "MC" | "REFERRAL" | "LAB_REQUISITION", sourceData: Record<string, unknown>) {
    const effectivePatientId = (sourceData.patientId as string) || store.activePatient.id;
    if (!effectivePatientId) {
      notify("Choose a patient before issuing a clinical document.", "error");
      return false;
    }
    try {
      let artifact: ClinicDocumentArtifact;
      if (demoMode) {
        if (kind === "MC") {
          const record = store.issueDigitalMC(sourceData as {
            patientId?: string;
            doctorName?: string;
            days: number;
            startDate: string;
            diagnosis: string;
            isDiagnosisRedacted: boolean;
          });
          artifact = documentFromMC(record, clinicDocumentProfile);
        } else if (kind === "REFERRAL") {
          const record = store.issueReferralLetter(sourceData as {
            patientId?: string;
            doctorName?: string;
            hospitalOrSpecialty: string;
            urgency: "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY";
            reason: string;
            summary: string;
            medications: string[];
          });
          artifact = documentFromReferral(record, clinicDocumentProfile);
        } else {
          const record = store.issueLabOrder(sourceData as { panels: string[]; specimenType: "BLOOD" | "URINE" | "SWAB" | "BIOPSY"; isFastingRequired: boolean; notes: string });
          artifact = documentFromLabOrder(record, clinicDocumentProfile);
        }
      } else {
        const response = await fetch("/api/clinical-documents", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: effectivePatientId, kind, sourceData }),
        });
        const payload = await response.json() as { document?: ClinicDocumentArtifact; error?: { message?: string } };
        if (!response.ok || !payload.document) throw new Error(payload.error?.message ?? "Clinical document issue failed.");
        artifact = payload.document;
        setClinicalDocuments((previous) => [artifact, ...previous.filter((item) => item.artifactId !== artifact.artifactId)]);
      }
      setDocumentToPrint(artifact);
      notify((demoMode ? "Demo-only " : "") + artifact.title + " " + artifact.reference + " issued.", demoMode ? "info" : "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not issue this clinical document.", "error");
      return false;
    }
  }

  async function regenerateClinicDocument(current: ClinicDocumentArtifact): Promise<ClinicDocumentArtifact> {
    if (demoMode) {
      const { artifactId: _id, version: _version, ...snapshot } = current;
      const next = regenerateClinicDocumentArtifact(current, { ...snapshot, issuedAt: new Date().toISOString() });
      setDocumentVersions((previous) => ({ ...previous, [next.artifactId]: [...(previous[next.artifactId] ?? []), next] }));
      return next;
    }
    const response = await fetch("/api/clinical-documents/" + current.artifactId + "/versions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceData: current.sourceData }),
    });
    const payload = await response.json() as { document?: ClinicDocumentArtifact; error?: { message?: string } };
    if (!response.ok || !payload.document) throw new Error(payload.error?.message ?? "Could not regenerate this document.");
    setClinicalDocuments((previous) => [payload.document!, ...previous.filter((item) => item.artifactId !== payload.document!.artifactId)]);
    return payload.document;
  }

  async function recordClinicDocumentPrint(document: ClinicDocumentArtifact, record: DocumentPrintRecord): Promise<DocumentPrintRecord> {
    if (demoMode) {
      setDocumentPrintLog((previous) => [record, ...previous]);
      return record;
    }
    const response = await fetch("/api/clinical-documents/" + document.artifactId + "/print", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: document.version, purpose: "Reception print / Save PDF" }),
    });
    const payload = await response.json() as { record?: DocumentPrintRecord; error?: { message?: string } };
    if (!response.ok || !payload.record) throw new Error(payload.error?.message ?? "Print attempt could not be recorded; printing was cancelled.");
    setDocumentPrintLog((previous) => [payload.record!, ...previous]);
    setClinicalDocuments((previous) => previous.map((item) =>
      item.artifactId === document.artifactId && item.version === document.version
        ? { ...item, printCount: (item.printCount ?? 0) + 1 }
        : item
    ));
    setDocumentToPrint((previous) => previous?.artifactId === document.artifactId && previous.version === document.version
      ? { ...previous, printCount: (previous.printCount ?? 0) + 1 }
      : previous);
    return payload.record;
  }

  function recordDemoPayment(method: string) {
    if (!demoMode) {
      notify("Receipts require a persisted invoice and confirmed payment. Billing is not configured.", "warning");
      return;
    }
    const issuedAt = new Date().toISOString();
    const reference = `RCP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const receipt = createClinicDocumentArtifact({
      reference,
      kind: "RECEIPT",
      title: "Payment Receipt · Demo",
      issuedAt,
      patient: {
        name: store.activePatient.name,
        identityNumber: store.activePatient.medicalRecordNumber ?? "",
        patientNumber: store.activePatient.id,
      },
      clinic: clinicDocumentProfile,
      sections: [
        {
          heading: "Payment details",
          fields: [
            { label: "Payment status", value: "Recorded in demo mode" },
            { label: "Payment method", value: method },
            { label: "Currency", value: "MYR" },
            { label: "Tax configuration", value: "Not configured" },
          ],
        },
        {
          heading: "Items",
          items: ["Doctor consultation — RM 45.00", "Medication — RM 18.00"],
        },
        { heading: "Total", paragraphs: ["RM 63.00"] },
      ],
    });
    setReceiptLog((previous) => [receipt, ...previous]);
    notify("Demo payment record created. No funds were collected.", "info");
  }

  const displayedClinicalDocuments: ClinicDocumentArtifact[] = demoMode
    ? [
        ...store.digitalMcs.map((record) => ({
          ...documentFromMC(record, clinicDocumentProfile),
          sourceData: { days: record.totalDays, startDate: record.startDate, diagnosis: record.diagnosis, isDiagnosisRedacted: record.isDiagnosisRedacted },
        })),
        ...store.referrals.map((record) => ({
          ...documentFromReferral(record, clinicDocumentProfile),
          sourceData: { hospitalOrSpecialty: record.targetHospitalOrSpecialty, urgency: record.urgency, reason: record.reasonForReferral, summary: record.clinicalSummary, medications: record.medications },
        })),
        ...store.labOrders.map((record) => ({
          ...documentFromLabOrder(record, clinicDocumentProfile),
          sourceData: { panels: record.panels, specimenType: record.specimenType, isFastingRequired: record.isFastingRequired, notes: record.clinicalNotes },
        })),
      ]
    : clinicalDocuments;
  const mcDocuments = displayedClinicalDocuments.filter((document) => document.kind === "MC");
  const referralDocuments = displayedClinicalDocuments.filter((document) => document.kind === "REFERRAL");
  const labDocuments = displayedClinicalDocuments.filter((document) => document.kind === "LAB_REQUISITION");

  // Patient directory search & check-in
  const [patientSearch, setPatientSearch] = useState("");
  const [checkInPatientId, setCheckInPatientId] = useState("");

  // Form states for Digital MC
  const [mcPatientId, setMcPatientId] = useState("");
  const [mcDoctor, setMcDoctor] = useState("Dr. Alicia Tan");
  const [mcDays, setMcDays] = useState(1);
  const [mcDiagnosis, setMcDiagnosis] = useState(demoMode ? "Upper Respiratory Tract Infection (URTI) with Fever" : "");
  const [mcRedactDiagnosis, setMcRedactDiagnosis] = useState(true);

  // Form states for Referral
  const [refPatientId, setRefPatientId] = useState("");
  const [refDoctor, setRefDoctor] = useState("Dr. Alicia Tan");
  const [refSpecialty, setRefSpecialty] = useState(demoMode ? "National Skin Centre - Aesthetic & Laser Dept" : "");
  const [refUrgency, setRefUrgency] = useState<"ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY">("ROUTINE");
  const [refReason, setRefReason] = useState(demoMode ? "Evaluation of recalcitrant melasma and pigmentation" : "");
  const [refSummary, setRefSummary] = useState(demoMode ? "Patient completed 3 sessions of 755nm Pico laser with partial improvement. Recommending dual-wave therapy." : "");

  // Form states for Lab Requisition
  const [labPanels, setLabPanels] = useState<string[]>(demoMode ? ["Full Blood Count", "Lipid Profile"] : []);
  const [labSpecimen, setLabSpecimen] = useState<"BLOOD" | "URINE" | "SWAB" | "BIOPSY">("BLOOD");
  const [labFasting, setLabFasting] = useState(true);

  // Form states for Dispensing
  const [dispenseQty, setDispenseQty] = useState(30);

  // EMR SOAP Charting Inputs
  const [subjectiveNote, setSubjectiveNote] = useState(demoMode ? "Patient presents with 2-day fever, sore throat, and dry cough. No shortness of breath." : "");
  const [objectiveBP, setObjectiveBP] = useState(demoMode ? "118/76 mmHg" : "");
  const [objectivePulse, setObjectivePulse] = useState(demoMode ? "74 bpm" : "");
  const [objectiveTemp, setObjectiveTemp] = useState(demoMode ? "37.8 °C" : "");
  const [assessmentText, setAssessmentText] = useState(demoMode ? "Acute Pharyngitis & Mild Rhinovirus Infection" : "");
  const [prescribedMed, setPrescribedMed] = useState("");
  const [prescribedFreq, setPrescribedFreq] = useState("Twice daily (BD)");
  const [prescribedTiming, setPrescribedTiming] = useState("After meals");
  const [prescribedQty, setPrescribedQty] = useState("14 tablets");
  const [prescribedRemarks, setPrescribedRemarks] = useState("");
  const [prescriptionsList, setPrescriptionsList] = useState<PrescribedDrugItem[]>([
    { id: "rx-1", name: "Paracetamol 500mg", frequency: "4 times daily (QDS / prn)", timing: "After meals", quantity: "20 tablets", remarks: "For fever & relief of discomfort" },
  ]);

  async function handleRegisterPatient(e: React.FormEvent) {
    e.preventDefault();
    if (!regName.trim() || !regNric.trim()) {
      notify("Please fill in Name and Identification Number.", "error");
      return;
    }

    if (regIdType === "nric") {
      const cleanIc = regNric.replace(/[^\d]/g, "");
      if (cleanIc.length !== 12) {
        notify("Malaysian IC must have 12 digits.", "error");
        return;
      }
    } else {
      if (regNric.trim().length < 3) {
        notify("Passport / Foreign ID must have at least 3 characters.", "error");
        return;
      }
    }

    const finalPhone = regPhoneRaw.trim() ? `${regCountryCode} ${regPhoneRaw.trim()}` : "";
    const finalGender = regIdType === "nric" ? (regIcGender ?? regGender) : regGender;

    try {
      const allergiesList: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }> = [];
      if (regAllergyText.trim()) {
        regAllergyText.split(",").forEach((item) => {
          if (item.trim()) {
            allergiesList.push({ substance: item.trim(), severity: "SEVERE" });
          }
        });
      }

      const conditionsList: string[] = [];
      if (regConditionsText.trim()) {
        regConditionsText.split(",").forEach((c) => {
          if (c.trim()) conditionsList.push(c.trim());
        });
      }

      await store.registerPatient({
        idType: regIdType,
        name: regName.trim(),
        nric: regNric.trim().toUpperCase(),
        phone: finalPhone,
        countryCode: regCountryCode,
        email: regEmail.trim(),
        dob: regDob,
        gender: finalGender,
        nationality: regNationality,
        address: regAddress.trim(),
        bloodGroup: regBloodGroup,
        allergies: allergiesList,
        chronicConditions: conditionsList,
        enqueueNow: regEnqueueNow,
        pdpaConsent: regPdpaConsent,
      });

      // Reset form
      setRegName("");
      setRegNric("");
      setRegAddress("");
      setRegNationality("Malaysian");
      setRegDob("");
      setRegPdpaConsent(false);
      setRegPhoneRaw("");
      setRegGender("Female");
      setRegBloodGroup("");
      setRegEmail("");
      setRegAllergyText("");
      setRegConditionsText("");
      setRegModalOpen(false);
      setTab("queue");
    } catch (err) {
      notify((err as Error).message, "error");
    }
  }

  async function handleCheckInExisting(patientIdToEnqueue?: string) {
    const targetId = patientIdToEnqueue || checkInPatientId;
    if (!targetId) {
      notify("Please select a patient to check in.", "error");
      return;
    }
    await store.enqueueExistingPatient(targetId);
    setCheckInModalOpen(false);
    setCheckInPatientId("");
    setCheckInSearch("");
    setTab("queue");
  }

  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function handlePrescribeDrug() {
    if (!prescribedMed.trim()) {
      notify("Please enter a medicine name.", "error");
      return;
    }
    // Safety Invariant: Allergy Collision Check
    const targetPatient = store.patients.find((p) => p.id === store.activePatient.id) || store.activePatient;
    const isPenicillinAllergic = targetPatient.allergies.some(
      (a) => a.substance.toLowerCase().includes("penicillin")
    );
    if (prescribedMed.toLowerCase().includes("augmentin") || prescribedMed.toLowerCase().includes("amoxicillin")) {
      if (isPenicillinAllergic) {
        notify(`ALLERGY WARNING: ${targetPatient.name} has severe allergy to Penicillin! Prescription blocked.`, "error");
        return;
      }
    }
    const newRx: PrescribedDrugItem = {
      id: `rx-${Date.now()}`,
      name: prescribedMed.trim(),
      frequency: prescribedFreq,
      timing: prescribedTiming,
      quantity: prescribedQty.trim() || "1 course",
      remarks: prescribedRemarks.trim(),
    };
    setPrescriptionsList((prev) => [...prev, newRx]);
    setPrescribedMed("");
    setPrescribedRemarks("");
    notify(`Prescribed ${newRx.name} · ${newRx.frequency} · ${newRx.timing}`, "success");
  }

  // Keyboard Escape listener to return to Main Menu (matching Car Loan)
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tab !== "menu" && !document.querySelector('[role="dialog"]')) {
        setTab("menu");
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [tab]);

  // Main Menu tile executor
  function handleOpenMenuItem(item: MenuItem) {
    if (item.actionType === "route" && item.routeTarget) {
      if (item.key === "ledger") {
        setBillingSubTab("commission");
        setTab("billing");
      } else if (item.key === "billing") {
        setBillingSubTab("pos");
        setTab("billing");
      } else if (item.key === "drugs") {
        setInventorySubTab("drugs");
        setTab("inventory");
      } else if (item.key === "inventory") {
        setInventorySubTab("fefo");
        setTab("inventory");
      } else {
        setTab(item.routeTarget);
      }
    } else if (item.actionType === "modal" && item.modalTarget) {
      switch (item.modalTarget) {
        case "register":
          setRegModalOpen(true);
          break;
        case "ticket":
          setCheckInModalOpen(true);
          break;
        case "mc":
          setMcPatientId(store.activePatient.id);
          setMcModalOpen(true);
          break;
        case "referral":
          setRefPatientId(store.activePatient.id);
          setReferralModalOpen(true);
          break;
        case "lab":
          setLabModalOpen(true);
          break;
        case "alerts":
          setAlertsOpen(true);
          break;
        case "permissions":
          setPermissionsModalOpen(true);
          break;
        case "portal_settings":
          setPortalSettingsModalOpen(true);
          break;
        case "users":
          setUserManagementModalOpen(true);
          break;
      }
    }
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen">
      {/* 1. Header / Topbar (Car Loan Layout with Main Menu Back Target) */}
      <header className="topbar">
        {tab !== "menu" ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              data-guide="back-menu"
              onClick={() => setTab("menu")}
              className="btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-bold"
              aria-label="Back to Main Menu"
              title="Return to Main Menu (Esc)"
            >
              <ArrowLeft size={16} strokeWidth={2.5} />
              <span>Main Menu</span>
              <kbd className="ml-1 text-[0.65rem] px-1 py-0.2 rounded border border-[var(--line)] bg-[var(--surface-2)] hidden sm:inline">Esc</kbd>
            </button>
            <div data-guide="breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <ChevronRight size={14} />
              <span className="font-extrabold text-[var(--navy)]">
                {tab === "queue" && "Live Queue & Rooms"}
                {tab === "patients" && "Patient Directory"}
                {tab === "consultation" && "Doctor EMR Charting"}
                {tab === "documents" && "Digital MC & Referrals"}
                {tab === "inventory" && (inventorySubTab === "drugs" ? "Master Drug List & Clinic Formulary" : "Pharmacy FEFO Stock")}
                {tab === "billing" && (billingSubTab === "commission" ? "Practitioner Commission Ledger" : "POS Billing & Checkout")}
              </span>
            </div>
          </div>
        ) : (
          <div className="brand flex items-center gap-2">
            <div className="brand-mark">{store.portalConfig.portalName.trim().charAt(0).toUpperCase() || "C"}</div>
            <div>
              <div className="leading-tight font-extrabold text-base tracking-tight text-[var(--navy)]">
                {store.portalConfig.portalName}
              </div>
              <div className="text-[0.65rem] font-semibold text-[var(--muted)] tracking-wider uppercase">
                {store.portalConfig.portalTagline}
              </div>
            </div>
          </div>
        )}

        <div className="hidden md:flex items-center gap-2 pl-4 border-l border-[var(--line)]">
          <span className="text-xs font-bold text-[var(--muted)]">Branch:</span>
          <span className="text-xs font-bold text-[var(--blue-on-soft)] bg-[var(--blue-soft)] px-2.5 py-1 rounded-md">
            {store.portalConfig.branchName || user.assignedBranch}
          </span>
        </div>

        <div className="header-actions">
          {/* Admin Clinic & Portal Settings */}
          {user.role === "manager" && (
            <button
              type="button"
              className="icon-button text-xs gap-1.5"
              onClick={() => setPortalSettingsModalOpen(true)}
              title="Clinic & Portal Settings (S)"
            >
              <Building2 size={16} strokeWidth={2.2} className="text-[var(--blue)]" />
              <span className="hidden sm:inline font-bold">Clinic Settings</span>
            </button>
          )}

          {/* Admin Role Access Control (RBAC) Button */}
          {user.role === "manager" && (
            <button
              type="button"
              className="icon-button text-xs gap-1.5"
              onClick={() => setPermissionsModalOpen(true)}
              title="Configure Role Permissions & Module Access (A)"
            >
              <ShieldCheck size={16} strokeWidth={2.2} className="text-[var(--blue)]" />
              <span className="hidden sm:inline font-bold">Permissions</span>
            </button>
          )}

          {/* Admin Staff & Doctor Roster Management Button */}
          {user.role === "manager" && (
            <button
              type="button"
              className="icon-button text-xs gap-1.5"
              onClick={() => setUserManagementModalOpen(true)}
              title="Manage Staff & Register Doctors (U)"
            >
              <Users size={16} strokeWidth={2.2} className="text-[var(--blue)]" />
              <span className="hidden sm:inline font-bold">Users & Doctors</span>
            </button>
          )}

          {/* Guide Shortcut Modal Trigger */}
          <button
            type="button"
            data-guide="guide-btn"
            className="icon-button text-xs gap-1.5"
            onClick={() => {
              guide.start(
                tab === "menu"
                  ? "menu"
                  : tab === "billing" && billingSubTab === "commission"
                  ? "ledger"
                  : (tab as any)
              );
            }}
            title="Open Interactive Coachmark Guide (?)"
          >
            <CircleHelp size={16} strokeWidth={2.2} />
            <span className="hidden sm:inline font-bold">Guide</span>
            <kbd className="font-mono text-[0.65rem] bg-[var(--surface-2)] px-1 py-0.2 rounded border border-[var(--line)] hidden md:inline">?</kbd>
          </button>

          {/* User Account Profile Badge */}
          <div data-guide="user-role-select" className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--line)] px-2.5 py-1 rounded-lg">
            <span className="w-6 h-6 rounded-full bg-[var(--blue)] text-white text-[0.68rem] font-extrabold flex items-center justify-center">
              {user.avatarInitials}
            </span>
            <div className="text-left hidden sm:block">
              <span className="text-xs font-bold text-[var(--ink)] block leading-tight">
                {user.fullName}
              </span>
              <span className="text-[0.65rem] font-semibold text-[var(--muted)] block leading-tight uppercase">
                {user.role} {user.licenseNumber ? `• ${user.licenseNumber}` : ""}
              </span>
            </div>
          </div>

          {/* Automated WhatsApp / Email Alerts Drawer Trigger */}
          <button
            className="icon-button relative"
            onClick={() => setAlertsOpen(true)}
            title="Automated WhatsApp & Email Alert Logs"
          >
            💬
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--blue)] text-white text-[0.6rem] font-bold rounded-full flex items-center justify-center">
              {store.notifications.length}
            </span>
          </button>

          {/* Theme Toggle */}
          <button
            className="icon-button"
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "☾" : "☀"}
          </button>

          {/* Explicit Sign Out Button (Car Loan Parity) */}
          <button
            className="icon-button text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-soft)] hover:border-[var(--danger)] transition-colors"
            onClick={signOut}
            title={`Sign out ${user.fullName}`}
          >
            <span>↪</span>
            <span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </header>

      {store.operationalLoadError && (
        <div role="alert" className="mx-auto mt-4 max-w-7xl rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          Clinic database records could not be loaded: {store.operationalLoadError}
        </div>
      )}

      {/* 2. Main Workspace Area (Clean Car Loan Single-Screen Layout) */}
      <div className="workspace">
        {/* ==================== TAB 0: CAR LOAN STYLE MAIN MENU ==================== */}
        {tab === "menu" && (
          <MainMenu
            userRole={user.role}
            userName={user.fullName}
            portalName={store.portalConfig.portalName}
            hasAccess={(key) => store.hasAccess(user.role, key as ModuleKey)}
            onOpenItem={handleOpenMenuItem}
            onOpenGuide={() => guide.start("menu")}
          />
        )}

        {/* ==================== TAB 1: QUEUE & ROOM ALLOCATION ==================== */}
        {tab === "queue" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--line)]">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--navy)]">
                  Clinic Queue & Room Allocation
                </h1>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {store.demoMode
                    ? "Demo queue data stays in this browser and is not saved to PostgreSQL."
                    : "Tickets and supported status changes are saved to PostgreSQL. Refresh other sessions to see updates; live sync and room setup are not configured."}
                </p>
              </div>

              {/* Waiting Room TV Display Quick Button */}
              <div className="flex items-center gap-2">
                <span className="badge badge-mint flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
                  {store.demoMode ? "Demo-only" : "PostgreSQL"}
                </span>
              </div>
            </div>

            {/* Front Desk Dedicated Task Hub (Single-Purpose Launchers) */}
            {(user.role === "receptionist" || user.role === "manager") && (
              <div data-guide="queue-actions" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setRegModalOpen(true)}
                  className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--blue-soft)] hover:border-[var(--blue)] transition text-left flex items-center gap-3.5 group cursor-pointer shadow-xs"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] flex items-center justify-center text-lg font-bold group-hover:scale-110 transition-transform">
                    ➕
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-[var(--navy)]">1. Register New Patient</div>
                    <div className="text-[0.68rem] text-[var(--muted)]">Opens dedicated registration form & auto-enqueues</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCheckInModalOpen(true)}
                  className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--blue-soft)] hover:border-[var(--blue)] transition text-left flex items-center gap-3.5 group cursor-pointer shadow-xs"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] flex items-center justify-center text-lg font-bold group-hover:scale-110 transition-transform">
                    🎫
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-[var(--navy)]">2. Issue Queue Ticket</div>
                    <div className="text-[0.68rem] text-[var(--muted)]">Check-in existing patient with WhatsApp alert</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("billing")}
                  className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--blue-soft)] hover:border-[var(--blue)] transition text-left flex items-center gap-3.5 group cursor-pointer shadow-xs"
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--mint-soft)] text-[var(--mint-dark)] flex items-center justify-center text-lg font-bold group-hover:scale-110 transition-transform">
                    💳
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-[var(--navy)]">3. POS Billing & Checkout</div>
                    <div className="text-[0.68rem] text-[var(--muted)]">Settle consultation bills & collect payments</div>
                  </div>
                </button>
              </div>
            )}

            {/* Room Allocation Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {store.rooms.map((room) => (
                <div key={room.id} className="clinic-card room-card border-t-4 border-t-[var(--blue)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black tracking-wider uppercase text-[var(--blue-on-soft)] bg-[var(--blue-soft)] px-2 py-0.5 rounded">
                      {room.name}
                    </span>
                    <span
                      className={`badge ${
                        room.isOccupied ? "badge-amber" : "badge-mint"
                      }`}
                    >
                      {room.isOccupied ? "IN CONSULTATION" : "READY / VACANT"}
                    </span>
                  </div>
                  <h3 className="font-bold text-base text-[var(--ink)]">{room.practitionerName}</h3>
                  <p className="text-xs text-[var(--muted)] mt-0.5">{room.specialty}</p>

                  <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between">
                    <div>
                      <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">
                        Current Ticket
                      </span>
                      <strong className="text-lg font-extrabold text-[var(--blue)]">
                        {room.currentTicketNumber || "—"}
                      </strong>
                    </div>

                    {!room.isOccupied && (
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => {
                          const nextWaiting = store.queue.find((q) => q.status === "WAITING");
                          if (nextWaiting) {
                            store.callPatientToRoom(nextWaiting.id, room.id);
                          } else {
                            notify("No waiting patients in queue queue.", "info");
                          }
                        }}
                      >
                        Call Next Patient
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Public Queue List Table */}
            <div data-guide="queue-table" className="clinic-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-extrabold text-base text-[var(--navy)]">
                  Patients In Queue ({store.queue.length})
                </h2>
                <span className="text-xs text-[var(--muted)]">
                  Average consult turnaround: 12 mins
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[var(--muted)] font-bold">
                      <th className="pb-3">Ticket</th>
                      <th className="pb-3">Patient Name</th>
                      <th className="pb-3">Registered</th>
                      <th className="pb-3">Assigned Practitioner</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {store.queue.map((ticket) => (
                      <tr key={ticket.id} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="py-3.5 font-extrabold text-sm text-[var(--blue)]">
                          {ticket.ticketNumber}
                        </td>
                        <td className="py-3.5 font-bold text-[var(--ink)]">
                          {ticket.patientName}
                          <span className="block text-[0.7rem] text-[var(--muted)] font-normal">
                            {ticket.phone}
                          </span>
                        </td>
                        <td className="py-3.5 text-[var(--muted)]">{ticket.registeredAt}</td>
                        <td className="py-3.5 font-medium">{ticket.practitionerName}</td>
                        <td className="py-3.5">
                          <span
                            className={`badge ${
                              ticket.status === "WAITING"
                                ? "badge-amber"
                                : ticket.status === "CALLED_TO_ROOM"
                                ? "badge-blue"
                                : ticket.status === "IN_CONSULTATION"
                                ? "badge-lavender"
                                : "badge-mint"
                            }`}
                          >
                            {ticket.status.replace(/_/g, " ")}
                          </span>
                          {ticket.roomName && (
                            <span className="text-[0.68rem] text-[var(--muted)] block mt-0.5">
                              allocated to {ticket.roomName}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-right space-x-1.5">
                          {ticket.status === "WAITING" && (
                            <button
                              className="btn-primary text-xs py-1 px-2.5"
                              onClick={() => store.callPatientToRoom(ticket.id)}
                            >
                              Mark Called
                            </button>
                          )}
                          {ticket.status === "CALLED_TO_ROOM" && (
                            <>
                              {(user.role === "doctor" || user.role === "manager") ? (
                                <button
                                  className="btn-mint text-xs py-1 px-2.5"
                                  onClick={async () => {
                                    if (await store.startConsultation(ticket.id)) setTab("consultation");
                                  }}
                                >
                                  Start Consult
                                </button>
                              ) : (
                                <span className="badge badge-blue">Entering Room</span>
                              )}
                            </>
                          )}
                          {ticket.status === "IN_CONSULTATION" && (
                            <>
                              {(user.role === "doctor" || user.role === "manager") ? (
                                <button
                                  className="btn-secondary text-xs py-1 px-2.5"
                                  onClick={() => store.completeConsultation(ticket.id)}
                                >
                                  Send to Pharmacy
                                </button>
                              ) : (
                                <span className="badge badge-lavender">With Doctor</span>
                              )}
                            </>
                          )}
                          {ticket.status === "COMPLETED" && (
                            <>
                              {(user.role === "receptionist" || user.role === "manager") ? (
                                <button
                                  className="btn-primary text-xs py-1 px-2.5"
                                  onClick={() => {
                                    store.setActivePatientId(ticket.patientId);
                                    setTab("billing");
                                  }}
                                >
                                  Checkout ➔
                                </button>
                              ) : (
                                <span className="badge badge-mint">Finished</span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB: PATIENT DIRECTORY (FRONTDESK) ==================== */}
        {tab === "patients" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--line)]">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--navy)]">
                  Registered Patients Directory
                </h1>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Manage patient master records, check allergy profiles, and issue queue tickets.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  data-guide="patient-register"
                  className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
                  onClick={() => setRegModalOpen(true)}
                >
                  <span>➕</span>
                  <span>Register New Patient</span>
                </button>
              </div>
            </div>

            {/* Patient Search & Directory Table */}
            <div data-guide="patient-table" className="clinic-card space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div data-guide="patient-search" className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search by MRN, IC/Passport, name, or phone..."
                    className="w-full text-xs p-2.5 pl-8 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)]"
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-[var(--muted)]">🔍</span>
                </div>
                <span className="text-xs text-[var(--muted)] font-medium">
                  Showing {store.patients.filter((p) =>
                    p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                    (p.medicalRecordNumber ?? "").toLowerCase().includes(patientSearch.toLowerCase()) ||
                    (p.nric ?? "").toLowerCase().includes(patientSearch.toLowerCase()) ||
                    p.phone.includes(patientSearch)
                  ).length} of {store.patients.length} patients
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[var(--muted)] font-bold">
                      <th className="pb-3">MRN</th>
                      <th className="pb-3">Patient Name & IC/ID</th>
                      <th className="pb-3">Contact</th>
                      <th className="pb-3">Age / Gender</th>
                      <th className="pb-3">Allergies</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {store.patients
                      .filter((p) =>
                        p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                        (p.medicalRecordNumber ?? "").toLowerCase().includes(patientSearch.toLowerCase()) ||
                        (p.nric ?? "").toLowerCase().includes(patientSearch.toLowerCase()) ||
                        p.phone.includes(patientSearch)
                      )
                      .map((pat) => {
                        const activeTicket = store.queue.find(
                          (q) => q.patientId === pat.id && (q.status === "WAITING" || q.status === "CALLED_TO_ROOM" || q.status === "IN_CONSULTATION" || q.status === "DISPENSARY" || q.status === "PAYMENT")
                        );

                        return (
                          <tr key={pat.id} className="hover:bg-[var(--surface-2)] transition-colors">
                            <td className="py-3.5 font-mono font-extrabold text-[var(--blue-on-soft)]">
                              #{pat.medicalRecordNumber || "—"}
                            </td>
                            <td className="py-3.5">
                              <span className="font-extrabold text-[var(--ink)] block">{pat.name}</span>
                              <span className="text-[0.65rem] text-[var(--muted)] font-mono">
                                IC/ID: {pat.nric || "—"} {pat.nationality ? `• ${pat.nationality}` : ""}
                              </span>
                            </td>
                            <td className="py-3.5 text-[var(--muted)]">
                              {pat.phone}
                              <span className="block text-[0.65rem]">{pat.email || (pat.address ? pat.address : "No email")}</span>
                            </td>
                            <td className="py-3.5 font-medium">
                              {pat.age} yrs • {pat.gender} ({pat.bloodGroup || "—"})
                            </td>
                            <td className="py-3.5">
                              {pat.allergies.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {pat.allergies.map((a, i) => (
                                    <span key={i} className="badge badge-red text-[0.65rem]">
                                      ⚠ {a.substance}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="badge badge-mint text-[0.65rem]">NKDA</span>
                              )}
                            </td>
                            <td className="py-3.5 text-right space-x-1.5">
                              {activeTicket ? (
                                <span className="badge badge-blue">
                                  In Queue ({activeTicket.ticketNumber})
                                </span>
                              ) : (
                                <button
                                  className="btn-primary text-xs py-1 px-2.5"
                                  onClick={async () => {
                                    await store.enqueueExistingPatient(pat.id);
                                    setTab("queue");
                                  }}
                                >
                                  🎫 Issue Ticket
                                </button>
                              )}
                              <button
                                className="btn-secondary text-xs py-1 px-2.5"
                                onClick={() => {
                                  store.setActivePatientId(pat.id);
                                  if (user.role === "doctor") {
                                    setTab("consultation");
                                  } else {
                                    setViewPatientModal(pat.id);
                                  }
                                }}
                              >
                                {user.role === "doctor" ? "Consult Chart" : "View Profile"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: DOCTOR EMR CHARTING ==================== */}
        {tab === "consultation" && (
          <div className="space-y-6">
            {/* Pinned Patient Banner (HCI Consistency & Error Shield) */}
            <div data-guide="emr-patient" className="clinic-card bg-gradient-to-r from-[var(--surface)] to-[var(--blue-soft)] border-l-4 border-l-[var(--blue)]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-[var(--navy)]">
                      {store.activePatient.name}
                    </h2>
                    <span className="text-xs bg-[var(--surface)] px-2 py-0.5 rounded font-bold border border-[var(--line)]">
                      MRN: {store.activePatient.medicalRecordNumber || "—"}
                    </span>
                    <span className="text-xs bg-[var(--surface)] px-2 py-0.5 rounded font-bold border border-[var(--line)]">
                      Age: {store.activePatient.age} ({store.activePatient.gender})
                    </span>
                    <span className="text-xs bg-[var(--surface)] px-2 py-0.5 rounded font-bold border border-[var(--line)]">
                      Blood: {store.activePatient.bloodGroup}
                    </span>
                  </div>

                  {/* Allergy Banner */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--muted)]">Allergies:</span>
                    {store.activePatient.allergies.length > 0 ? (
                      store.activePatient.allergies.map((allergy, idx) => (
                        <span key={idx} className="badge badge-red font-bold">
                          ⚠ {allergy.substance} ({allergy.severity})
                        </span>
                      ))
                    ) : (
                      <span className="badge badge-mint">No Known Drug Allergies (NKDA)</span>
                    )}
                  </div>
                </div>

                {/* Patient Switcher for Testing */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--muted)]">Switch Chart:</span>
                  <select
                    value={store.activePatient.id}
                    onChange={(e) => store.setActivePatientId(e.target.value)}
                    className="text-xs bg-[var(--surface)] border border-[var(--line)] rounded-md px-2 py-1 font-bold"
                  >
                    {store.patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.medicalRecordNumber || "—"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Doctor SOAP Notes Workstation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div data-guide="emr-soap" className="clinic-card space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                    <h3 className="font-extrabold text-base text-[var(--navy)] flex items-center gap-2">
                      <span>📝</span> SOAP Clinical Consultation Note
                    </h3>
                    <span className="text-xs text-[var(--muted)] font-mono">ICD-10 Enabled</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                      S: Subjective (Symptoms & Chief Complaint)
                    </label>
                    <textarea
                      value={subjectiveNote}
                      onChange={(e) => setSubjectiveNote(e.target.value)}
                      rows={3}
                      className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                      O: Objective (Vitals & Physical Exam)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[0.65rem] text-[var(--muted)] block">Blood Pressure</span>
                        <input
                          value={objectiveBP}
                          onChange={(e) => setObjectiveBP(e.target.value)}
                          className="w-full text-xs p-2 rounded border border-[var(--line)] bg-[var(--surface-2)] font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[0.65rem] text-[var(--muted)] block">Pulse</span>
                        <input
                          value={objectivePulse}
                          onChange={(e) => setObjectivePulse(e.target.value)}
                          className="w-full text-xs p-2 rounded border border-[var(--line)] bg-[var(--surface-2)] font-mono"
                        />
                      </div>
                      <div>
                        <span className="text-[0.65rem] text-[var(--muted)] block">Temperature</span>
                        <input
                          value={objectiveTemp}
                          onChange={(e) => setObjectiveTemp(e.target.value)}
                          className="w-full text-xs p-2 rounded border border-[var(--line)] bg-[var(--surface-2)] font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                      A: Assessment (Clinical Diagnosis)
                    </label>
                    <input
                      value={assessmentText}
                      onChange={(e) => setAssessmentText(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--ink)]"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[var(--muted)] uppercase block">
                        P: Plan & Prescriptions (Safety Shield & Dosing)
                      </label>
                      <span className="text-[0.68rem] text-[var(--muted)]">Type drug name or select from clinic formulary</span>
                    </div>

                    <div className="p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--line)] space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase">
                            Medicine / Drug Name <span className="text-[var(--danger)]">*</span>
                          </span>
                          {prescribedMed && (
                            <button
                              type="button"
                              onClick={() => setPrescribedMed("")}
                              className="text-[0.65rem] text-[var(--danger)] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                            >
                              ✕ Clear / Change Drug
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                          <input
                            list="clinic-formulary-datalist"
                            type="text"
                            value={prescribedMed}
                            onChange={(e) => setPrescribedMed(e.target.value)}
                            placeholder="Type drug name or select from list..."
                            className="flex-1 text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-bold text-[var(--ink)]"
                          />
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                setPrescribedMed(e.target.value);
                              }
                            }}
                            className="w-full sm:w-48 text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-medium text-[var(--ink)] cursor-pointer"
                            aria-label="Select from approved clinic formulary"
                          >
                            <option value="">▼ Pick Formulary...</option>
                            {store.inventory.map((inv) => {
                              const fullName = `${inv.name}${inv.strength ? ` ${inv.strength}` : ""}`;
                              return (
                                <option key={inv.id} value={fullName}>
                                  {fullName}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <datalist id="clinic-formulary-datalist">
                          {store.inventory.map((inv) => (
                            <option key={inv.id} value={`${inv.name}${inv.strength ? ` ${inv.strength}` : ""}`} />
                          ))}
                        </datalist>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block mb-1">
                            Dosing Frequency
                          </span>
                          <select
                            value={prescribedFreq}
                            onChange={(e) => setPrescribedFreq(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-medium"
                          >
                            {DOSING_FREQUENCIES.map((freq) => (
                              <option key={freq} value={freq}>{freq}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block mb-1">
                            Meal Timing
                          </span>
                          <select
                            value={prescribedTiming}
                            onChange={(e) => setPrescribedTiming(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-medium"
                          >
                            {MEAL_TIMINGS.map((timing) => (
                              <option key={timing} value={timing}>{timing}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block mb-1">
                            Quantity / Duration
                          </span>
                          <input
                            type="text"
                            value={prescribedQty}
                            onChange={(e) => setPrescribedQty(e.target.value)}
                            placeholder="e.g. 14 tablets / 1 bottle"
                            className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={prescribedRemarks}
                          onChange={(e) => setPrescribedRemarks(e.target.value)}
                          placeholder="Optional special instructions (e.g. complete full course, avoid sunlight)"
                          className="flex-1 text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)]"
                        />
                        <button
                          type="button"
                          className="btn-primary text-xs py-2 px-3 whitespace-nowrap flex items-center gap-1.5"
                          onClick={handlePrescribeDrug}
                        >
                          <Plus size={14} />
                          <span>Prescribe Drug</span>
                        </button>
                      </div>
                    </div>

                    {/* Prescribed Drug List */}
                    {prescriptionsList.length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">
                          Current Prescriptions for Dispensary ({prescriptionsList.length}):
                        </span>
                        <div className="space-y-1.5">
                          {prescriptionsList.map((rx) => (
                            <div key={rx.id} className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] flex items-center justify-between gap-3 text-xs">
                              <div>
                                <strong className="text-[var(--ink)] block">{rx.name}</strong>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                  <span className="badge badge-blue text-[0.65rem]">{rx.frequency}</span>
                                  <span className="badge badge-mint text-[0.65rem]">{rx.timing}</span>
                                  <span className="text-[0.68rem] text-[var(--muted)] font-mono">Qty: {rx.quantity}</span>
                                  {rx.remarks && (
                                    <span className="text-[0.68rem] text-[var(--muted)] italic">({rx.remarks})</span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="icon-button text-[var(--danger)] hover:bg-[var(--danger-soft)] p-1"
                                onClick={() => setPrescriptionsList((prev) => prev.filter((p) => p.id !== rx.id))}
                                title="Remove medication"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions & Digital Certification Triggers */}
              <div data-guide="emr-actions" className="space-y-4">
                <div className="clinic-card space-y-3">
                  <h3 className="font-extrabold text-sm text-[var(--navy)] pb-2 border-b border-[var(--line)]">
                    📜 Clinical Document Issuance
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    Create document previews. Verification and message delivery require configured services.
                  </p>

                  <button
                    className="btn-primary w-full text-xs justify-between"
                    onClick={() => {
                      setMcPatientId(store.activePatient.id);
                      setMcModalOpen(true);
                    }}
                  >
                    <span>Digital Medical Certificate (MC)</span>
                    <span>➔</span>
                  </button>

                  <button
                    className="btn-secondary w-full text-xs justify-between"
                    onClick={() => {
                      setRefPatientId(store.activePatient.id);
                      setReferralModalOpen(true);
                    }}
                  >
                    <span>Hospital Referral Letter</span>
                    <span>➔</span>
                  </button>

                  <button
                    className="btn-secondary w-full text-xs justify-between"
                    onClick={() => setLabModalOpen(true)}
                  >
                    <span>Lab Investigation Requisition</span>
                    <span>➔</span>
                  </button>
                </div>

                {/* Clinical Safety Alert & Allergy Profile */}
                <div className="clinic-card space-y-2.5 bg-[var(--surface-2)]">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--line)]">
                    <h4 className="font-bold text-xs text-[var(--ink)] flex items-center gap-1.5">
                      <span>🛡️</span> Patient Allergy & Safety
                    </h4>
                    <span className="badge badge-mint text-[0.65rem]">Active Shield</span>
                  </div>
                  <p className="text-[0.7rem] text-[var(--muted)]">
                    Cross-referencing active medications and patient allergies against Penicillin and NSAID contraindications.
                  </p>
                  <div className="p-2 rounded bg-[var(--surface)] border border-[var(--line)] text-xs">
                    <span className="text-[0.65rem] font-bold text-[var(--muted)] block">Selected Patient:</span>
                    <strong className="text-[var(--ink)] block">{store.activePatient.name}</strong>
                    {store.activePatient.allergies.length > 0 ? (
                      <span className="text-[var(--danger)] font-bold text-[0.7rem] block mt-0.5">
                        ⚠️ Allergies: {store.activePatient.allergies.map((a) => a.substance).join(", ")}
                      </span>
                    ) : (
                      <span className="text-[var(--success)] text-[0.7rem] block mt-0.5">✓ No known drug allergies (NKDA)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: DIGITAL DOCUMENTS HUB ==================== */}
        {tab === "documents" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--line)]">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--navy)]">Clinical Documents</h1>
                <p className="text-xs text-[var(--muted)] mt-1">Issue, retrieve, regenerate and print versioned clinical documents.</p>
                {demoMode && <p className="text-xs text-amber-700 mt-1">Demo mode · records are local and are not saved to PostgreSQL.</p>}
                {!demoMode && clinicalDocumentsError && <p role="alert" className="text-xs text-red-700 mt-1">Document log unavailable: {clinicalDocumentsError}</p>}
                {!demoMode && !clinicalDocumentsError && clinicalDocuments.length === 0 && <p className="text-xs text-[var(--muted)] mt-1">No persisted clinical documents found.</p>}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary text-xs" onClick={() => setMcModalOpen(true)}>+ Issue MC</button>
                <button className="btn-secondary text-xs" onClick={() => setReferralModalOpen(true)}>+ New Referral</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { title: `Medical Certificates (${mcDocuments.length})`, documents: mcDocuments },
                { title: `Referral Letters (${referralDocuments.length})`, documents: referralDocuments },
                { title: `Lab Requisitions (${labDocuments.length})`, documents: labDocuments },
              ].map((group) => (
                <section key={group.title} className="clinic-card space-y-3">
                  <h2 className="font-extrabold text-sm text-[var(--navy)]">{group.title}</h2>
                  {group.documents.length === 0 ? <p className="text-xs text-[var(--muted)] py-3">No records available.</p> : group.documents.map((document) => (
                    <article key={document.artifactId} className="p-3 bg-[var(--surface-2)] rounded-lg text-xs space-y-2">
                      <div className="flex justify-between gap-2 font-bold"><span>{document.reference}</span><span className="badge badge-mint">v{document.version} · {demoMode ? "Demo" : "Saved"}</span></div>
                      <p className="font-medium text-[var(--ink)]">{document.title} · {document.patient.name}</p>
                      <p className="text-[var(--muted)]">{new Date(document.issuedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</p>
                      {document.sections.map((section, index) => <div key={index} className="text-[0.7rem] text-[var(--muted)]"><b>{section.heading}: </b>{[...(section.paragraphs ?? []), ...(section.fields ?? []).map((field) => `${field.label}: ${field.value}`), ...(section.items ?? [])].join(" · ")}</div>)}
                      {document.verificationUrl && <div className="flex flex-col items-center gap-1 border-t border-[var(--line)] pt-2"><QrCode value={document.verificationUrl} label={`Status verification QR for ${document.reference}`} /><span className="text-[0.65rem] text-[var(--muted)]">Verification shows document status only.</span></div>}
                      {demoMode && <p className="text-[0.65rem] text-amber-700">Demo QR and local-only document.</p>}
                      <button type="button" className="btn-secondary text-xs" onClick={() => openClinicDocument(document)}>View / Print / Regenerate</button>
                    </article>
                  ))}
                </section>
              ))}
            </div>
            <section className="clinic-card"><h2 className="font-bold text-sm">Receipts</h2><p className="text-xs text-[var(--muted)] mt-1">Receipts are unavailable until invoices and confirmed payments are persisted. This system will not create a receipt from a demo or unverified payment.</p></section>
          </div>
        )}

        {/* ==================== TAB 4: PHARMACY, DRUG LIST & FEFO INVENTORY ==================== */}
        {tab === "inventory" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--line)]">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--navy)]">
                  {inventorySubTab === "drugs" ? "Master Drug List & Clinic Formulary" : "Dispensary Inventory & FEFO Engine"}
                </h1>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {inventorySubTab === "drugs"
                    ? "Complete clinic formulary of approved medications, strengths, dosages, and selling tariffs."
                    : "First-Expiry-First-Out batch depletion to ensure safety and prevent dispensing expired medications."}
                </p>
              </div>

              {/* Subtab Segmented Switcher */}
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-[var(--surface-2)] rounded-xl border border-[var(--line)]">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                      inventorySubTab === "drugs"
                        ? "bg-[var(--surface)] text-[var(--blue)] shadow-xs font-extrabold"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setInventorySubTab("drugs")}
                  >
                    <span>💊</span>
                    <span>Drug List & Formulary</span>
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                      inventorySubTab === "fefo"
                        ? "bg-[var(--surface)] text-[var(--blue)] shadow-xs font-extrabold"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setInventorySubTab("fefo")}
                  >
                    <span>📦</span>
                    <span>FEFO Batches</span>
                  </button>
                </div>

                {inventorySubTab === "drugs" ? (
                  <button
                    type="button"
                    className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
                    onClick={() => setAddDrugModalOpen(true)}
                  >
                    <Plus size={14} />
                    <span>Add New Drug</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    data-guide="stock-receive-btn"
                    className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
                    onClick={() => {
                      if (store.inventory.length > 0) {
                        setStockInItemId(store.inventory[0].id);
                      }
                      setStockInBatchNumber(`LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`);
                      setStockInExpiryDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
                      setStockInModalOpen(true);
                    }}
                  >
                    <span>📥</span>
                    <span>Stock In / Receive Batch</span>
                  </button>
                )}
              </div>
            </div>

            {/* SUB-VIEW A: MASTER DRUG LIST & FORMULARY */}
            {inventorySubTab === "drugs" && (
              <div className="clinic-card space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--line)]">
                  <div>
                    <h3 className="font-extrabold text-sm text-[var(--navy)]">Available Clinic Medications ({store.inventory.length})</h3>
                    <span className="text-[0.68rem] text-[var(--muted)]">Click &ldquo;Edit Drug&rdquo; to modify pricing, default dosing instructions, or par levels.</span>
                  </div>
                  <span className="badge badge-mint font-bold">{store.inventory.filter((i) => i.category === "MEDICATION").length} Registered Rx</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[var(--muted)] font-bold">
                        <th className="pb-3">SKU</th>
                        <th className="pb-3">Medicine & Generic Name</th>
                        <th className="pb-3">Strength & Form</th>
                        <th className="pb-3">Default Dosing Instructions</th>
                        <th className="pb-3">Unit Price</th>
                        <th className="pb-3">Min Par</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {store.inventory.map((item) => (
                        <tr key={item.id} className="hover:bg-[var(--surface-2)] transition-colors">
                          <td className="py-3 font-mono font-bold text-[var(--muted)]">{item.sku}</td>
                          <td className="py-3 font-extrabold text-[var(--ink)]">
                            {item.name}
                            <span className="block text-[0.65rem] text-[var(--blue-on-soft)] font-mono font-normal">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3">
                            <span className="badge badge-lavender text-[0.65rem]">
                              {item.strength || "—"} • {item.dosageForm || "Unit"}
                            </span>
                          </td>
                          <td className="py-3 text-[var(--muted)] max-w-xs truncate">
                            {item.instructions || "As directed by physician"}
                          </td>
                          <td className="py-3 font-mono font-bold text-[var(--ink)]">
                            RM {item.sellingPrice.toFixed(2)}
                          </td>
                          <td className="py-3 font-mono text-[var(--muted)]">
                            {item.minimumParLevel}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 ml-auto"
                              onClick={() => setEditDrugModal(item)}
                            >
                              <Edit3 size={13} />
                              <span>Edit Drug</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUB-VIEW B: FEFO BATCHES & DISPENSARY */}
            {inventorySubTab === "fefo" && (
              <div data-guide="stock-table" className="clinic-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--line)] text-[var(--muted)] font-bold">
                        <th className="pb-3">SKU</th>
                        <th className="pb-3">Item Name</th>
                        <th className="pb-3">Category</th>
                        <th className="pb-3">Earliest Expiry (FEFO)</th>
                        <th className="pb-3">Stock on Hand</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--line)]">
                      {store.inventory.map((item) => {
                        const totalQty = item.batches.reduce((sum, b) => sum + b.quantity, 0);
                        const earliestBatch = [...item.batches].sort(
                          (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
                        )[0];

                        return (
                          <tr key={item.id} className="hover:bg-[var(--surface-2)] transition-colors">
                            <td className="py-3 font-mono font-bold text-[var(--muted)]">{item.sku}</td>
                            <td className="py-3 font-bold text-[var(--ink)]">
                              {item.name}
                              <span className="block text-[0.65rem] text-[var(--muted)] font-normal">
                                Selling: RM {item.sellingPrice.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className="badge badge-blue">{item.category}</span>
                            </td>
                            <td className="py-3 font-medium">
                              {earliestBatch ? (
                                <span>
                                  {earliestBatch.expiryDate} (Batch #{earliestBatch.batchNumber})
                                </span>
                              ) : (
                                <span className="text-[var(--danger)] font-bold">Out of stock</span>
                              )}
                            </td>
                            <td className="py-3">
                              <span
                                className={`badge ${
                                  totalQty < item.minimumParLevel ? "badge-red" : "badge-mint"
                                }`}
                              >
                                {totalQty} Units {totalQty < item.minimumParLevel ? "(LOW)" : ""}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  className="btn-secondary text-xs py-1 px-2.5"
                                  onClick={() => setDispenseModalOpen(item.id)}
                                >
                                  Dispense
                                </button>
                                <button
                                  className="btn-primary text-xs py-1 px-2.5"
                                  onClick={() => {
                                    setStockInItemId(item.id);
                                    setStockInBatchNumber(`LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`);
                                    setStockInExpiryDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
                                    setStockInModalOpen(true);
                                  }}
                                >
                                  + Stock In
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 6: POS BILLING & COMMISSIONS ==================== */}
        {tab === "billing" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--line)]">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--navy)]">
                  {billingSubTab === "commission" ? "Practitioner Commission Ledger" : "Point of Sale (POS) Billing"}
                </h1>
                <p className="text-xs text-[var(--muted)] mt-1">
                  {billingSubTab === "commission"
                    ? "Real-time doctor & therapist service commission attribution and monthly payout ledger."
                    : "Multi-rail cashier checkout and instant payment receipt issuance."}
                </p>
              </div>

              {/* Segmented Sub-Tab Control (Separating POS Cashier from Commission Ledger) */}
              <div className="flex items-center p-1 bg-[var(--surface-2)] rounded-xl border border-[var(--line)]">
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                    billingSubTab === "pos"
                      ? "bg-[var(--surface)] text-[var(--blue)] shadow-xs font-extrabold"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setBillingSubTab("pos")}
                >
                  <span>🧾</span>
                  <span>POS Cashier Checkout</span>
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
                    billingSubTab === "commission"
                      ? "bg-[var(--surface)] text-[var(--blue)] shadow-xs font-extrabold"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setBillingSubTab("commission")}
                >
                  <span>📊</span>
                  <span>Commission Ledger</span>
                </button>
              </div>
            </div>

            {/* SUB-VIEW 1: POS CASHIER CHECKOUT */}
            {billingSubTab === "pos" && (
              <div className="space-y-6">
                <div data-guide="billing-bill" className="clinic-card space-y-4 max-w-3xl">
                  <div className="flex justify-between items-center pb-2 border-b border-[var(--line)]">
                    <div>
                      <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Invoice Preview</span>
                      <h3 className="font-extrabold text-base text-[var(--navy)]">
                        Patient: {store.activePatient.name}
                      </h3>
                    </div>
                    <span className="badge badge-amber font-bold">PENDING PAYMENT</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-2 border-b border-[var(--line)]">
                      <span>Doctor Consultation Fee (Dr. Alicia Tan)</span>
                      <span className="font-bold">RM 45.00</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[var(--line)]">
                      <span>Amlodipine Besylate 5mg (30 Tablets)</span>
                      <span className="font-bold">RM 18.00</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-[var(--line)]">
                      <span>Tax / SST</span>
                      <span className="font-bold text-[var(--muted)]">Not configured</span>
                    </div>

                    <div className="pt-3 flex justify-between items-center text-sm font-extrabold">
                      <span>Total Amount Payable:</span>
                      <span className="text-xl text-[var(--blue)] font-black">RM 63.00</span>
                    </div>
                  </div>

                  <div data-guide="billing-rails" className="pt-4 border-t border-[var(--line)] space-y-3">
                    <span className="text-xs font-bold text-[var(--muted)] uppercase block">1. Select Payment Rail:</span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        className={`text-xs py-2 px-3 rounded-lg border font-bold transition flex items-center justify-center gap-1.5 ${
                          selectedPaymentRail === "card"
                            ? "bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs"
                            : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:bg-[var(--surface)]"
                        }`}
                        onClick={() => setSelectedPaymentRail("card")}
                      >
                        <span>💳</span>
                        <span>Credit / Debit Card</span>
                      </button>
                      <button
                        type="button"
                        className={`text-xs py-2 px-3 rounded-lg border font-bold transition flex items-center justify-center gap-1.5 ${
                          selectedPaymentRail === "cash"
                            ? "bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs"
                            : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:bg-[var(--surface)]"
                        }`}
                        onClick={() => setSelectedPaymentRail("cash")}
                      >
                        <span>💵</span>
                        <span>Cash</span>
                      </button>
                      <button
                        type="button"
                        className={`text-xs py-2 px-3 rounded-lg border font-bold transition flex items-center justify-center gap-1.5 ${
                          selectedPaymentRail === "qr"
                            ? "bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs"
                            : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:bg-[var(--surface)]"
                        }`}
                        onClick={() => setSelectedPaymentRail("qr")}
                      >
                        <span>📱</span>
                        <span>DuitNow QR</span>
                      </button>
                      <button
                        type="button"
                        className={`text-xs py-2 px-3 rounded-lg border font-bold transition flex items-center justify-center gap-1.5 ${
                          selectedPaymentRail === "insurance"
                            ? "bg-[var(--blue)] text-white border-[var(--blue)] shadow-xs"
                            : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:bg-[var(--surface)]"
                        }`}
                        onClick={() => setSelectedPaymentRail("insurance")}
                      >
                        <span>🛡️</span>
                        <span>Insurance Panel</span>
                      </button>
                    </div>

                    {/* Interactive Rail Execution Panel */}
                    <div className="p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--line)] space-y-2.5">
                      {selectedPaymentRail === "card" && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[var(--ink)]">Card Terminal Integration</span>
                            <span className="badge badge-mint text-[0.65rem]">Terminal Ready</span>
                          </div>
                          <p className="text-[0.7rem] text-[var(--muted)]">
                            Customer may tap Contactless (Visa payWave / Mastercard PayPass) or insert chip card into terminal.
                          </p>
                          <button
                            type="button"
                            className="btn-primary w-full text-xs py-2 font-bold justify-center"
                            onClick={() => recordDemoPayment("Credit / Debit Card Terminal")}
                          >
                            Charge RM 63.00 & Print Receipt
                          </button>
                        </div>
                      )}

                      {selectedPaymentRail === "cash" && (
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[var(--ink)]">Cash Drawer Calculator</span>
                            <span className="text-[0.68rem] text-[var(--muted)]">Exact or Rounding Enabled</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block mb-1">
                                Cash Tendered (RM)
                              </span>
                              <input
                                type="number"
                                min="63"
                                step="1"
                                value={cashTendered}
                                onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                                className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-mono font-bold"
                              />
                            </div>
                            <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] flex flex-col justify-center">
                              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">
                                Change Due to Patient:
                              </span>
                              <strong className="text-base font-black text-[var(--success)] font-mono">
                                RM {Math.max(0, cashTendered - 63).toFixed(2)}
                              </strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-primary w-full text-xs py-2 font-bold justify-center"
                            onClick={() => recordDemoPayment(`Cash (Tendered RM ${cashTendered.toFixed(2)}, Change RM ${Math.max(0, cashTendered - 63).toFixed(2)})`)}
                          >
                            Accept Cash & Print Receipt
                          </button>
                        </div>
                      )}

                      {selectedPaymentRail === "qr" && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[var(--ink)]">DuitNow QR Instant Pay</span>
                            <span className="badge badge-mint text-[0.65rem]">National Interoperable QR</span>
                          </div>
                          <p className="text-[0.7rem] text-[var(--muted)]">
                            Customer scans with any Malaysian banking app or e-wallet (Touch &apos;n Go, GrabPay, Boost, Maybank MAE, CIMB OCTO).
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn-secondary flex-1 text-xs py-2 font-bold justify-center"
                              onClick={() => setPaymentQrOpen(true)}
                            >
                              Display DuitNow QR
                            </button>
                            <button
                              type="button"
                              className="btn-primary flex-1 text-xs py-2 font-bold justify-center"
                              onClick={() => recordDemoPayment("DuitNow QR Pay (Instant Settlement)")}
                            >
                              Verify QR & Print Receipt
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedPaymentRail === "insurance" && (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[var(--ink)]">Corporate Panel & Third Party Administrator (TPA)</span>
                            <span className="badge badge-blue text-[0.65rem]">Panel Gateway</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block mb-1">
                                Panel Guarantor
                              </span>
                              <select className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] font-medium">
                                <option>AIA Health Corporate</option>
                                <option>Great Eastern MedSave</option>
                                <option>PMCare Direct Panel</option>
                                <option>Mednefts FlexiCare</option>
                                <option>Prudential PRUClinic</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block mb-1">
                                Co-Payment / Deductible
                              </span>
                              <input
                                readOnly
                                value="RM 0.00 (Fully Covered)"
                                className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--success)] font-bold"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-primary w-full text-xs py-2 font-bold justify-center"
                            onClick={() => recordDemoPayment("Insurance Panel (Guarantee Letter Approved)")}
                          >
                            Submit Panel Claim & Print Receipt
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div data-guide="billing-receipts" className="border-t border-[var(--line)] pt-4 space-y-2">
                    <h4 className="text-xs font-bold text-[var(--muted)] uppercase">Receipt log ({receiptLog.length})</h4>
                    {receiptLog.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">Payment receipts issued in this session will appear here.</p>
                    ) : receiptLog.map((receipt) => (
                      <div key={receipt.artifactId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] p-2 text-xs">
                        <span className="font-mono font-bold">{receipt.reference} · {receipt.patient.name}</span>
                        <button type="button" className="btn-secondary text-xs" onClick={() => openClinicDocument(receipt)}>
                          View / Print / Regenerate
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 2: DEDICATED PRACTITIONER COMMISSION LEDGER */}
            {billingSubTab === "commission" && (
              <div data-guide="ledger-overview" className="space-y-6">
                {/* Commission Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="clinic-card bg-[var(--surface)] border-t-4 border-t-[var(--blue)]">
                    <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Total Commission Accrued</span>
                    <strong className="text-2xl font-black text-[var(--blue)]">RM 48.00</strong>
                    <span className="text-[0.68rem] text-[var(--muted)] block mt-1">From active session billings</span>
                  </div>
                  <div className="clinic-card bg-[var(--surface)] border-t-4 border-t-[var(--mint-dark)]">
                    <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Attributed Practitioners</span>
                    <strong className="text-2xl font-black text-[var(--mint-dark)]">2 Staff</strong>
                    <span className="text-[0.68rem] text-[var(--muted)] block mt-1">1 Doctor · 1 Aesthetic Therapist</span>
                  </div>
                  <div className="clinic-card bg-[var(--surface)] border-t-4 border-t-[var(--amber-ink)]">
                    <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Payout Status</span>
                    <strong className="text-2xl font-black text-[var(--amber-ink)]">Pending End-of-Month</strong>
                    <span className="text-[0.68rem] text-[var(--muted)] block mt-1">Auto-aggregates to monthly payroll</span>
                  </div>
                </div>

                {/* Individual Practitioner Ledger Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="clinic-card space-y-3">
                    <div className="flex justify-between items-start pb-2 border-b border-[var(--line)]">
                      <div>
                        <h3 className="font-extrabold text-sm text-[var(--navy)]">Dr. Alicia Tan</h3>
                        <span className="text-[0.68rem] text-[var(--muted)]">Resident Doctor · MMC #48291</span>
                      </div>
                      <span className="badge badge-mint font-extrabold text-xs">+RM 18.00</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                        <div>
                          <strong className="block text-[var(--ink)]">Consultation Share</strong>
                          <span className="text-[0.68rem] text-[var(--muted)]">40% of standard RM 45.00 consult fee</span>
                        </div>
                        <span className="font-bold text-[var(--success)]">+RM 18.00</span>
                      </div>
                      <div className="flex justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                        <div>
                          <strong className="block text-[var(--ink)]">Retail Medication Dispense</strong>
                          <span className="text-[0.68rem] text-[var(--muted)]">0% (In-house dispensary tariff)</span>
                        </div>
                        <span className="font-bold text-[var(--muted)]">RM 0.00</span>
                      </div>
                    </div>
                  </div>

                  <div className="clinic-card space-y-3">
                    <div className="flex justify-between items-start pb-2 border-b border-[var(--line)]">
                      <div>
                        <h3 className="font-extrabold text-sm text-[var(--navy)]">Therapist Chloe Lim</h3>
                        <span className="text-[0.68rem] text-[var(--muted)]">Senior Aesthetic Therapist</span>
                      </div>
                      <span className="badge badge-mint font-extrabold text-xs">+RM 30.00</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                        <div>
                          <strong className="block text-[var(--ink)]">Laser Procedure Execution</strong>
                          <span className="text-[0.68rem] text-[var(--muted)]">10% session commission on RM 300 tier</span>
                        </div>
                        <span className="font-bold text-[var(--success)]">+RM 30.00</span>
                      </div>
                      <div className="flex justify-between p-2 rounded-lg bg-[var(--surface-2)]">
                        <div>
                          <strong className="block text-[var(--ink)]">Skincare Retail Incentive</strong>
                          <span className="text-[0.68rem] text-[var(--muted)]">5% retail sales bonus</span>
                        </div>
                        <span className="font-bold text-[var(--muted)]">RM 0.00</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ledger Journal Log Table */}
                <div className="clinic-card space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-[var(--line)]">
                    <h3 className="font-extrabold text-sm text-[var(--navy)]">
                      Recent Commission Credit Entries
                    </h3>
                    <span className="text-xs text-[var(--muted)] font-mono">Real-time ledger entries</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--line)] text-[var(--muted)] font-bold">
                          <th className="pb-2.5">Entry Reference</th>
                          <th className="pb-2.5">Beneficiary</th>
                          <th className="pb-2.5">Patient</th>
                          <th className="pb-2.5">Service Rendered</th>
                          <th className="pb-2.5">Tariff Base</th>
                          <th className="pb-2.5">Rate</th>
                          <th className="pb-2.5 text-right">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        <tr className="hover:bg-[var(--surface-2)]">
                          <td className="py-2.5 font-mono font-bold text-[var(--blue-on-soft)]">COMM-2026-001</td>
                          <td className="py-2.5 font-bold">Dr. Alicia Tan</td>
                          <td className="py-2.5 text-[var(--ink)]">{store.activePatient.name}</td>
                          <td className="py-2.5">General Outpatient Consult</td>
                          <td className="py-2.5 font-mono">RM 45.00</td>
                          <td className="py-2.5 font-bold">40%</td>
                          <td className="py-2.5 text-right font-extrabold text-[var(--success)]">+RM 18.00</td>
                        </tr>
                        <tr className="hover:bg-[var(--surface-2)]">
                          <td className="py-2.5 font-mono font-bold text-[var(--blue-on-soft)]">COMM-2026-002</td>
                          <td className="py-2.5 font-bold">Therapist Chloe Lim</td>
                          <td className="py-2.5 text-[var(--ink)]">{store.activePatient.name}</td>
                          <td className="py-2.5">Pico Laser Treatment Execution</td>
                          <td className="py-2.5 font-mono">RM 300.00</td>
                          <td className="py-2.5 font-bold">10%</td>
                          <td className="py-2.5 text-right font-extrabold text-[var(--success)]">+RM 30.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ==================== MODAL: ISSUE DIGITAL MEDICAL CERTIFICATE ==================== */}
      {mcModalOpen && (
        <Modal
          labelledBy="mc-modal-title"
          closeLabel="Close MC Dialog"
          onClose={() => setMcModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <span className="badge badge-mint mb-1">DIGIMC PROTOCOL</span>
              <h2 id="mc-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Issue Digital Medical Certificate (MC)
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Official clinic e-MC with QR cryptographic verification for employer portals.
              </p>
            </div>

            {/* Select Target Patient */}
            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Select Patient <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                value={mcPatientId || store.activePatient.id}
                onChange={(e) => {
                  setMcPatientId(e.target.value);
                  store.setActivePatientId(e.target.value);
                }}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--ink)]"
              >
                {store.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MRN: #{p.medicalRecordNumber || "—"} · IC: {p.nric || "—"})
                  </option>
                ))}
              </select>
            </div>

            {/* Attending Doctor */}
            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Attending Practitioner <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                value={mcDoctor}
                onChange={(e) => setMcDoctor(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
              >
                {store.staffList.filter((s) => s.role === "doctor").map((doc) => (
                  <option key={doc.id} value={doc.fullName}>
                    {doc.fullName} ({doc.specialty || "Resident Doctor"} {doc.licenseNumber ? `• ${doc.licenseNumber}` : ""})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Duration Buttons (HCI Hick's Law) */}
            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Duration (Days)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`btn-secondary text-xs flex-1 ${
                      mcDays === d ? "border-[var(--blue)] bg-[var(--blue-soft)] font-extrabold" : ""
                    }`}
                    onClick={() => setMcDays(d)}
                  >
                    {d} Day{d > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Clinical Diagnosis
              </label>
              <input
                value={mcDiagnosis}
                onChange={(e) => setMcDiagnosis(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
            </div>

            {/* Privacy Redaction Toggle */}
            <div className="p-3 bg-[var(--surface-2)] rounded-lg flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-[var(--ink)] block">
                  Employer Privacy Redaction
                </span>
                <span className="text-[0.68rem] text-[var(--muted)] block">
                  Redacts diagnosis details on employer-facing QR verification portal.
                </span>
              </div>
              <input
                type="checkbox"
                checked={mcRedactDiagnosis}
                onChange={(e) => setMcRedactDiagnosis(e.target.checked)}
                className="w-4 h-4 accent-[var(--blue)]"
              />
            </div>

            <div className="modal-footer">
              <button className="btn-secondary text-xs" onClick={() => setMcModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary text-xs"
                onClick={async () => {
                  const issued = await issueClinicalDocument("MC", {
                    patientId: mcPatientId || store.activePatient.id,
                    doctorName: mcDoctor,
                    days: mcDays,
                    startDate: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    diagnosis: mcDiagnosis,
                    isDiagnosisRedacted: mcRedactDiagnosis,
                  });
                  if (issued) setMcModalOpen(false);
                }}
              >
                Sign & Issue Digital MC
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================== MODAL: ISSUE REFERRAL LETTER ==================== */}
      {referralModalOpen && (
        <Modal
          labelledBy="ref-modal-title"
          closeLabel="Close Referral Dialog"
          onClose={() => setReferralModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <h2 id="ref-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Generate Hospital / Specialist Referral Letter
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Structured medical transfer letter for specialist consultation or hospital admission.
              </p>
            </div>

            {/* Select Target Patient */}
            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Select Patient <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                value={refPatientId || store.activePatient.id}
                onChange={(e) => {
                  setRefPatientId(e.target.value);
                  store.setActivePatientId(e.target.value);
                }}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--ink)]"
              >
                {store.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MRN: #{p.medicalRecordNumber || "—"} · IC: {p.nric || "—"})
                  </option>
                ))}
              </select>
            </div>

            {/* Referring Doctor */}
            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Referring Doctor <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                value={refDoctor}
                onChange={(e) => setRefDoctor(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
              >
                {store.staffList.filter((s) => s.role === "doctor").map((doc) => (
                  <option key={doc.id} value={doc.fullName}>
                    {doc.fullName} ({doc.specialty || "Resident Doctor"} {doc.licenseNumber ? `• ${doc.licenseNumber}` : ""})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Target Hospital / Medical Center
              </label>
              <input
                value={refSpecialty}
                onChange={(e) => setRefSpecialty(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Urgency Rating
              </label>
              <select
                value={refUrgency}
                onChange={(e) =>
                  setRefUrgency(
                    e.target.value as "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY"
                  )
                }
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              >
                <option value="ROUTINE">Routine Specialist Review</option>
                <option value="SEMI_URGENT">Semi-Urgent (Within 1-2 weeks)</option>
                <option value="URGENT_SAME_DAY">Urgent (Same Day Assessment)</option>
                <option value="EMERGENCY">Emergency (Immediate Transfer)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Reason for Referral
              </label>
              <input
                value={refReason}
                onChange={(e) => setRefReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Clinical Summary
              </label>
              <textarea
                value={refSummary}
                onChange={(e) => setRefSummary(e.target.value)}
                rows={3}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
            </div>

            <div className="modal-footer">
              <button className="btn-secondary text-xs" onClick={() => setReferralModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary text-xs"
                onClick={async () => {
                  const issued = await issueClinicalDocument("REFERRAL", {
                    patientId: refPatientId || store.activePatient.id,
                    doctorName: refDoctor,
                    hospitalOrSpecialty: refSpecialty,
                    urgency: refUrgency,
                    reason: refReason,
                    summary: refSummary,
                    medications: [],
                  });
                  if (issued) setReferralModalOpen(false);
                }}
              >
                Compile Referral PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================== MODAL: ISSUE LAB INVESTIGATION ==================== */}
      {labModalOpen && (
        <Modal
          labelledBy="lab-modal-title"
          closeLabel="Close Lab Dialog"
          onClose={() => setLabModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <h2 id="lab-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Lab Investigation Order Requisition
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Patient: <b>{store.activePatient.name}</b> ({store.activePatient.medicalRecordNumber || "—"})
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Select Test Panels
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {["Full Blood Count", "Lipid Profile", "Renal Function", "Liver Function", "HbA1c Glycemic", "Urine FEME"].map(
                  (panel) => (
                    <label
                      key={panel}
                      className="flex items-center gap-2 p-2 rounded bg-[var(--surface-2)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={labPanels.includes(panel)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLabPanels([...labPanels, panel]);
                          } else {
                            setLabPanels(labPanels.filter((p) => p !== panel));
                          }
                        }}
                        className="accent-[var(--blue)]"
                      />
                      <span>{panel}</span>
                    </label>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Specimen Type
                </label>
                <select
                  value={labSpecimen}
                  onChange={(e) => setLabSpecimen(e.target.value as "BLOOD" | "URINE" | "SWAB" | "BIOPSY")}
                  className="w-full text-xs p-2 rounded border border-[var(--line)] bg-[var(--surface-2)]"
                >
                  <option value="BLOOD">Venous Blood</option>
                  <option value="URINE">Midstream Urine</option>
                  <option value="SWAB">Nasal / Throat Swab</option>
                  <option value="BIOPSY">Skin Biopsy</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Fasting Requirement
                </label>
                <select
                  value={labFasting ? "yes" : "no"}
                  onChange={(e) => setLabFasting(e.target.value === "yes")}
                  className="w-full text-xs p-2 rounded border border-[var(--line)] bg-[var(--surface-2)]"
                >
                  <option value="yes">Yes (8-10 Hours Fasting)</option>
                  <option value="no">No Fasting Required</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary text-xs" onClick={() => setLabModalOpen(false)}>
                Cancel
              </button>
              <button
                className="btn-primary text-xs"
                onClick={async () => {
                  const issued = await issueClinicalDocument("LAB_REQUISITION", {
                    panels: labPanels, specimenType: labSpecimen, isFastingRequired: labFasting, notes: "",
                  });
                  if (issued) setLabModalOpen(false);
                }}
              >
                Create Lab Order Form
              </button>
            </div>
          </div>
        </Modal>
      )}



      {/* ==================== MODAL: DISPENSE PHARMACY STOCK (FEFO) ==================== */}
      {dispenseModalOpen && (
        <Modal
          labelledBy="dispense-modal-title"
          closeLabel="Close Dispense Dialog"
          onClose={() => setDispenseModalOpen(null)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <span className="badge badge-blue mb-1">FEFO DISPENSARY PIPELINE</span>
              <h2 id="dispense-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Dispense Stock Item
              </h2>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Dispense Quantity (Units)
              </label>
              <input
                type="number"
                value={dispenseQty}
                onChange={(e) => setDispenseQty(Number(e.target.value))}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
              />
            </div>

            <div className="p-3 bg-[var(--surface-2)] rounded-lg text-xs text-[var(--muted)]">
              System will automatically deduct from the earliest expiry batch first (FEFO invariant).
            </div>

            <div className="modal-footer">
              <button className="btn-secondary text-xs" onClick={() => setDispenseModalOpen(null)}>
                Cancel
              </button>
              <button
                className="btn-primary text-xs"
                onClick={() => {
                  store.dispenseStockItem(dispenseModalOpen, dispenseQty);
                  setDispenseModalOpen(null);
                }}
              >
                Confirm FEFO Dispensation
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================== DRAWER: AUTOMATED ALERTS & WHATSAPP LOG ==================== */}
      {alertsOpen && (
        <Modal
          labelledBy="alerts-title"
          closeLabel="Close Alerts Log"
          onClose={() => setAlertsOpen(false)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <h2 id="alerts-title" className="text-lg font-extrabold text-[var(--navy)] flex items-center gap-2">
                <span>💬</span> Automated WhatsApp & Email Alert Logs
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Demo notification previews. Live delivery requires a configured WhatsApp or email provider.
              </p>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {store.notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="badge badge-amber font-bold flex items-center gap-1">
                      <span>•</span> DEMO {notif.channel} PREVIEW
                    </span>
                    <span className="text-[0.68rem] text-[var(--muted)]">{notif.sentAt}</span>
                  </div>

                  <p className="font-bold text-[var(--ink)]">
                    To: {notif.patientName} ({notif.recipient})
                  </p>
                  <p className="text-[var(--muted)] text-[0.75rem] bg-[var(--surface)] p-2 rounded border border-[var(--line)] font-mono">
                    &ldquo;{notif.messagePreview}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {paymentQrOpen && (
        <Modal
          labelledBy="payment-qr-title"
          closeLabel="Close DuitNow QR Dialog"
          onClose={() => setPaymentQrOpen(false)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <span className="badge badge-blue mb-1">MALAYSIA · DUITNOW QR</span>
              <h2 id="payment-qr-title" className="text-lg font-extrabold text-[var(--navy)]">
                DuitNow QR Payment
              </h2>
              <p className="text-xs text-[var(--muted)]">Amount due: RM 63.00</p>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-xl bg-[var(--surface-2)] p-4 text-center">
              {store.portalConfig.customDuitNowQrImage ? (
                <div className="space-y-2 flex flex-col items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={store.portalConfig.customDuitNowQrImage}
                    alt="Clinic DuitNow QR"
                    className="max-h-64 max-w-full rounded-lg border border-[var(--line)] bg-white p-2 shadow-sm object-contain"
                  />
                  <span className="text-[0.68rem] font-bold text-[var(--blue-on-soft)] bg-[var(--blue-soft)] px-2.5 py-0.5 rounded-full">
                    Official Clinic DuitNow QR
                  </span>
                </div>
              ) : (
                <QrCode
                  value="CLINIC-DEMO-DUITNOW|MYR|63.00|INV-DEMO-2026-001"
                  label="Demo DuitNow payment QR code"
                />
              )}
              <p className="max-w-sm text-xs text-[var(--muted)]">
                {store.portalConfig.customDuitNowQrImage
                  ? "Scan using any Malaysian banking or e-wallet app (Maybank, CIMB, Touch 'n Go, GrabPay, Boost, etc.) to complete payment."
                  : "Demo QR preview. Clinic Admin can upload official DuitNow QR in Clinic Settings."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-primary text-xs" onClick={() => {
                recordDemoPayment("DuitNow QR · demo");
                setPaymentQrOpen(false);
              }}>
                Record payment as received
              </button>
              <button className="btn-secondary text-xs" onClick={() => setPaymentQrOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {documentToPrint && (
        <Modal
          className="modal-panel print-document-modal"
          labelledBy="clinic-document-heading"
          closeLabel="Close document preview"
          onClose={() => setDocumentToPrint(null)}
        >
          <ClinicDocumentPrintView
            document={documentToPrint}
            onRegenerate={regenerateClinicDocument}
            onPrintRecord={(record) => recordClinicDocumentPrint(documentToPrint, record)}
          />
          <p className="mt-3 text-center text-[0.68rem] text-[var(--muted)]">
            {demoMode ? `Demo print attempts in this session: ${documentPrintLog.length}` : `Recorded print attempts for this version: ${documentToPrint.printCount ?? 0}`}
          </p>
        </Modal>
      )}

      {/* ==================== MODAL: REGISTER NEW PATIENT (FRONT DESK) ==================== */}
      {regModalOpen && (
        <Modal
          labelledBy="reg-modal-title"
          closeLabel="Close Registration Dialog"
          onClose={() => setRegModalOpen(false)}
        >
          <form onSubmit={handleRegisterPatient} className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)] pr-8 sm:pr-0">
              <span className="badge badge-blue mb-1">FRONT DESK WORKFLOW</span>
              <h2 id="reg-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Register New Patient
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Register a patient master record and optionally issue a live queue ticket.
              </p>
            </div>

            {/* ID Type Segmented Picker (NRIC vs Foreign Passport) */}
            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Identification Document Type
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--surface-2)] rounded-lg border border-[var(--line)]">
                <button
                  type="button"
                  className={`py-1.5 text-xs font-bold rounded-md transition ${
                    regIdType === "nric"
                      ? "bg-[var(--surface)] text-[var(--blue)] shadow-xs font-extrabold"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setRegIdType("nric")}
                >
                  🇲🇾 Malaysian IC (MyKad)
                </button>
                <button
                  type="button"
                  className={`py-1.5 text-xs font-bold rounded-md transition ${
                    regIdType === "passport"
                      ? "bg-[var(--surface)] text-[var(--blue)] shadow-xs font-extrabold"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                  onClick={() => setRegIdType("passport")}
                >
                  🌐 Foreign Passport / ID
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Full Name <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. Tan Mei Ling"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-semibold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  {regIdType === "nric" ? "Malaysian IC (12 Digits)" : "Passport / Foreign ID No."} <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={regNric}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    setRegNric(value);
                    if (regIdType === "nric") {
                      const inferredGender = genderFromMalaysianIc(value);
                      if (inferredGender) setRegGender(inferredGender);
                    }
                  }}
                  placeholder={regIdType === "nric" ? "e.g. 950101-10-1235" : "e.g. A12345678"}
                  maxLength={regIdType === "nric" ? 14 : 30}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
                {regIdType === "nric" && (
                  <span className="text-[0.65rem] text-[var(--muted)] mt-0.5 block">
                    Gender is automatically derived from the last digit.
                  </span>
                )}
              </div>
            </div>

            {/* Flexible Phone Input with Comprehensive World Country Codes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Mobile Phone <span className="font-normal text-[var(--muted)] normal-case">(optional)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-1.5">
                  <select
                    value={regCountryCode}
                    onChange={(e) => setRegCountryCode(e.target.value)}
                    className="w-full sm:w-36 text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                  >
                    {WORLD_COUNTRY_CODES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    value={regPhoneRaw}
                    onChange={(e) => setRegPhoneRaw(e.target.value)}
                    placeholder="12-345 6789"
                    className="flex-1 min-w-0 text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Nationality <span className="text-[var(--danger)]">*</span>
                </label>
                <select
                  value={regNationality}
                  onChange={(e) => setRegNationality(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-semibold"
                >
                  {NATIONALITIES.map((nat) => (
                    <option key={nat} value={nat}>
                      {nat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Email Address & Residential Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Email Address <span className="font-normal text-[var(--muted)] normal-case">(optional)</span>
                </label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Residential Address <span className="font-normal text-[var(--muted)] normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  placeholder="e.g. No. 12, Jalan Ampang, Kuala Lumpur"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Date of Birth <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={regDob}
                  onChange={(e) => setRegDob(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Gender
                </label>
                {regIdType === "nric" && regIcGender ? (
                  <select
                    value={regIcGender}
                    disabled
                    className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--blue)] cursor-not-allowed"
                  >
                    <option value={regIcGender}>{regIcGender} (from IC)</option>
                  </select>
                ) : (
                  <select
                    value={regGender}
                    onChange={(e) => setRegGender(e.target.value as "Female" | "Male" | "Other")}
                    className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Blood Group <span className="font-normal normal-case">(optional)</span>
                </label>
                <select
                  value={regBloodGroup}
                  onChange={(e) => setRegBloodGroup(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono"
                >
                  <option value="">Not provided</option>
                  <option value="O+">O+</option>
                  <option value="A+">A+</option>
                  <option value="B+">B+</option>
                  <option value="AB+">AB+</option>
                  <option value="O-">O-</option>
                  <option value="A-">A-</option>
                  <option value="B-">B-</option>
                  <option value="AB-">AB-</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Known Drug Allergies (Clinical Safety)
              </label>
              <input
                type="text"
                value={regAllergyText}
                onChange={(e) => setRegAllergyText(e.target.value)}
                placeholder="e.g. Penicillin, NSAIDs (Leave empty if NKDA)"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
              <span className="text-[0.68rem] text-[var(--muted)] mt-0.5 block">
                Comma-separated. Leave empty for No Known Drug Allergies (NKDA).
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Chronic Medical Conditions
              </label>
              <input
                type="text"
                value={regConditionsText}
                onChange={(e) => setRegConditionsText(e.target.value)}
                placeholder="e.g. Hypertension, Asthma"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-[var(--line)] p-3 text-xs">
              <input required type="checkbox" checked={regPdpaConsent} onChange={(e) => setRegPdpaConsent(e.target.checked)} className="mt-0.5 accent-[var(--blue)]" />
              <span>I confirm the patient has provided consent for collection and use of this information for clinic care, and that the clinic's PDPA notice was provided.</span>
            </label>

            <div className="p-3 bg-[var(--blue-soft)] border border-[var(--blue)]/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-[var(--blue-on-soft)] block">
                    Immediately Issue Queue Ticket
                  </span>
                  <span className="text-[0.68rem] text-[var(--muted)]">
                    Saves a queue ticket in the clinic database upon registration.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={regEnqueueNow}
                  onChange={(e) => setRegEnqueueNow(e.target.checked)}
                  className="w-4 h-4 accent-[var(--blue)] cursor-pointer"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setRegModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary text-xs">
                Save & Register Patient
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ==================== MODAL: CHECK-IN RETURNING PATIENT (FRONT DESK) ==================== */}
      {checkInModalOpen && (
        <Modal
          labelledBy="checkin-modal-title"
          closeLabel="Close Check-In Dialog"
          onClose={() => setCheckInModalOpen(false)}
        >
          <div className="space-y-4">
            <div className="pb-2 border-b border-[var(--line)]">
              <span className="badge badge-blue mb-1">FRONT DESK QUEUE DISPATCH</span>
              <h2 id="checkin-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Issue Queue Ticket (Check-In)
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Select or search a registered patient from the directory to issue an active queue ticket.
              </p>
            </div>

            {/* Interactive Search Box */}
            <div className="relative">
              <input
                type="text"
                value={checkInSearch}
                onChange={(e) => setCheckInSearch(e.target.value)}
                placeholder="Search patient by name, MRN, or phone number..."
                className="w-full text-xs p-2.5 pl-8 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)]"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-[var(--muted)]">🔍</span>
            </div>

            {/* Clickable Patient Cards Directory */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(() => {
                const filtered = store.patients.filter((p) =>
                  !checkInSearch.trim() ||
                  p.name.toLowerCase().includes(checkInSearch.toLowerCase()) ||
                  (p.medicalRecordNumber ?? "").toLowerCase().includes(checkInSearch.toLowerCase()) ||
                  p.phone.includes(checkInSearch)
                );

                if (filtered.length === 0) {
                  return (
                    <div className="p-6 text-center rounded-xl border border-dashed border-[var(--line)] text-xs text-[var(--muted)] space-y-2">
                      <p>No patients matched &ldquo;{checkInSearch}&rdquo;.</p>
                      <button
                        type="button"
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => {
                          setCheckInModalOpen(false);
                          setRegModalOpen(true);
                        }}
                      >
                        ➕ Register New Patient Instead
                      </button>
                    </div>
                  );
                }

                return filtered.map((pat) => {
                  const inQueue = store.queue.find(
                    (q) => q.patientId === pat.id && (q.status === "WAITING" || q.status === "CALLED_TO_ROOM" || q.status === "IN_CONSULTATION" || q.status === "DISPENSARY" || q.status === "PAYMENT")
                  );

                  return (
                    <div
                      key={pat.id}
                      className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                        inQueue
                          ? "bg-[var(--surface-2)]/50 border-[var(--line)] opacity-70"
                          : checkInPatientId === pat.id
                          ? "bg-[var(--blue-soft)] border-[var(--blue)] shadow-xs"
                          : "bg-[var(--surface)] border-[var(--line)] hover:border-[var(--blue)] hover:bg-[var(--surface-2)] cursor-pointer"
                      }`}
                      onClick={() => {
                        if (!inQueue) setCheckInPatientId(pat.id);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs text-[var(--ink)] block truncate">{pat.name}</strong>
                          <span className="text-[0.65rem] font-mono font-bold text-[var(--blue-on-soft)] bg-[var(--blue-soft)] px-1.5 py-0.2 rounded">
                            {pat.medicalRecordNumber || "—"}
                          </span>
                        </div>
                        <span className="text-[0.7rem] text-[var(--muted)] block truncate">
                          {pat.phone ? `📞 ${pat.phone}` : "No phone"} • {pat.age} yrs • {pat.gender}
                        </span>
                      </div>

                      <div>
                        {inQueue ? (
                          <span className="badge badge-amber text-[0.65rem] whitespace-nowrap">
                            In Queue ({inQueue.ticketNumber})
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap flex items-center gap-1 shadow-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCheckInExisting(pat.id);
                            }}
                          >
                            <span>🎫</span>
                            <span>Issue Ticket</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="pt-3 border-t border-[var(--line)] flex justify-between items-center">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => {
                  setCheckInModalOpen(false);
                  setRegModalOpen(true);
                }}
              >
                ➕ Register New Patient
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setCheckInModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================== MODAL: RECEIVE INVENTORY BATCH (STOCK IN) ==================== */}
      {stockInModalOpen && (
        <Modal
          labelledBy="stockin-modal-title"
          closeLabel="Close Stock In Dialog"
          onClose={() => setStockInModalOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!stockInItemId) {
                notify("Select an inventory item to stock in.", "error");
                return;
              }
              if (!stockInBatchNumber.trim()) {
                notify("Enter a batch / lot number.", "error");
                return;
              }
              if (!stockInExpiryDate) {
                notify("Specify an expiry date for this batch.", "error");
                return;
              }
              if (stockInQuantity <= 0) {
                notify("Quantity must be greater than zero.", "error");
                return;
              }
              store.receiveStockBatch({
                itemId: stockInItemId,
                batchNumber: stockInBatchNumber.trim().toUpperCase(),
                expiryDate: stockInExpiryDate,
                quantity: Number(stockInQuantity),
                supplier: stockInSupplier.trim(),
              });
              setStockInModalOpen(false);
              setStockInBatchNumber("");
              setStockInSupplier("");
            }}
            className="space-y-4"
          >
            <div className="pb-2 border-b border-[var(--line)]">
              <span className="badge badge-mint mb-1">DISPENSARY INVENTORY</span>
              <h2 id="stockin-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
                Receive Stock Batch (Stock In)
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Record newly received batches from distributors. FEFO engine tracks earliest expiry automatically.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Select Item <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                required
                value={stockInItemId}
                onChange={(e) => setStockInItemId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-semibold"
              >
                <option value="">-- Choose Stock Item --</option>
                {store.inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.sku}] {item.name} ({item.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Batch / Lot Number <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={stockInBatchNumber}
                  onChange={(e) => setStockInBatchNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. LOT-2026-X89"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Expiry Date (FEFO) <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="date"
                  value={stockInExpiryDate}
                  onChange={(e) => setStockInExpiryDate(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Quantity Received (Units) <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="number"
                  min="1"
                  value={stockInQuantity}
                  onChange={(e) => setStockInQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Supplier / Distributor <span className="font-normal text-[var(--muted)] normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={stockInSupplier}
                  onChange={(e) => setStockInSupplier(e.target.value)}
                  placeholder="e.g. Zuellig Pharma / Apex"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setStockInModalOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary text-xs">
                📥 Receive & Stock In
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ==================== MODAL: PATIENT DOSSIER VIEW (FRONT DESK) ==================== */}
      {viewPatientModal && (() => {
        const patient = store.patients.find((p) => p.id === viewPatientModal);
        if (!patient) return null;
        const activeTicket = store.queue.find(
          (q) => q.patientId === patient.id && (q.status === "WAITING" || q.status === "CALLED_TO_ROOM" || q.status === "IN_CONSULTATION")
        );

        return (
          <Modal
            labelledBy="patient-profile-title"
            closeLabel="Close Patient Profile"
            onClose={() => setViewPatientModal(null)}
          >
            <div className="space-y-4">
              <div className="pb-2 border-b border-[var(--line)] flex justify-between items-start">
                <div>
                  <span className="badge badge-blue mb-1">PATIENT DOSSIER</span>
                  <h2 id="patient-profile-title" className="text-lg font-extrabold text-[var(--navy)]">
                    {patient.name}
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    NRIC: <span className="font-mono font-bold text-[var(--ink)]">{viewPatientNric ?? (viewPatientNricError ? "Unavailable" : "Loading…")}</span> • DOB: {patient.dob} ({patient.age} yrs, {patient.gender})
                  </p>
                </div>
                {activeTicket ? (
                  <span className="badge badge-amber font-bold">In Queue: {activeTicket.ticketNumber}</span>
                ) : (
                  <span className="badge badge-mint">Not in Queue</span>
                )}
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--surface-2)] p-3 rounded-xl border border-[var(--line)]">
                <div>
                  <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Mobile Phone</span>
                  <span className="font-bold text-[var(--ink)]">{patient.phone}</span>
                </div>
                <div>
                  <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Email Address</span>
                  <span className="font-medium text-[var(--ink)]">{patient.email || "—"}</span>
                </div>
                <div>
                  <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Blood Group</span>
                  <span className="font-bold text-[var(--ink)]">{patient.bloodGroup || "Not recorded"}</span>
                </div>
                <div>
                  <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Drug Allergies</span>
                  {patient.allergies.length > 0 ? (
                    <span className="text-[var(--danger)] font-bold">
                      ⚠️ {patient.allergies.map((a) => `${a.substance} (${a.severity})`).join(", ")}
                    </span>
                  ) : (
                    <span className="badge badge-mint text-[0.65rem]">NKDA</span>
                  )}
                </div>
              </div>

              {/* Dedicated Actions */}
              <div className="pt-3 border-t border-[var(--line)] flex justify-between items-center">
                <div>
                  {!activeTicket && (
                    <button
                      className="btn-primary text-xs py-1.5 px-3"
                      onClick={() => {
                        store.enqueueExistingPatient(patient.id);
                        setViewPatientModal(null);
                      }}
                    >
                      🎫 Issue Queue Ticket Now
                    </button>
                  )}
                </div>
                <button className="btn-secondary text-xs" onClick={() => setViewPatientModal(null)}>
                  Close
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ==================== MODAL: SYSTEM & KEYBOARD GUIDE ==================== */}
      {guideModalOpen && (
        <GuideModal onClose={() => setGuideModalOpen(false)} />
      )}

      {/* ==================== MODAL: ROLE ACCESS CONTROL (RBAC) ==================== */}
      {permissionsModalOpen && (
        <RolePermissionsModal
          onClose={() => setPermissionsModalOpen(false)}
          rolePermissions={store.rolePermissions}
          onTogglePermission={store.toggleRolePermission}
          onGrantAll={store.grantAllRolePermissions}
          onResetDefaults={store.resetDefaultPermissions}
        />
      )}

      {/* ==================== MODAL: PORTAL BRANDING & CLINIC SETTINGS ==================== */}
      {portalSettingsModalOpen && (
        <PortalSettingsModal
          onClose={() => setPortalSettingsModalOpen(false)}
          config={store.portalConfig}
          onSave={store.updatePortalConfig}
          onReset={store.resetPortalConfig}
        />
      )}

      {/* ==================== MODAL: USER & DOCTOR ROSTER MANAGEMENT ==================== */}
      {userManagementModalOpen && (
        <UserManagementModal
          onClose={() => setUserManagementModalOpen(false)}
          staffList={store.staffList}
          onRegisterStaff={store.registerStaffUser}
          onResetPassword={store.resetStaffUserPassword}
          onToggleStatus={store.toggleStaffStatus}
        />
      )}

      {/* ==================== MODAL: ADD NEW FORMULARY DRUG ==================== */}
      {addDrugModalOpen && (
        <AddDrugModal
          onClose={() => setAddDrugModalOpen(false)}
          onAdd={store.addInventoryItem}
        />
      )}

      {/* ==================== MODAL: EDIT FORMULARY DRUG ==================== */}
      {editDrugModal && (
        <Modal
          labelledBy="edit-drug-title"
          closeLabel="Close Edit Drug Dialog"
          onClose={() => setEditDrugModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              store.updateInventoryItem(editDrugModal);
              setEditDrugModal(null);
              notify(`Updated ${editDrugModal.name} in master formulary.`, "success");
            }}
            className="space-y-4 max-w-xl pr-2"
          >
            <div className="pb-2 border-b border-[var(--line)]">
              <span className="badge badge-blue mb-1">CLINIC FORMULARY</span>
              <h2 id="edit-drug-title" className="text-lg font-extrabold text-[var(--navy)]">
                Edit Medicine Details: {editDrugModal.name}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Update pharmaceutical specifications, clinical dosing instructions, and selling tariffs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Medicine Name <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={editDrugModal.name}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, name: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--ink)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  SKU Code <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={editDrugModal.sku}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, sku: e.target.value.toUpperCase() })}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Strength
                </label>
                <input
                  type="text"
                  value={editDrugModal.strength || ""}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, strength: e.target.value })}
                  placeholder="e.g. 500mg / 10mg"
                  className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Dosage Form
                </label>
                <input
                  type="text"
                  value={editDrugModal.dosageForm || ""}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, dosageForm: e.target.value })}
                  placeholder="e.g. Tablet, Syrup, Cream"
                  className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Category
                </label>
                <select
                  value={editDrugModal.category}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, category: e.target.value as any })}
                  className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                >
                  <option value="MEDICATION">Medication (Rx)</option>
                  <option value="AESTHETIC_CONSUMABLE">Aesthetic Consumable</option>
                  <option value="SKINCARE_RETAIL">Skincare Retail</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                Default Dosing / Dispensing Instructions
              </label>
              <textarea
                value={editDrugModal.instructions || ""}
                onChange={(e) => setEditDrugModal({ ...editDrugModal, instructions: e.target.value })}
                rows={2}
                placeholder="e.g. 1 tablet twice daily after food"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Selling Price (RM) <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={editDrugModal.sellingPrice}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, sellingPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Minimum Par Level (Low Stock Threshold) <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  value={editDrugModal.minimumParLevel}
                  onChange={(e) => setEditDrugModal({ ...editDrugModal, minimumParLevel: parseInt(e.target.value) || 0 })}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setEditDrugModal(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary text-xs">
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
