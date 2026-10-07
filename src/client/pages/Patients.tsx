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
} from '../components';
import { type Patient, dateTime } from '../types';
import PatientForm from './PatientForm';
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
      {history.map((e) => (
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
  const [selected, setSelected] = useState<Patient>();
  const [register, setRegister] = useState(false);
  const [editing, setEditing] = useState(false);
  const resource = useResource<Patient[]>(`/patients?search=${encodeURIComponent(search)}`);
  function saved(patient: Patient) {
    resource.refresh();
    setRegister(false);
    setEditing(false);
    if (selected) setSelected(patient);
  }
  return (
    <>
      <PageTitle
        title="Patients"
        description="Find a patient, review their chart, or register a first visit."
        action={
          canEdit && (
            <button
              onClick={() => {
                setRegister(!register);
                setSelected(undefined);
                setEditing(false);
              }}
            >
              {register ? 'Close registration' : 'Register patient'}
            </button>
          )
        }
      />
      {register && (
        <Panel title="Patient registration">
          <PatientForm onSaved={saved} />
        </Panel>
      )}
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
          {editing && (
            <Panel title="Edit patient details">
              <PatientForm
                key={`${selected.id}:${selected.version}`}
                initial={selected}
                onSaved={saved}
              />
            </Panel>
          )}
          <div className="two-column">
            <Panel
              title="Patient details"
              action={
                canEdit && (
                  <button className="secondary" onClick={() => setEditing(!editing)}>
                    {editing ? 'Cancel edit' : 'Edit details'}
                  </button>
                )
              }
            >
              <dl>
                <dt>Phone</dt>
                <dd>{selected.phone || 'Not recorded'}</dd>
                <dt>Email</dt>
                <dd>{selected.email || 'Not recorded'}</dd>
                <dt>Chronic conditions</dt>
                <dd>{selected.conditions?.join(', ') || 'None recorded'}</dd>
                <dt>Notification consent</dt>
                <dd>{selected.notificationConsent ? 'Consented' : 'Not consented'}</dd>
              </dl>
            </Panel>
            <Panel title="Encounter history">
              <PatientHistory key={selected.id} patientId={selected.id} />
            </Panel>
          </div>
        </>
      ) : (
        <Panel title="Patient directory">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search patients"
              placeholder="Search name, NRIC, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
                    {resource.data.map((p) => (
                      <tr key={p.id}>
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
                              setRegister(false);
                              setEditing(false);
                            }}
                          >
                            Open chart
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
    </>
  );
}
