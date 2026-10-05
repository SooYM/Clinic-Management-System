import type { DigitalMCData, LabOrderData, ReferralLetterData } from "../../lib/data/clinic-store";
import { createClinicDocumentArtifact } from "./service";
import type { ClinicDocumentArtifact } from "./types";

type ClinicSnapshot = ClinicDocumentArtifact["clinic"];

/** Adapt the current issued-MC records to the shared print view. Diagnosis is omitted when redacted. */
export function documentFromMC(data: DigitalMCData, clinic: ClinicSnapshot): ClinicDocumentArtifact {
  return createClinicDocumentArtifact({
    artifactId: data.id,
    reference: data.mcNumber,
    kind: "MC",
    title: "Medical Certificate",
    issuedAt: data.issuedAt,
    version: 1,
    patient: { name: data.patientName, identityNumber: data.patientNric },
    practitioner: { name: data.doctorName, registrationNumber: data.licenseNumber },
    clinic,
    sections: [
      {
        heading: "Medical leave",
        paragraphs: [
          `This is to confirm that ${data.patientName} was assessed at the clinic and is advised medical leave from ${data.startDate} to ${data.endDate} (${data.totalDays} day${data.totalDays === 1 ? "" : "s"}).`,
          ...(data.isDiagnosisRedacted || !data.diagnosis ? [] : [`Clinical information: ${data.diagnosis}`]),
        ],
      },
    ],
  });
}

export function documentFromReferral(data: ReferralLetterData, clinic: ClinicSnapshot): ClinicDocumentArtifact {
  const urgency = {
    ROUTINE: "Routine",
    SEMI_URGENT: "Semi-urgent",
    URGENT_SAME_DAY: "Urgent (same day)",
    EMERGENCY: "Emergency transfer",
  }[data.urgency];
  return createClinicDocumentArtifact({
    artifactId: data.id,
    reference: data.referralNumber,
    kind: "REFERRAL",
    title: "Referral Letter",
    issuedAt: data.issuedAt,
    version: 1,
    patient: { name: data.patientName },
    practitioner: { name: data.referringDoctor },
    clinic,
    sections: [
      { heading: "Referral destination", fields: [{ label: "Hospital / specialty", value: data.targetHospitalOrSpecialty }, { label: "Urgency", value: urgency }] },
      { heading: "Reason for referral", paragraphs: [data.reasonForReferral] },
      { heading: "Clinical summary", paragraphs: [data.clinicalSummary] },
      ...(data.medications.length ? [{ heading: "Current medications", items: data.medications }] : []),
    ],
  });
}

export function documentFromLabOrder(data: LabOrderData, clinic: ClinicSnapshot): ClinicDocumentArtifact {
  return createClinicDocumentArtifact({
    artifactId: data.id,
    reference: data.orderNumber,
    kind: "LAB_REQUISITION",
    title: "Laboratory Requisition",
    issuedAt: data.issuedAt,
    version: 1,
    patient: { name: data.patientName },
    practitioner: { name: data.orderingDoctor },
    clinic,
    sections: [
      { heading: "Requested investigations", items: data.panels },
      { heading: "Collection details", fields: [
        { label: "Specimen", value: data.specimenType },
        { label: "Fasting", value: data.isFastingRequired ? "Required; follow clinic instructions" : "Not indicated" },
        { label: "Order status", value: data.status.replaceAll("_", " ") },
      ] },
      ...(data.clinicalNotes ? [{ heading: "Clinical notes", paragraphs: [data.clinicalNotes] }] : []),
    ],
  });
}
