import { useState } from 'react';
import { api, isDemo } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  SearchablePatientSelect,
  ResourceState,
  Status,
  formText,
  useResource,
  useRole,
  useDebouncedValue,
} from '../components';
import { type Patient, type InventoryItem, dateTime, humanize } from '../types';
import type { CatalogEntry } from '../AdminCatalogs';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import ClinicalDocuments from './ClinicalDocuments';
import DocumentPreview from '../DocumentPreview';
import PrescriptionLog from '../PrescriptionLog';
import MedicationDoseLog from '../MedicationDoseLog';
import { defaultMcStartDate } from '../../shared/clinic-dates';
import { parseBloodPressure } from '../../shared/blood-pressure';
interface Encounter {
  id: number;
  patientId: number;
  practitionerId: number;
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
    itemName?: string;
    ingredient?: string;
    unit?: string;
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
function MedicinePicker() {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const resource = useResource<InventoryItem[]>(
    '/references/medications?search=' + encodeURIComponent(term),
  );
  const [selected, setSelected] = useState<InventoryItem>();
  const choices = (resource.data || []).filter((item) => item.active !== false);
  const options =
    selected && !choices.some((item) => item.id === selected.id) ? [selected, ...choices] : choices;
  return (
    <>
      <Field label="Search drug catalog">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Medicine, SKU or ingredient"
        />
      </Field>
      <Field label="Medicine">
        <select
          name="itemId"
          value={selected?.id || ''}
          onChange={(event) =>
            setSelected(options.find((item) => item.id === Number(event.target.value)))
          }
        >
          <option value="">No additional medication</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      {resource.loading && (
        <p className="form-help" role="status">
          Loading medicines…
        </p>
      )}
      {resource.error && <ErrorNotice>{resource.error}</ErrorNotice>}
      {!resource.loading && !resource.error && !choices.length && (
        <p className="form-help">
          No active medicines match. Change the search or ask an administrator to add or reactivate
          a medication.
        </p>
      )}
    </>
  );
}
function McLeaveStart() {
  const [initialDate] = useState(() => defaultMcStartDate());
  return (
    <Field
      label="Leave starts"
      hint="New MCs default to today before 5 pm Malaysia time, or tomorrow from 5 pm. Review and change when needed."
    >
      <input type="date" name="startDate" required defaultValue={initialDate} />
    </Field>
  );
}
function BloodPressureField({ initial }: { initial?: string | number }) {
  const [value, setValue] = useState(String(initial ?? ''));
  let error = '',
    unusual = false;
  try {
    unusual = parseBloodPressure(value)?.unusual || false;
  } catch (failure) {
    error = (failure as Error).message;
  }
  return (
    <Field
      label="Blood pressure"
      hint="SYS/DIA in mmHg; positive whole numbers with systolic higher than diastolic."
    >
      <input
        name="bloodPressure"
        placeholder="e.g. 120/80"
        value={value}
        aria-invalid={!!error}
        aria-describedby={
          error ? 'blood-pressure-error' : unusual ? 'blood-pressure-warning' : undefined
        }
        onChange={(event) => {
          setValue(event.target.value);
          try {
            parseBloodPressure(event.target.value);
            event.currentTarget.setCustomValidity('');
          } catch (failure) {
            event.currentTarget.setCustomValidity((failure as Error).message);
          }
        }}
      />
      {error && (
        <small id="blood-pressure-error" role="alert">
          {error}
        </small>
      )}
      {unusual && (
        <small id="blood-pressure-warning" role="status">
          Outside common monitor operating ranges (SYS 60–260, DIA 40–215). Verify this reading; you
          can still record it. These are not healthy or diagnostic ranges.
        </small>
      )}
    </Field>
  );
}
export default function Clinical({ practitionerId }: { practitionerId: number }) {
  const role = useRole();
  const [section, setSection] = useState('consultations');
  const [encounterSearch, setEncounterSearch] = useState('');
  const encounterTerm = useDebouncedValue(encounterSearch.trim());
  const encounters = useResource<Encounter[]>(
    `/encounters?search=${encodeURIComponent(encounterTerm)}`,
  );
  const items = useResource<InventoryItem[]>('/references/medications?includeInactive=1');
  const labPanels = useResource<CatalogEntry[]>('/references/catalogs?kind=LAB_PANEL');
  const specimenTypes = useResource<CatalogEntry[]>('/references/catalogs?kind=SPECIMEN_TYPE');
  const destinations = useResource<CatalogEntry[]>(
    '/references/catalogs?kind=REFERRAL_DESTINATION',
  );
  const [selected, setSelected] = useState<Encounter>();
  const [documentKind, setDocumentKind] = useState('MC');
  const [doc, setDoc] = useState<Document>();
  const [error, setError] = useState('');
  const [prescriptionSearch, setPrescriptionSearch] = useState('');
  const patientResource = useResource<Patient>(
    selected ? `/clinical/patients/${selected.patientId}` : '',
  );
  const patient =
    patientResource.data?.id === selected?.patientId ? patientResource.data : undefined;
  const matchingEncounters = encounters.data || [];
  const matchingRecordedPrescriptions = (selected?.prescriptions || []).filter((rx) =>
    `${rx.itemName || items.data?.find((item) => item.id === rx.itemId)?.name || rx.itemId} ${rx.dosage}`
      .toLowerCase()
      .includes(prescriptionSearch.trim().toLowerCase()),
  );
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
      <WorkspaceSections label="Clinical workspace sections" value={section} onChange={setSection}>
        <WorkspaceSection
          id="consultations"
          label="Consultations"
          description="Find a saved encounter or start a new consultation."
        >
          <Panel
            title="Recent encounters"
            action={
              role === 'DOCTOR' && (
                <button
                  className="text-button"
                  onClick={() => {
                    setSelected(undefined);
                    setSection('notes');
                    setDoc(undefined);
                  }}
                >
                  New consultation
                </button>
              )
            }
          >
            <Field
              label="Search consultations"
              hint="Search branch consultations by patient, assessment or encounter ID."
            >
              <input
                type="search"
                value={encounterSearch}
                onChange={(event) => setEncounterSearch(event.target.value)}
                placeholder="Patient, assessment or encounter ID"
              />
            </Field>
            <ResourceState {...encounters}>
              {matchingEncounters.length ? (
                matchingEncounters.map((e) => (
                  <button
                    className={`encounter-row ${selected?.id === e.id ? 'selected' : ''}`}
                    key={e.id}
                    onClick={() => {
                      setSelected(e);
                      setSection('notes');
                      setDoc(undefined);
                      setPrescriptionSearch('');
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
                  title={encounterTerm ? 'No matching consultations' : 'No consultations recorded'}
                  description={
                    encounterTerm
                      ? 'Change or clear the search to see recent consultations.'
                      : "Start a consultation to create the patient's first SOAP note."
                  }
                />
              )}
            </ResourceState>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="notes"
          label="Note & prescription"
          description="Record SOAP notes, vitals and prescribed medicines."
        >
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
                parseBloodPressure(formText(f, 'bloodPressure'));
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
              {!selected && <SearchablePatientSelect />}
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
                <BloodPressureField initial={selected?.vitals?.bloodPressure} />
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
                {!!selected?.prescriptions?.length && (
                  <Field label="Search recorded prescriptions">
                    <input
                      type="search"
                      value={prescriptionSearch}
                      onChange={(event) => setPrescriptionSearch(event.target.value)}
                      placeholder="Medicine or dosage instructions"
                    />
                  </Field>
                )}
                {!!prescriptionSearch && !matchingRecordedPrescriptions.length && (
                  <p className="form-help" role="status">
                    No recorded medicines match this search. The saved prescription remains
                    unchanged.
                  </p>
                )}
                {matchingRecordedPrescriptions.map((rx, index) => (
                  <p key={index} className="form-help">
                    Existing:{' '}
                    {rx.itemName || items.data?.find((i) => i.id === rx.itemId)?.name || rx.itemId}{' '}
                    · {rx.quantity} units · {rx.frequencyPerDay || 1} times daily ·{' '}
                    {humanize(rx.mealTiming || 'ANY_TIME')} · {rx.dosage} · {rx.durationDays} days
                  </p>
                ))}
                <MedicinePicker />
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
        </WorkspaceSection>
        <WorkspaceSection
          id="documents"
          label="Documents"
          description="Issue, preview and review clinical letters."
        >
          <Panel title="Clinical documents">
            {selected && role === 'DOCTOR' ? (
              <>
                {isDemo && (
                  <p className="form-help">
                    Browser demo: issuance creates a simulated record only. PDFs and clinical
                    signatures are unavailable.
                  </p>
                )}
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
                  key={`${selected.id}:${documentKind}`}
                  label="Issue document"
                  disabled={
                    selected.status !== 'SIGNED' || selected.practitionerId !== practitionerId
                  }
                  disabledReason={
                    selected.status !== 'SIGNED'
                      ? 'Sign this consultation first, then issue the document.'
                      : 'Only this consultation’s attending GP can issue its documents. Sign in with that GP account.'
                  }
                  onSubmit={async (f) => {
                    setError('');
                    const issued = await api.post<Document>('/documents', {
                      encounterId: selected.id,
                      kind: documentKind,
                      employer: formText(f, 'employer') || undefined,
                      startDate: formText(f, 'startDate') || undefined,
                      days: Number(f.get('days')) || undefined,
                      diagnosisRedacted: f.get('diagnosisRedacted') === 'on',
                      lightDuty: f.get('lightDuty') === 'on',
                      target: formText(f, 'target') || undefined,
                      urgency: formText(f, 'urgency') || undefined,
                      reason: formText(f, 'reason') || undefined,
                      panels: f.getAll('panels').map((value) => String(value)),
                      specimenType: formText(f, 'specimenType') || undefined,
                      fastingRequired: f.get('fastingRequired') === 'on',
                      clinicalNotes: formText(f, 'clinicalNotes'),
                    });
                    setDoc(issued);
                  }}
                >
                  {documentKind === 'MC' ? (
                    <>
                      <McLeaveStart />
                      <Field label="Employer / department (optional)">
                        <input name="employer" maxLength={200} />
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
                        <select name="target" required>
                          <option value="">Select configured destination</option>
                          {destinations.data?.map((destination) => (
                            <option key={destination.id} value={destination.label}>
                              {destination.label}
                            </option>
                          ))}
                        </select>
                        {!destinations.data?.length && (
                          <small>
                            Ask an administrator to add referral destinations in Clinical and
                            inventory choices.
                          </small>
                        )}
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
                      <Field label="Panels" hint="Select one or more configured investigations.">
                        <select
                          name="panels"
                          multiple
                          required
                          size={Math.min(Math.max(labPanels.data?.length || 3, 3), 6)}
                          aria-label="Lab investigation panels"
                        >
                          {labPanels.data?.map((panel) => (
                            <option key={panel.id} value={panel.label}>
                              {panel.label}
                            </option>
                          ))}
                        </select>
                        {!labPanels.data?.length && (
                          <small>
                            Ask an administrator to add lab investigation panels in Clinical and
                            inventory choices.
                          </small>
                        )}
                      </Field>
                      <Field label="Specimen type">
                        <select name="specimenType" required>
                          <option value="">Select configured specimen</option>
                          {specimenTypes.data?.map((specimen) => (
                            <option key={specimen.id} value={specimen.label}>
                              {specimen.label}
                            </option>
                          ))}
                        </select>
                        {!specimenTypes.data?.length && (
                          <small>Ask an administrator to add specimen types.</small>
                        )}
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
                {doc && <DocumentPreview key={doc.id} documentId={doc.id} />}
                {error && <ErrorNotice>{error}</ErrorNotice>}
              </>
            ) : (
              <Empty
                title="Select a consultation"
                description="Clinical documents are linked to a saved encounter and its attending practitioner."
              />
            )}
          </Panel>

          {selected && (
            <>
              <ClinicalDocuments
                key={`documents:${selected.id}:${doc?.id ?? 'none'}`}
                encounterId={selected.id}
                onRevoked={(id) => {
                  if (doc?.id === id) setDoc(undefined);
                }}
              />
            </>
          )}
        </WorkspaceSection>
        <WorkspaceSection
          id="logs"
          label="Medication logs"
          description="Review patient doses separately from clinic stock activity."
        >
          {selected ? (
            <>
              <MedicationDoseLog
                key={`${selected.id}:${selected.version}`}
                encounterId={selected.id}
                signed={selected.status === 'SIGNED'}
                medicines={Array.from(
                  new Map(
                    selected.prescriptions.map((rx) => {
                      const item = items.data?.find((i) => i.id === rx.itemId);
                      return [
                        rx.itemId,
                        {
                          id: rx.itemId,
                          name: rx.itemName || item?.name || `Medicine #${rx.itemId}`,
                          unit: rx.unit || item?.unit || 'unit',
                        },
                      ] as const;
                    }),
                  ).values(),
                )}
              />
              <Panel title="Prescription activity">
                <PrescriptionLog
                  key={`${selected.id}:${selected.version}`}
                  encounterId={selected.id}
                />
              </Panel>
            </>
          ) : (
            <Panel title="Medication logs">
              <Empty
                title="Select a consultation"
                description="Choose a saved encounter in Consultations to review its patient doses and prescription activity."
              />
            </Panel>
          )}
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
