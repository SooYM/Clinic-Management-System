import { useEffect, useState } from 'react';
import { Search, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MutationForm,
  PageTitle,
  Panel,
  ResourceState,
  formText,
  useResource,
  useRole,
  useModules,
  useDebouncedValue,
} from '../components';
import { type Patient, dateTime } from '../types';
import PatientForm from './PatientForm';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import { useListControls } from '../ListControls';
import { countryName } from '../../shared/countries';
interface Encounter {
  id: number;
  createdAt: string;
  assessment: string;
  specialty: string;
  status: string;
}
interface Cursor {
  before: string;
  beforeId: number;
}
interface HistoryPage {
  data: Encounter[];
  nextCursor: Cursor | null;
}
function PatientHistory({ patientId }: { patientId: number }) {
  const role = useRole();
  const modules = useModules();
  const permitted = modules.includes('clinical');
  const [history, setHistory] = useState<Encounter[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const historyList = useListControls(history, {
    label: 'Encounter history',
    search: (row) => `${row.id} ${row.assessment} ${row.specialty} ${row.status}`,
    filters: [{ key: 'status', label: 'Status', value: (row) => row.status }],
    sorts: [
      { key: 'date', label: 'Consultation date', value: (row) => row.createdAt },
      { key: 'id', label: 'Encounter ID', value: (row) => row.id },
    ],
  });
  useEffect(() => {
    let active = true;
    if (!permitted) return;
    setLoading(true);
    setError('');
    api
      .getPage<HistoryPage>(`/patients/${patientId}/encounters`)
      .then((page) => {
        if (active) {
          setHistory(page.data);
          setCursor(page.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [patientId, permitted, revision]);
  async function loadOlder() {
    if (!cursor) return;
    setLoading(true);
    setError('');
    try {
      const page = await api.getPage<HistoryPage>(
        `/patients/${patientId}/encounters?before=${encodeURIComponent(cursor.before)}&beforeId=${encodeURIComponent(cursor.beforeId)}`,
      );
      setHistory((rows) => [...rows, ...page.data]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  if (!permitted)
    return (
      <Empty
        title="Clinical history access restricted"
        description="Clinical staff can view this patient's consultation history."
      />
    );
  return (
    <>
      {error && (
        <>
          <ErrorNotice>{error}</ErrorNotice>
          <button
            className="secondary"
            onClick={() => (cursor ? void loadOlder() : setRevision((v) => v + 1))}
          >
            Try again
          </button>
        </>
      )}
      {historyList.controls}
      {historyList.items.map((e) => (
        <div className="list-row" key={e.id}>
          <strong>{e.assessment || 'Encounter'}</strong>
          <p>
            Encounter ID #{e.id} · {dateTime(e.createdAt)} · {e.specialty} · {e.status}
          </p>
        </div>
      ))}
      {loading && <Loading />}
      {!loading && !error && !history.length && (
        <Empty
          title="No encounters recorded"
          description="Consultations for this patient will appear here."
        />
      )}
      {cursor && !error && (
        <button className="secondary" disabled={loading} onClick={() => void loadOlder()}>
          {loading ? 'Loading…' : 'Load older consultations'}
        </button>
      )}
    </>
  );
}
export default function Patients() {
  const role = useRole();
  const canEdit = true;
  const [search, setSearch] = useState('');
  const searchTerm = useDebouncedValue(search.trim());
  const [selected, setSelected] = useState<Patient>();
  const [section, setSection] = useState('directory');
  const [registrationRevision, setRegistrationRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const resource = useResource<Patient[]>(`/patients?search=${encodeURIComponent(searchTerm)}`);
  const patientList = useListControls(resource.data || [], {
    label: 'Patients',
    defaultSort: 'id',
    search: (row) => `${row.id} ${row.name} ${row.nationalId} ${row.phone}`,
    filters: [
      { key: 'nationality', label: 'Nationality', value: (row) => row.nationality },
      {
        key: 'country',
        label: 'Country',
        value: (row) =>
          row.nationality === 'MALAYSIAN'
            ? 'Malaysia'
            : row.countryCode
              ? countryName(row.countryCode)
              : 'Unknown',
      },
      { key: 'sex', label: 'Gender', value: (row) => row.sex },
    ],
    sorts: [
      { key: 'id', label: 'Patient ID', value: (row) => row.id },
      { key: 'name', label: 'Patient name', value: (row) => row.name },
      { key: 'birth', label: 'Birth date', value: (row) => row.dateOfBirth },
    ],
  });
  function saved(patient: Patient) {
    resource.refresh();
    setSection('directory');
    setRegistrationRevision((value) => value + 1);
    setEditing(false);
    if (editing && selected) setSelected(patient);
    else setSelected(undefined);
  }
  return (
    <>
      <PageTitle
        title="Patients"
        description="Find a patient, review their profile, or register a first visit."
        action={
          canEdit && (
            <button
              data-guide="open-registration"
              onClick={() => {
                if (section === 'registration' && !editing) setSection('directory');
                else {
                  setSection('registration');
                  setSelected(undefined);
                  setEditing(false);
                }
              }}
            >
              {section === 'registration' && !editing ? 'Close registration' : 'Register patient'}
            </button>
          )
        }
      />
      <WorkspaceSections label="Patient sections" value={section} onChange={setSection}>
        <WorkspaceSection
          id="directory"
          label="Patient directory"
          description="Find patients and review their recorded details and consultation history."
        >
          {selected ? (
            <>
              <button
                className="text-button"
                onClick={() => {
                  setSelected(undefined);
                  setEditing(false);
                }}
              >
                <ArrowLeft size={16} />
                Back to patients
              </button>
              <div className="patient-banner">
                <div>
                  <h2>{selected.name}</h2>
                  <p>
                    Patient ID #{selected.id} · {selected.nationalId} ·{' '}
                    {selected.dateOfBirth?.slice(0, 10)} · Blood group{' '}
                    {selected.bloodGroup || 'unknown'}
                  </p>
                </div>
                <div className="allergies">
                  {selected.allergies?.length
                    ? `Allergies: ${selected.allergies.join(', ')}`
                    : 'No allergies recorded'}
                </div>
              </div>
              <div className="two-column">
                <Panel
                  title="Patient profile"
                  action={
                    canEdit && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditing(!editing);
                          setSection(editing ? 'directory' : 'registration');
                        }}
                      >
                        {editing ? 'Cancel edit' : 'Edit details'}
                      </button>
                    )
                  }
                >
                  <dl>
                    <dt>Patient ID</dt>
                    <dd>#{selected.id}</dd>
                    <dt>First name</dt>
                    <dd>{selected.firstName || selected.name}</dd>
                    <dt>Last name</dt>
                    <dd>{selected.lastName || 'Not recorded'}</dd>
                    <dt>Nationality</dt>
                    <dd>
                      {selected.nationality === 'MALAYSIAN'
                        ? 'Malaysian'
                        : selected.nationality === 'NON_MALAYSIAN'
                          ? 'Non-Malaysian'
                          : 'Not recorded'}
                    </dd>
                    <dt>Country of nationality</dt>
                    <dd>
                      {selected.nationality === 'MALAYSIAN'
                        ? 'Malaysia'
                        : selected.countryCode
                          ? countryName(selected.countryCode)
                          : 'Not recorded'}
                    </dd>
                    <dt>
                      {selected.nationality === 'MALAYSIAN'
                        ? 'IC number'
                        : 'Passport / identity number'}
                    </dt>
                    <dd>{selected.nationalId}</dd>
                    <dt>Date of birth</dt>
                    <dd>{selected.dateOfBirth?.slice(0, 10) || 'Not recorded'}</dd>
                    <dt>Gender</dt>
                    <dd>{selected.sex || 'Not recorded'}</dd>
                    <dt>Blood group</dt>
                    <dd>{selected.bloodGroup || 'Not recorded'}</dd>
                    <dt>Phone</dt>
                    <dd>{selected.phone || 'Not recorded'}</dd>
                    <dt>Email</dt>
                    <dd>{selected.email || 'Not recorded'}</dd>
                    <dt>Address line 1</dt>
                    <dd>{selected.addressLine1 || 'Not recorded'}</dd>
                    <dt>Address line 2</dt>
                    <dd>{selected.addressLine2 || 'Not recorded'}</dd>
                    <dt>Postcode</dt>
                    <dd>{selected.postcode || 'Not recorded'}</dd>
                    <dt>City / town</dt>
                    <dd>{selected.city || 'Not recorded'}</dd>
                    <dt>State / region</dt>
                    <dd>{selected.state || 'Not recorded'}</dd>
                    <dt>Allergies</dt>
                    <dd>{selected.allergies?.join(', ') || 'None recorded'}</dd>
                    <dt>Chronic conditions</dt>
                    <dd>{selected.conditions?.join(', ') || 'None recorded'}</dd>
                    <dt>Notification consent</dt>
                    <dd>{selected.notificationConsent ? 'Consented' : 'Not consented'}</dd>
                    <dt>Registered</dt>
                    <dd>{selected.createdAt ? dateTime(selected.createdAt) : 'Not recorded'}</dd>
                    <dt>Last updated</dt>
                    <dd>{selected.updatedAt ? dateTime(selected.updatedAt) : 'Not recorded'}</dd>
                  </dl>
                </Panel>
                <Panel title="Encounter history">
                  <PatientHistory key={selected.id} patientId={selected.id} />
                </Panel>
              </div>
            </>
          ) : (
            <Panel title="Patient directory">
              <label htmlFor="patient-list-search">Search patient list</label>
              <div className="search-field">
                <Search size={18} />
                <input
                  id="patient-list-search"
                  type="search"
                  aria-label="Search patients"
                  placeholder="Name, IC/passport, or phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button type="button" className="text-button" onClick={() => setSearch('')}>
                    Clear
                  </button>
                )}
              </div>
              <p className="form-help">
                Search patient list queries saved patients. Filters and sorting below apply to the
                loaded results.
              </p>
              {patientList.controls}
              <ResourceState {...resource}>
                {resource.data?.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Patient ID</th>
                          <th>Patient</th>
                          <th>NRIC / passport</th>
                          <th>Phone</th>
                          <th>Allergies</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {patientList.items.map((p) => (
                          <tr
                            key={p.id}
                            className="patient-profile-row"
                            onClick={() => {
                              setSelected(p);
                              setSection('directory');
                              setEditing(false);
                            }}
                          >
                            <td>#{p.id}</td>
                            <td>
                              <strong>{p.name}</strong>
                              <small>{p.dateOfBirth?.slice(0, 10)}</small>
                            </td>
                            <td>{p.nationalId}</td>
                            <td>{p.phone}</td>
                            <td>
                              {p.allergies?.length ? (
                                <span className="status urgent">{p.allergies.join(', ')}</span>
                              ) : (
                                'None recorded'
                              )}
                            </td>
                            <td>
                              <button
                                className="secondary"
                                onClick={() => {
                                  setSelected(p);
                                  setSection('directory');
                                  setEditing(false);
                                }}
                              >
                                Open profile
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title={search ? 'No matching patients' : 'Your patient directory starts here'}
                    description={
                      search
                        ? 'Try another name, ID, or phone number.'
                        : 'Register your first patient to start their clinical record.'
                    }
                  />
                )}
              </ResourceState>
            </Panel>
          )}
        </WorkspaceSection>
        <WorkspaceSection
          id="registration"
          label={editing ? 'Edit patient' : 'Patient registration'}
          description="Register a first visit or update the selected patient's demographic details."
        >
          <Panel title={editing && selected ? 'Edit patient details' : 'Patient registration'}>
            <PatientForm
              key={
                editing && selected
                  ? `${selected.id}:${selected.version}`
                  : `new:${registrationRevision}`
              }
              initial={editing ? selected : undefined}
              onSaved={saved}
            />
          </Panel>
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
