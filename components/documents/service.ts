import type {
  ClinicDocumentArtifact,
  DocumentPrintRecord,
  NewClinicDocumentArtifact,
} from "./types";

const createId = (prefix: string): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
};

/** Creates a reproducible document snapshot suitable for persisting with an encounter or log entry. */
export function createClinicDocumentArtifact(
  input: NewClinicDocumentArtifact,
): ClinicDocumentArtifact {
  return {
    ...input,
    artifactId: input.artifactId ?? createId(input.kind.toLowerCase()),
    version: input.version ?? 1,
    patient: { ...input.patient },
    practitioner: input.practitioner ? { ...input.practitioner } : undefined,
    clinic: { ...input.clinic, addressLines: [...input.clinic.addressLines] },
    sections: input.sections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs ? [...section.paragraphs] : undefined,
      fields: section.fields?.map((field) => ({ ...field })),
      items: section.items ? [...section.items] : undefined,
    })),
  };
}

/**
 * Makes a new document revision from the current clinical/billing source data.
 * Keep prior revisions in the audit log; never overwrite an issued artifact.
 */
export function regenerateClinicDocumentArtifact(
  previous: ClinicDocumentArtifact,
  current: Omit<NewClinicDocumentArtifact, "artifactId" | "version">,
): ClinicDocumentArtifact {
  return createClinicDocumentArtifact({
    ...current,
    artifactId: previous.artifactId,
    version: previous.version + 1,
  });
}

/** Records a print attempt independently from document issuance/version history. */
export function createDocumentPrintRecord(
  artifact: ClinicDocumentArtifact,
  printedAt = new Date().toISOString(),
): DocumentPrintRecord {
  return {
    printId: createId("print"),
    printedAt,
    artifactId: artifact.artifactId,
    version: artifact.version,
  };
}

export function formatMalaysiaDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(date);
}
