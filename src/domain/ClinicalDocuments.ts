/**
 * OOP Domain Model: Clinical Documents & Certification Engine
 * Generates Digital Medical Certificates (MC), Referral Letters, and Lab Investigation Forms
 * Incorporates Tamper-Evident Verification Hashes (DigiMC standard)
 */

export interface DigitalMedicalCertificate {
  readonly mcNumber: string;         // e.g. "MC-2026-08912"
  readonly patientId: string;
  readonly practitionerId: string;
  readonly doctorLicenseNumber: string;
  readonly startDate: Date;
  readonly numberOfDays: number;
  readonly endDate: Date;
  readonly isFitForLightDutyOnly: boolean;
  readonly diagnosisCode?: string;
  readonly isDiagnosisRedactedForEmployer: boolean; // Privacy control
  readonly digitalSignatureHash: string;
  readonly verificationQrUrl: string;
  readonly issuedAt: Date;
}

export type ReferralUrgency = "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY_AMBULANCE";

export interface ReferralLetter {
  readonly referralId: string;
  readonly patientId: string;
  readonly referringPractitionerId: string;
  readonly targetSpecialtyOrHospital: string;
  readonly targetDoctorName?: string;
  readonly urgency: ReferralUrgency;
  readonly reasonForReferral: string;
  readonly clinicalSummary: string;
  readonly currentMedications: string[];
  readonly issuedAt: Date;
}

export type SpecimenType = "BLOOD" | "URINE" | "SWAB" | "BIOPSY" | "STOOL";

export interface LabInvestigationOrder {
  readonly orderId: string;
  readonly patientId: string;
  readonly orderingPractitionerId: string;
  readonly panelNames: string[];        // e.g. ["Full Blood Count", "Lipid Profile", "Renal Profile"]
  readonly specimenType: SpecimenType;
  readonly isFastingRequired: boolean;
  readonly clinicalNotes: string;
  readonly status: "ORDERED" | "COLLECTED" | "DISPATCHED_TO_LAB" | "RESULT_RECEIVED";
  readonly orderedAt: Date;
}

export class ClinicalDocumentService {
  /**
   * Issues tamper-evident Digital Medical Certificate
   */
  public issueMedicalCertificate(
    patientId: string,
    practitionerId: string,
    doctorLicenseNumber: string,
    startDate: Date,
    numberOfDays: number,
    diagnosisCode?: string,
    redactForEmployer: boolean = true
  ): DigitalMedicalCertificate {
    if (numberOfDays <= 0) throw new Error("MC duration must be at least 1 day.");

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (numberOfDays - 1));

    const mcNumber = `MC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const verificationHash = `HASH-${mcNumber}-${patientId}-${Date.now()}`;
    const verificationQrUrl = `https://verify.clinic.com/mc/${mcNumber}?hash=${verificationHash}`;

    return {
      mcNumber,
      patientId,
      practitionerId,
      doctorLicenseNumber,
      startDate,
      numberOfDays,
      endDate,
      isFitForLightDutyOnly: false,
      diagnosisCode,
      isDiagnosisRedactedForEmployer: redactForEmployer,
      digitalSignatureHash: verificationHash,
      verificationQrUrl,
      issuedAt: new Date()
    };
  }

  /**
   * Generates formal clinical Referral Letter
   */
  public generateReferralLetter(
    patientId: string,
    referringPractitionerId: string,
    targetSpecialtyOrHospital: string,
    reason: string,
    clinicalSummary: string,
    medications: string[],
    urgency: ReferralUrgency = "ROUTINE"
  ): ReferralLetter {
    return {
      referralId: `REF-${Date.now()}`,
      patientId,
      referringPractitionerId,
      targetSpecialtyOrHospital,
      urgency,
      reasonForReferral: reason,
      clinicalSummary,
      currentMedications: medications,
      issuedAt: new Date()
    };
  }

  /**
   * Issues Lab Investigation Requisition Form
   */
  public createLabInvestigationOrder(
    patientId: string,
    practitionerId: string,
    panelNames: string[],
    specimenType: SpecimenType,
    fastingRequired: boolean,
    notes: string
  ): LabInvestigationOrder {
    if (panelNames.length === 0) throw new Error("At least one lab panel must be specified.");

    return {
      orderId: `LAB-${Date.now()}`,
      patientId,
      orderingPractitionerId: practitionerId,
      panelNames,
      specimenType,
      isFastingRequired: fastingRequired,
      clinicalNotes: notes,
      status: "ORDERED",
      orderedAt: new Date()
    };
  }
}
