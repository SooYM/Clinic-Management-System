/** Immutable data needed to reproduce a clinic document from a reception log. */
export type ClinicDocumentKind = "MC" | "REFERRAL" | "LAB_REQUISITION" | "RECEIPT" | "LETTER";

export interface ClinicDocumentPatient {
  name: string;
  /** Malaysian identity number; omit when the document does not require it. */
  identityNumber?: string;
  patientNumber?: string;
  dateOfBirth?: string;
  contactNumber?: string;
}

export interface ClinicDocumentSection {
  heading: string;
  paragraphs?: string[];
  fields?: Array<{ label: string; value: string }>;
  items?: string[];
}

export interface ClinicDocumentArtifact {
  /** Stable identity shared by all print revisions of this issued document. */
  artifactId: string;
  /** Human-facing reference such as MC number, receipt number, or referral number. */
  reference: string;
  kind: ClinicDocumentKind;
  title: string;
  issuedAt: string;
  version: number;
  /** Number of durable print attempts recorded for this version. */
  printCount?: number;
  verificationUrl?: string;
  /** Persisted issuance inputs used to create later immutable revisions. */
  sourceData?: Record<string, unknown>;
  patient: ClinicDocumentPatient;
  practitioner?: { name: string; registrationNumber?: string };
  sections: ClinicDocumentSection[];
  /** Clinic details are snapshotted so historic documents stay reproducible. */
  clinic: {
    name: string;
    addressLines: string[];
    phone?: string;
    registrationNumber?: string;
    currency?: "MYR";
  };
}

export interface DocumentPrintRecord {
  printId: string;
  printedAt: string;
  artifactId: string;
  version: number;
}

export type NewClinicDocumentArtifact = Omit<ClinicDocumentArtifact, "artifactId" | "version"> & {
  artifactId?: string;
  version?: number;
};
