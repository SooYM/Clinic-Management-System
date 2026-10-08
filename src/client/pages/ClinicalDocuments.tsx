import { useState } from 'react';
import { api } from '../api';
import {
  Empty,
  Field,
  MutationForm,
  Panel,
  ResourceState,
  Status,
  formText,
  useResource,
  useRole,
} from '../components';
import DocumentPreview from '../DocumentPreview';
import { dateTime } from '../types';
import { useListControls } from '../ListControls';
interface ClinicalDocument {
  id: number;
  encounterId: number;
  documentNumber: string;
  kind: string;
  revokedAt?: string;
  createdAt: string;
}
export default function ClinicalDocuments({
  encounterId,
  onRevoked,
}: {
  encounterId: number;
  onRevoked?: (documentId: number) => void;
}) {
  const resource = useResource<ClinicalDocument[]>('/documents');
  const [revoke, setRevoke] = useState<ClinicalDocument>();
  const role = useRole();
  const [previewId, setPreviewId] = useState<number>();
  const documents = resource.data?.filter((d) => d.encounterId === encounterId) || [];
  const list = useListControls(documents, {
    label: 'Loaded documents for this encounter',
    search: (row) => `${row.id} ${row.documentNumber} ${row.kind}`,
    filters: [
      { key: 'kind', label: 'Document type', value: (row) => row.kind },
      {
        key: 'status',
        label: 'Document status',
        value: (row) => (row.revokedAt ? 'REVOKED' : 'ISSUED'),
      },
    ],
    sorts: [
      { key: 'date', label: 'Issued date', value: (row) => row.createdAt },
      { key: 'id', label: 'Document ID', value: (row) => row.id },
    ],
  });
  return (
    <>
      <Panel title="Issued document history">
        {list.controls}
        <ResourceState {...resource}>
          {list.items.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Document</th>
                    <th>Issued</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.documentNumber}</strong>
                        <small>Document ID #{d.id}</small>
                      </td>
                      <td>{d.kind}</td>
                      <td>{dateTime(d.createdAt)}</td>
                      <td>
                        <Status value={d.revokedAt ? 'REVOKED' : 'ISSUED'} />
                      </td>
                      <td>
                        <div className="actions">
                          <button className="secondary" onClick={() => setPreviewId(d.id)}>
                            Preview document
                          </button>
                          {!d.revokedAt && role === 'DOCTOR' && (
                            <button className="text-button" onClick={() => setRevoke(d)}>
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={
                documents.length
                  ? 'No matching documents'
                  : 'No documents issued for this encounter'
              }
              description="Issued certificates, referrals, and lab orders remain linked to the clinical record."
            />
          )}
        </ResourceState>
        {revoke && (
          <MutationForm
            label="Revoke document"
            onSuccess={() => {
              resource.refresh();
              if (revoke) onRevoked?.(revoke.id);
              setRevoke(undefined);
            }}
            onSubmit={(f) =>
              api.post(`/documents/${revoke.id}/revoke`, { reason: formText(f, 'reason') })
            }
          >
            <h3>Revoke {revoke.documentNumber}</h3>
            <Field
              label="Reason for revocation"
              hint="The reason stays in the audit trail. This document will fail public verification."
            >
              <textarea name="reason" required maxLength={2000} />
            </Field>
            <button className="text-button" type="button" onClick={() => setRevoke(undefined)}>
              Keep document
            </button>
          </MutationForm>
        )}
      </Panel>
      {previewId && (
        <DocumentPreview
          key={`${previewId}:${resource.data?.find((d) => d.id === previewId)?.revokedAt || 'issued'}`}
          documentId={previewId}
        />
      )}
    </>
  );
}
