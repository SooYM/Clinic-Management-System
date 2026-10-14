import { useEffect, useRef, useState } from 'react';
import { CallChime, calledTickets, newCalledTickets } from '../call-chime';
import { CallAnnouncements } from '../call-announcements';
import { Volume2, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MutationForm,
  ResourceState,
  Status,
  formText,
  useResource,
} from '../components';
interface DisplayTicket {
  ticketNumber: string;
  roomName?: string;
  status: string;
}
interface DisplayBranch {
  id: number;
  name: string;
  clinicName: string;
}
export function QueueDisplay() {
  const branches = useResource<DisplayBranch[]>('/public/display/branches', 15000);
  const [displayBranch, setDisplayBranch] = useState<number>();
  const selectedBranch = branches.data?.find((branch) => branch.id === displayBranch);
  const resource = useResource<DisplayTicket[]>(
    selectedBranch ? `/public/display/queue?branchId=${selectedBranch.id}` : '',
    15000,
  );
  const [audio, setAudio] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [enablingAudio, setEnablingAudio] = useState(false);
  const chime = useRef<CallChime>();
  if (!chime.current) chime.current = new CallChime();
  const announcements = useRef<CallAnnouncements>();
  if (!announcements.current)
    announcements.current = new CallAnnouncements((message) => {
      setSpeechError(message);
      setSpeechEnabled(false);
    });
  const lastCalls = useRef<Map<string, string> | null>(null);
  useEffect(
    () => () => {
      chime.current?.disable();
      announcements.current?.disable();
    },
    [],
  );
  async function toggleAudio() {
    setAudioError('');
    setSpeechError('');
    if (audio) {
      chime.current!.disable();
      announcements.current!.disable();
      setSpeechEnabled(false);
      setAudio(false);
      return;
    }
    setEnablingAudio(true);
    setSpeechEnabled(announcements.current!.enable());
    try {
      setAudio(await chime.current!.enable());
    } catch {
      chime.current!.disable();
      announcements.current!.disable();
      setSpeechEnabled(false);
      setAudio(false);
      setAudioError(
        'Call sound could not start. Check browser sound permissions and enable announcements again.',
      );
    } finally {
      setEnablingAudio(false);
    }
  }
  const [ticketBranch, setTicketBranch] = useState<number>();
  useEffect(() => {
    if (resource.data) setTicketBranch(displayBranch);
  }, [resource.data]);
  useEffect(() => {
    if (!branches.data?.length) return;
    if (displayBranch && branches.data.some((branch) => branch.id === displayBranch)) return;
    const requested = Number(new URLSearchParams(location.search).get('branchId'));
    const next =
      branches.data.find((branch) => branch.id === requested) ||
      [...branches.data].sort((a, b) => a.id - b.id)[0];
    chooseBranch(next.id);
  }, [branches.data, displayBranch]);
  function chooseBranch(id: number) {
    setDisplayBranch(id);
    lastCalls.current = null;
    announcements.current?.cancelPending();
    const url = new URL(location.href);
    url.searchParams.set('branchId', String(id));
    history.replaceState(null, '', url);
  }
  useEffect(() => {
    if (ticketBranch !== displayBranch || !resource.data || resource.error) return;
    const calls = calledTickets(resource.data);
    const announce = newCalledTickets(lastCalls.current, calls);
    lastCalls.current = calls;
    if (audio && announce.length) {
      try {
        chime.current!.play();
        announcements.current!.announce(announce);
      } catch {
        chime.current!.disable();
        announcements.current!.disable();
        setSpeechEnabled(false);
        setAudio(false);
        setAudioError(
          'Call sound was interrupted. Enable announcements again and check this device’s volume.',
        );
      }
    }
  }, [resource.data, resource.error, audio, ticketBranch, displayBranch]);
  return (
    <main className="public-display">
      <header>
        <div className="brand">
          {selectedBranch?.clinicName || 'Clinic'}
          <span>Waiting room</span>
        </div>
        <Field label="Branch">
          <select
            value={displayBranch || ''}
            disabled={!branches.data?.length}
            onChange={(event) => chooseBranch(Number(event.target.value))}
          >
            {!displayBranch && <option value="">Choose branch</option>}
            {[...(branches.data || [])]
              .sort((a, b) => a.id - b.id)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.clinicName} · {branch.name}
                </option>
              ))}
          </select>
        </Field>
        <button
          className="secondary"
          onClick={toggleAudio}
          disabled={enablingAudio}
          aria-pressed={audio}
        >
          <Volume2 size={20} />
          {enablingAudio
            ? 'Starting announcements…'
            : audio
              ? 'Announcements on · Disable'
              : 'Enable announcements'}
        </button>
      </header>
      {audioError && <ErrorNotice>{audioError}</ErrorNotice>}
      {speechError && <ErrorNotice>{speechError}</ErrorNotice>}
      {audio && (
        <p className="form-help" role="status">
          {speechEnabled ? 'Chime and spoken ticket announcements enabled.' : 'Call chime enabled.'}{' '}
          A sample played; check this device’s volume.
        </p>
      )}
      {branches.error && <ErrorNotice>{branches.error}</ErrorNotice>}
      {branches.loading && <Loading />}
      {!branches.loading && !branches.error && !branches.data?.length && (
        <Empty
          title="No branches available"
          description="The clinic has no active branch for its waiting room display."
        />
      )}
      {selectedBranch && (
        <>
          <p className="form-help">{selectedBranch.name} · Updates every 15 seconds.</p>
          <ResourceState
            {...resource}
            loading={resource.loading || (!resource.error && ticketBranch !== displayBranch)}
          >
            <div className="display-grid">
              <section>
                <h1>Now calling</h1>
                {resource.data?.filter((t) =>
                  ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status),
                )?.length ? (
                  resource.data
                    .filter((t) => ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status))
                    .map((t) => (
                      <div className="display-call" key={t.ticketNumber}>
                        <strong>{t.ticketNumber}</strong>
                        <span>Please proceed to {t.roomName}</span>
                      </div>
                    ))
                ) : (
                  <Empty
                    title="Rooms are ready"
                    description="Your ticket will appear here when called."
                  />
                )}
              </section>
              <section>
                <h2>Waiting for consultation</h2>
                <div className="waiting-tickets">
                  {resource.data
                    ?.filter((t) => ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status))
                    ?.map((t) => (
                      <strong key={t.ticketNumber}>{t.ticketNumber}</strong>
                    ))}
                </div>
                {!resource.data?.filter((t) => ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status))
                  ?.length && <p>No patients waiting.</p>}
                <div className="display-note">
                  Keep your ticket nearby.
                  <br />
                  Please tell our front desk if you need assistance.
                </div>
              </section>
            </div>
          </ResourceState>
        </>
      )}
      <footer>Patient names and clinical information are kept private.</footer>
    </main>
  );
}
export function VerifyCertificate() {
  const [result, setResult] = useState<{
    valid: boolean;
    status?: string;
    revoked?: boolean;
    documentNumber: string;
    startDate: string;
    endDate: string;
    clinicName?: string;
  }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const token =
    location.pathname.split('/')[2] || new URLSearchParams(location.search).get('token');
  useEffect(() => {
    if (token) {
      setLoading(true);
      api
        .get<typeof result>(`/verify/${encodeURIComponent(token)}`)
        .then(setResult)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [token]);
  return (
    <main className="verification">
      <div className="verification-card">
        <ShieldCheck size={36} />
        <h1>Verify a medical certificate</h1>
        <p>Check the certificate reference against the clinic's issuance record.</p>
        {!token && (
          <MutationForm
            label="Verify certificate"
            onSubmit={async (f) => {
              const data = await api.get<typeof result>(
                `/verify/${encodeURIComponent(formText(f, 'token'))}`,
              );
              setResult(data);
            }}
          >
            <Field label="Verification token">
              <input name="token" required />
            </Field>
          </MutationForm>
        )}
        {loading && <Loading />}
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {result && (
          <div className="verification-result">
            <Status value={result.valid ? 'VERIFIED' : result.status || 'INVALID'} />
            <h2>{result.documentNumber}</h2>
            <p>{result.clinicName}</p>
            <dl>
              <dt>Leave period</dt>
              <dd>
                {result.startDate} – {result.endDate}
              </dd>
              <dt>Certificate status</dt>
              <dd>{result.revoked ? 'Revoked' : result.valid ? 'Valid' : 'Invalid'}</dd>
            </dl>
          </div>
        )}
        <a href="/">Staff sign in</a>
      </div>
    </main>
  );
}
