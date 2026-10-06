"use client";

import { useEffect, useState } from "react";
import styles from "./clinic-document-print.module.css";
import { QrCode } from "../QrCode";
import { createDocumentPrintRecord, formatMalaysiaDateTime } from "./service";
import type { ClinicDocumentArtifact, DocumentPrintRecord } from "./types";

interface ClinicDocumentPrintViewProps {
  document: ClinicDocumentArtifact;
  /** Regenerate from the latest encounter/billing data and return the saved revision. */
  onRegenerate?: (current: ClinicDocumentArtifact) => ClinicDocumentArtifact | Promise<ClinicDocumentArtifact>;
  /** Persist the print audit record in the caller's log store. */
  onPrintRecord?: (record: DocumentPrintRecord) => void | DocumentPrintRecord | Promise<void | DocumentPrintRecord>;
}

const KIND_LABEL: Record<ClinicDocumentArtifact["kind"], string> = {
  MC: "Medical certificate",
  REFERRAL: "Referral letter",
  LAB_REQUISITION: "Laboratory requisition",
  RECEIPT: "Receipt",
  LETTER: "Clinic letter",
};

export function ClinicDocumentPrintView({
  document,
  onRegenerate,
  onPrintRecord,
}: ClinicDocumentPrintViewProps) {
  const [activeDocument, setActiveDocument] = useState(document);
  const [printRecord, setPrintRecord] = useState<DocumentPrintRecord | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setActiveDocument(document), [document]);

  const print = async () => {
    const record = createDocumentPrintRecord(activeDocument);
    setError("");
    try {
      const persistedRecord = await onPrintRecord?.(record);
      setPrintRecord(persistedRecord ?? record);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record this print attempt.");
      return;
    }
    // Let the print id reach the DOM before the browser captures the page.
    window.requestAnimationFrame(() => window.print());
  };

  const regenerate = async () => {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    setError("");
    try {
      const next = await onRegenerate(activeDocument);
      setActiveDocument(next);
      setPrintRecord(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not regenerate this document.");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <section className={styles.viewer} aria-label={`${activeDocument.title} document preview`}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarMeta}>
          <span className={styles.toolbarEyebrow}>Document preview</span>
          <span className={styles.toolbarTitle}>{activeDocument.title}</span>
          <span className={styles.toolbarRef}>{activeDocument.reference} · version {activeDocument.version}</span>
        </div>
        <div className={styles.actions}>
          {onRegenerate && (
            <button className={styles.secondaryButton} type="button" onClick={regenerate} disabled={regenerating}>
              {regenerating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
          <button className={styles.primaryButton} type="button" onClick={print}>
            Print / Save PDF
          </button>
        </div>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}

      <article className={`${styles.paper} clinic-document-print`}>
        <header className={styles.documentHeader}>
          <div>
            <div className={styles.clinicName}>{activeDocument.clinic.name}</div>
            <div className={styles.clinicAddress}>{activeDocument.clinic.addressLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</div>
            {activeDocument.clinic.phone && <div className={styles.clinicContact}>Tel {activeDocument.clinic.phone}</div>}
            {activeDocument.clinic.registrationNumber && <div className={styles.clinicContact}>Registration {activeDocument.clinic.registrationNumber}</div>}
          </div>
          <div className={styles.documentType}>
            <span>{KIND_LABEL[activeDocument.kind]}</span>
            <strong id="clinic-document-heading">{activeDocument.title}</strong>
            <span>Reference: {activeDocument.reference}</span>
          </div>
        </header>

        <div className={styles.documentRule} />
        <div className={styles.patientBlock}>
          <div>
            <span className={styles.label}>Patient</span>
            <strong>{activeDocument.patient.name}</strong>
          </div>
          {activeDocument.patient.identityNumber && <div><span className={styles.label}>NRIC / ID</span><span>{activeDocument.patient.identityNumber}</span></div>}
          {activeDocument.patient.patientNumber && <div><span className={styles.label}>Patient no.</span><span>{activeDocument.patient.patientNumber}</span></div>}
          {activeDocument.patient.dateOfBirth && <div><span className={styles.label}>Date of birth</span><span>{activeDocument.patient.dateOfBirth}</span></div>}
          {activeDocument.patient.contactNumber && <div><span className={styles.label}>Contact</span><span>{activeDocument.patient.contactNumber}</span></div>}
        </div>

        <main className={styles.documentBody}>
          {activeDocument.sections.map((section, sectionIndex) => (
            <section className={styles.contentSection} key={`${section.heading}-${sectionIndex}`}>
              <h2>{section.heading}</h2>
              {section.fields && <dl className={styles.fields}>{section.fields.map((field, index) => <div key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>}
              {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {section.items && <ul>{section.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}
            </section>
          ))}
        </main>

        <footer className={styles.documentFooter}>
          <div className={styles.issueMeta}>
            <span>Issued {formatMalaysiaDateTime(activeDocument.issuedAt)} (Malaysia time)</span>
            <span>Document ID {activeDocument.artifactId} · Version {activeDocument.version}</span>
            {printRecord && <span>Print ID {printRecord.printId} · Printed {formatMalaysiaDateTime(printRecord.printedAt)} (Malaysia time)</span>}
          </div>
          <div className={styles.documentQr}>
            <QrCode
              value={activeDocument.verificationUrl ?? ("clinic-document:" + activeDocument.kind + ":" + activeDocument.reference + ":v" + activeDocument.version)}
              label={activeDocument.verificationUrl ? "Status-only verification for " + activeDocument.reference : "Demo reference QR for " + activeDocument.reference}
            />
            <span>{activeDocument.verificationUrl ? "Scan for status only · no patient details are shown" : "Demo reference QR · not a verification code"}</span>
          </div>
          {activeDocument.practitioner && <div className={styles.signature}>
            <div className={styles.signatureLine} />
            <strong>{activeDocument.practitioner.name}</strong>
            {activeDocument.practitioner.registrationNumber && <span>Registration no. {activeDocument.practitioner.registrationNumber}</span>}
          </div>}
        </footer>
      </article>
    </section>
  );
}
