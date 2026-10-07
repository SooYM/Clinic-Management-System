import { useState } from 'react';
import { api } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  PatientSelect,
  ResourceState,
  Status,
  formText,
  useResource,
  useRole,
} from '../components';
import { type Patient, type InventoryItem, dateTime, humanize } from '../types';
import ClinicalDocuments from './ClinicalDocuments';
interface Encounter {
  id: number;
  patientId: number;
  patientName: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: string;
  createdAt: string;
  version: number;
  specialty: string;
  queueTicketId?: number;
  procedureNotes: string;
  vitals: Record<string, string | number>;
  prescriptions: {
    itemId: number;
    quantity: number;
    dosage: string;
    durationDays: number;
    frequencyPerDay?: number;
    mealTiming?: string;
  }[];
}
interface Document {
  id: number;
  documentNumber: string;
  kind: string;
  status: string;
  verificationUrl?: string;
}
export default function Clinical() {
  const role = useRole();
  const encounters = useResource<Encounter[]>('/encounters');
  const patients = useResource<Patient[]>('/references/patients');
  const items = useResource<InventoryItem[]>('/references/medications');
  const [selected, setSelected] = useState<Encounter>();
  const [documentKind, setDocumentKind] = useState('MC');
  const [doc, setDoc] = useState<Document>();
  const [error, setError] = useState('');
  const patientResource = useResource<Patient>(
    selected ? `/clinical/patients/${selected.patientId}` : '',
  );
  const patient =
    patientResource.data?.id === selected?.patientId ? patientResource.data : undefined;
  return (
    <>
      <PageTitle
        title="Clinical workspace"
        description="Record the consultation, prescribe safely, and issue clinical documents."
      />
      {selected && (
        <div className="patient-banner">
          <div>
            <h2>{patient?.name || selected.patientName}</h2>
            <p>
              Patient ID #{selected.patientId} · {patient?.nationalId} ·{' '}
              {patient?.bloodGroup || 'Blood group unknown'}
            </p>
          </div>
          <span className="allergies">
            Allergies:{' '}
            {patient
              ? patient.allergies?.join(', ') || 'None recorded'
              : patientResource.error
                ? 'Unable to load — review patient chart'
                : 'Loading patient record…'}
          </span>
        </div>
      )}
      <div className="clinical-grid">
        <Panel title={selected ? 'Consultation note' : 'New consultation'}>
          <MutationForm
            key={selected ? `${selected.id}:${selected.version}` : 'new'}
            label={selected ? 'Save consultation' : 'Create consultation'}
            disabled={selected?.status === 'SIGNED' || role !== 'DOCTOR'}
            disabledReason={
              role !== 'DOCTOR'
                ? 'Only a GP account can create, edit, or sign clinical notes. You can review recorded consultations.'
                : undefined
            }
            onSuccess={encounters.refresh}
            onSubmit={async (f) => {
              if (selected?.status === 'SIGNED')
                throw new Error('Signed encounters cannot be edited.');
              const itemId = Number(formText(f, 'itemId'));
              const body = {
                patientId: selected?.patientId || Number(formText(f, 'patientId')),
                specialty: selected?.specialty || formText(f, 'specialty'),
                queueTicketId: selected?.queueTicketId || undefined,
                subjective: formText(f, 'subjective'),
                objective: formText(f, 'objective'),
                assessment: formText(f, 'assessment'),
                plan: formText(f, 'plan'),
                procedureNotes: formText(f, 'procedureNotes'),
                status: formText(f, 'status'),
                version: selected?.version,
                vitals: {
                  ...selected?.vitals,
                  bloodPressure: formText(f, 'bloodPressure'),
                  temperature: formText(f, 'temperature'),
                },
                prescriptions: [
                  ...(selected?.prescriptions || []),
                  ...(itemId
                    ? [
                        {
                          itemId,
                          quantity: Number(f.get('quantity')),
                          dosage:
                            formText(f, 'dosage') ||
                            `${Number(f.get('frequencyPerDay'))} times daily; ${humanize(formText(f, 'mealTiming'))}; ${Number(f.get('durationDays'))} days`,
                          durationDays: Number(f.get('durationDays')),
                          frequencyPerDay: Number(f.get('frequencyPerDay')),
                          mealTiming: formText(f, 'mealTiming'),
                        },
                      ]
                    : []),
                ],
              };
              const saved = selected
                ? await api.put<Encounter>(`/encounters/${selected.id}`, body)
                : await api.post<Encounter>('/encounters', body);
              setSelected(saved);
            }}
          >
            {!selected && <PatientSelect patients={patients.data || []} />}
            <div className="form-grid">
              <Field label="Consultation template">
                <select name="specialty" defaultValue={selected?.specialty || 'GP'}>
                  <option>GP</option>
                  <option>DENTAL</option>
                  <option>AESTHETIC</option>
                </select>
              </Field>
              <Field label="Note status">
                <select name="status" defaultValue={selected?.status || 'DRAFT'}>
                  <option>DRAFT</option>
                  <option>SIGNED</option>
                </select>
              </Field>
              <Field label="Blood pressure">
                <input
                  name="bloodPressure"
                  placeholder="e.g. 120/80"
                  defaultValue={selected?.vitals?.bloodPressure}
                />
              </Field>
              <Field label="Temperature (°C)">
                <input
                  name="temperature"
                  type="number"
                  step="0.1"
                  min="25"
                  max="45"
                  defaultValue={selected?.vitals?.temperature}
                />
              </Field>
            </div>
            <div className="soap-grid">
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map((key, i) => (
                <Field
                  key={key}
                  label={`${['S', 'O', 'A', 'P'][i]} · ${key[0].toUpperCase() + key.slice(1)}`}
                >
                  <textarea name={key} rows={3} required defaultValue={selected?.[key]} />
                </Field>
              ))}
            </div>
            <Field label="Procedure notes">
              <textarea name="procedureNotes" rows={2} defaultValue={selected?.procedureNotes} />
            </Field>
            <fieldset>
              <legend>Add prescription</legend>
              {selected?.prescriptions?.map((rx, index) => (
                <p key={index} className="form-help">
                  Existing: {items.data?.find((i) => i.id === rx.itemId)?.name || rx.itemId} ·{' '}
                  {rx.quantity} units · {rx.frequencyPerDay || 1} times daily ·{' '}
                  {humanize(rx.mealTiming || 'ANY_TIME')} · {rx.dosage} · {rx.durationDays} days
                </p>
              ))}
              <Field label="Medicine">
                <select name="itemId">
                  <option value="">No additional medication</option>
                  {items.data?.map((i) => (
                    <option value={i.id} key={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Quantity">
                  <input name="quantity" type="number" min="1" defaultValue="1" />
                </Field>
                <Field label="Supply (days)">
                  <input name="durationDays" type="number" min="1" max="365" defaultValue="1" />
                </Field>
                <Field label="Frequency (times per day)">
                  <input
                    name="frequencyPerDay"
                    type="number"
                    min="1"
                    max="24"
                    step="1"
                    defaultValue="1"
                  />
                </Field>
                <Field label="Meal timing">
                  <select name="mealTiming">
                    <option value="AFTER_MEAL">After meal</option>
                    <option value="BEFORE_MEAL">Before meal</option>
                    <option value="ANY_TIME">Any time</option>
                  </select>
                </Field>
              </div>
              <Field label="Dosage instructions">
                <input name="dosage" placeholder="Dose, frequency, and route" />
              </Field>
              <p className="form-help">
                Allergy conflicts prevent saving a prescription. Dispensing uses the earliest
                eligible expiry.
              </p>
            </fieldset>
          </MutationForm>
        </Panel>
        <div className="stack">
          <Panel
            title="Recent encounters"
            action={
              selected && (
                <button
                  className="text-button"
                  onClick={() => {
                    setSelected(undefined);
                    setDoc(undefined);
                  }}
                >
                  New consultation
                </button>
              )
            }
          >
            <ResourceState {...encounters}>
              {encounters.data?.length ? (
                encounters.data.map((e) => (
                  <button
                    className={`encounter-row ${selected?.id === e.id ? 'selected' : ''}`}
                    key={e.id}
                    onClick={() => {
                      setSelected(e);
                      setDoc(undefined);
                    }}
                  >
                    <strong>{e.patientName || 'Patient'}</strong>
                    <span>{e.assessment}</span>
                    <small>
                      Encounter ID #{e.id} · {dateTime(e.createdAt)} · {e.status}
                    </small>
                  </button>
                ))
              ) : (
                <Empty
                  title="No consultations recorded"
                  description="Start a consultation to create the patient's first SOAP note."
                />
              )}
            </ResourceState>
          </Panel>
          <Panel title="Clinical documents">
            {selected && role === 'DOCTOR' ? (
              <>
                <div className="segmented">
                  {['MC', 'REFERRAL', 'LAB'].map((k) => (
                    <button
                      key={k}
                      className={documentKind === k ? 'active' : ''}
                      onClick={() => {
                        setDocumentKind(k);
                        setDoc(undefined);
                      }}
                    >
                      {k === 'MC' ? 'Medical certificate' : k === 'LAB' ? 'Lab order' : 'Referral'}
                    </button>
                  ))}
                </div>
                <MutationForm
                  key={documentKind}
                  label="Issue document"
                  onSubmit={async (f) => {
                    setError('');
                    const issued = await api.post<Document>('/documents', {
                      encounterId: selected.id,
                      kind: documentKind,
                      startDate: formText(f, 'startDate') || undefined,
                      days: Number(f.get('days')) || undefined,
                      diagnosisRedacted: f.get('diagnosisRedacted') === 'on',
                      lightDuty: f.get('lightDuty') === 'on',
                      target: formText(f, 'target') || undefined,
                      urgency: formText(f, 'urgency') || undefined,
                      reason: formText(f, 'reason') || undefined,
                      panels: formText(f, 'panels')
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                      specimenType: formText(f, 'specimenType') || undefined,
                      fastingRequired: f.get('fastingRequired') === 'on',
                      clinicalNotes: formText(f, 'clinicalNotes'),
                    });
                    setDoc(issued);
                  }}
                >
                  {documentKind === 'MC' ? (
                    <>
                      <Field label="Leave starts">
                        <input type="date" name="startDate" required />
                      </Field>
                      <div className="actions">
                        {[1, 2, 3].map((days) => (
                          <button
                            type="button"
                            className="secondary"
                            key={days}
                            onClick={(event) => {
                              const input = event.currentTarget
                                .closest('form')
                                ?.querySelector<HTMLInputElement>('input[name=days]');
                              if (input) input.value = String(days);
                            }}
                          >
                            {days} {days === 1 ? 'day' : 'days'}
                          </button>
                        ))}
                      </div>
                      <Field label="Leave duration (days)">
                        <input
                          type="number"
                          name="days"
                          min="1"
                          max="365"
                          defaultValue="1"
                          required
                        />
                      </Field>
                      <label className="checkbox">
                        <input name="diagnosisRedacted" type="checkbox" defaultChecked />
                        Hide diagnosis from employer
                      </label>
                      <label className="checkbox">
                        <input name="lightDuty" type="checkbox" />
                        Light duty only
                      </label>
                    </>
                  ) : documentKind === 'REFERRAL' ? (
                    <>
                      <Field label="Hospital / specialty">
                        <input name="target" required />
                      </Field>
                      <Field label="Urgency">
                        <select name="urgency">
                          <option>ROUTINE</option>
                          <option>SEMI_URGENT</option>
                          <option>URGENT_SAME_DAY</option>
                          <option>EMERGENCY</option>
                        </select>
                      </Field>
                      <Field label="Referral reason">
                        <textarea name="reason" required />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field
                        label="Panels"
                        hint="Separate panels with commas, e.g. Full Blood Count, HbA1c."
                      >
                        <input name="panels" required />
                      </Field>
                      <Field label="Specimen type">
                        <select name="specimenType">
                          <option>BLOOD</option>
                          <option>URINE</option>
                          <option>OTHER</option>
                        </select>
                      </Field>
                      <label className="checkbox">
                        <input name="fastingRequired" type="checkbox" />
                        Fasting required
                      </label>
                      <Field label="Collection instructions">
                        <textarea name="clinicalNotes" />
                      </Field>
                    </>
                  )}
                </MutationForm>
                {doc && (
                  <div className="document-result">
                    <Status value={doc.status || 'ISSUED'} />
                    <strong>{doc.documentNumber}</strong>
                    <a
                      className="button secondary"
                      href={api.url(`/documents/${doc.id}/pdf`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View / print document
                    </a>
                    {doc.verificationUrl && (
                      <a href={doc.verificationUrl} target="_blank" rel="noreferrer">
                        Open verification
                      </a>
                    )}
                  </div>
                )}
                {error && <ErrorNotice>{error}</ErrorNotice>}
              </>
            ) : (
              <Empty
                title="Select a consultation"
                description="Clinical documents are linked to a saved encounter and its attending practitioner."
              />
            )}
          </Panel>
        </div>
      </div>
      {selected && (
        <>
          <ClinicalDocuments key={doc?.id || selected.id} encounterId={selected.id} />
        </>
      )}
    </>
  );
}
