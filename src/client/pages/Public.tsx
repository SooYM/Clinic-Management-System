import { useEffect, useState } from 'react';
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
export function QueueDisplay() {
  const displayBranch = new URLSearchParams(location.search).get('branchId');
  const resource = useResource<DisplayTicket[]>(
    `/queue/display${displayBranch ? `?branchId=${encodeURIComponent(displayBranch)}` : ''}`,
  );
  const [audio, setAudio] = useState(false);
  const [lastCalls, setLastCalls] = useState('');
  useEffect(() => {
    const interval = window.setInterval(resource.refresh, 5000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const calls =
      resource.data
        ?.filter((t) => ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status))
        ?.map((t) => t.ticketNumber)
        .join(',') || '';
    if (audio && calls && lastCalls && calls !== lastCalls) {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.12, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.7);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.7);
      oscillator.onended = () => void audioContext.close();
    }
    setLastCalls(calls);
  }, [resource.data, audio]);
  return (
    <main className="public-display">
      <header>
        <div className="brand">
          Clinic<span>Waiting room</span>
        </div>
        <button className="secondary" onClick={() => setAudio(!audio)}>
          <Volume2 size={20} />
          {audio ? 'Sound on' : 'Enable call chime'}
        </button>
      </header>
      <ResourceState {...resource}>
        <div className="display-grid">
          <section>
            <h1>Now calling</h1>
            {resource.data?.filter((t) => ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status))
              ?.length ? (
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
