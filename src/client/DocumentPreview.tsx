import { api, isDemo } from './api';
import { ResourceState, useResource } from './components';
import type { DocumentView } from '../shared/document-view';

export default function DocumentPreview({ documentId }: { documentId: number }) {
  const resource = useResource<DocumentView>(`/documents/${documentId}`);
  const document = resource.data;
  return (
    <section className="document-preview" aria-label="Document preview">
      <div className="document-preview-tools">
        <h3>Document preview</h3>
        {!isDemo && document && !document.revoked && (
          <a className="button secondary" href={api.url(`/documents/${documentId}/pdf?download=1`)}>
            Download PDF
          </a>
        )}
      </div>
      <ResourceState {...resource}>
        {document && (
          <article className="clinic-letter">
            {isDemo && (
              <p className="letter-notice" role="status">
                UNSIGNED DEMO SAMPLE · No clinical signature or verified PDF
              </p>
            )}
            {document.revoked && (
              <p className="letter-notice" role="alert">
                REVOKED · This document is no longer valid
              </p>
            )}
            <header className="letter-heading">
              <strong>{document.clinicName || 'Clinic'}</strong>
              <p>{document.clinicAddress || 'Clinic address not recorded'}</p>
              <h2>
                {document.kind === 'MC'
                  ? 'MEDICAL CERTIFICATE'
                  : document.kind === 'REFERRAL'
                    ? 'REFERRAL LETTER'
                    : 'LAB INVESTIGATION REQUISITION'}
              </h2>
            </header>
            <dl className="letter-fields">
              {document.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value || 'Not recorded'}</dd>
                </div>
              ))}
              {document.kind === 'MC' && document.diagnosisRedacted && (
                <div>
                  <dt>Diagnosis</dt>
                  <dd>Withheld</dd>
                </div>
              )}
              {document.diagnosis && (
                <div>
                  <dt>Diagnosis</dt>
                  <dd>{document.diagnosis}</dd>
                </div>
              )}
            </dl>
            <div className="letter-doctor">
              <strong>{document.practitionerName}</strong>
              <p>Registration: {document.licenseNumber || 'Not recorded'}</p>
              <small>
                {isDemo
                  ? 'Signature unavailable in browser demo'
                  : 'Practitioner details recorded at issuance'}
              </small>
            </div>
            <footer className="letter-footer">
              <span>
                Issued {document.issuedDate} · {document.issuedTime}
              </span>
              <strong>{document.documentNumber}</strong>
            </footer>
          </article>
        )}
      </ResourceState>
    </section>
  );
}
