import { useEffect, useState } from 'react';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api, isDemo } from '../api';
import {
  Empty,
  ErrorNotice,
  MutationForm,
  PageTitle,
  Panel,
  PatientSelect,
  ResourceState,
  SelectReference,
  Status,
  formText,
  useResource,
} from '../components';
import { type Patient, type Reference, type Ticket, queueStates } from '../types';
import { useListControls } from '../ListControls';
import { useConfirm } from '../Confirmation';
export default function Queue({
  rooms,
  practitioners,
}: {
  rooms: Reference[];
  practitioners: Reference[];
}) {
  const confirm = useConfirm();
  const resource = useResource<Ticket[]>('/queue');
  const estimate = useResource<{
    estimatedMinutes: number | null;
    sampleCount: number;
    practitionerCount: number;
    waiting: number;
    basis: string;
  }>('/queue/estimate');
  const patients = useResource<Patient[]>('/references/patients');
  const [checkIn, setCheckIn] = useState(false);
  const [checkInRevision, setCheckInRevision] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number>();
  const [room, setRoom] = useState('');
  const [doctor, setDoctor] = useState('');
  useEffect(() => {
    const refresh = () => {
      resource.refresh();
      estimate.refresh();
    };
    const stream = isDemo ? undefined : new EventSource(api.url('/queue/events'));
    stream?.addEventListener('queue', refresh);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      stream?.close();
      window.clearInterval(interval);
    };
  }, []);
  const tickets = resource.data || [];
  const queueList = useListControls(tickets, {
    label: 'Queue tickets',
    search: (row) =>
      `${row.ticketNumber} ${row.patientName || patients.data?.find((patient) => patient.id === row.patientId)?.name || ''} ${row.roomName || ''}`,
    filters: [
      { key: 'status', label: 'Status', value: (row) => row.status },
      { key: 'room', label: 'Room', value: (row) => row.roomName || 'Unassigned' },
    ],
    sorts: [
      { key: 'time', label: 'Check-in time', value: (row) => row.createdAt },
      {
        key: 'patient',
        label: 'Patient name',
        value: (row) =>
          row.patientName || patients.data?.find((patient) => patient.id === row.patientId)?.name,
      },
      { key: 'id', label: 'Ticket ID', value: (row) => row.id },
    ],
  });
  const waiting = tickets.filter((t) => ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status));
  const active = tickets.filter((t) => ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status));
  async function transition(ticket: Ticket, target?: string) {
    const next =
      target || queueStates[queueStates.indexOf(ticket.status as (typeof queueStates)[number]) + 1];
    if (!next) return;
    if (
      !(await confirm({
        title: 'Update patient visit?',
        message: `Move ${ticket.patientName || 'patient'} (${ticket.ticketNumber}) from ${ticket.status.replaceAll('_', ' ').toLowerCase()} to ${next.replaceAll('_', ' ').toLowerCase()}? This updates the live queue.`,
        confirmLabel: 'Update visit',
      }))
    )
      return;
    setError('');
    setBusy(ticket.id);
    try {
      await api.post(`/queue/${ticket.id}/transition`, {
        status: next,
        version: ticket.version,
        ...(next === 'CALLED_TO_ROOM'
          ? { roomId: Number(room), practitionerId: Number(doctor) }
          : {}),
      });
      resource.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <>
      <PageTitle
        title="Today's clinic"
        description="Keep each visit moving, from arrival to checkout."
        action={
          <div className="actions">
            <a
              className="button secondary"
              href={
                api.getBranch()
                  ? `/display?branchId=${encodeURIComponent(String(api.getBranch()))}`
                  : '/display'
              }
              target={isDemo ? undefined : '_blank'}
              rel="noreferrer"
            >
              Open waiting room display
            </a>
          </div>
        }
      />
      <div className="queue-summary">
        <div>
          <span>Waiting for consultation</span>
          <strong>{resource.loading ? '—' : waiting.length}</strong>
        </div>
        <div>
          <span>With practitioner</span>
          <strong>{resource.loading ? '—' : active.length}</strong>
        </div>
        <div>
          <span>Dispensary & checkout</span>
          <strong>
            {resource.loading
              ? '—'
              : tickets.filter((t) => ['DISPENSARY_WAITING', 'PAYMENT_WAITING'].includes(t.status))
                  .length}
          </strong>
        </div>
        <div>
          <span>Completed today</span>
          <strong>
            {resource.loading ? '—' : tickets.filter((t) => t.status === 'COMPLETED').length}
          </strong>
        </div>
      </div>
      <p className="queue-estimate" role="status">
        {estimate.loading
          ? 'Calculating queue estimate…'
          : estimate.error
            ? 'Queue estimate unavailable. Refresh to try again.'
            : estimate.data?.estimatedMinutes == null
              ? 'Queue clearance estimate needs more consultation history and an active practitioner.'
              : `Approximate queue clearance: ${estimate.data.estimatedMinutes} minutes · ${estimate.data.waiting} waiting · based on ${estimate.data.sampleCount} consultations and ${estimate.data.practitionerCount} practitioners. Individual waiting times may vary.`}
      </p>
      <WorkspaceSections
        label="Clinic overview sections"
        value={checkIn ? 'check-in' : 'queue'}
        onChange={(id) => setCheckIn(id === 'check-in')}
      >
        <WorkspaceSection
          id="queue"
          label="Live queue"
          description="Review room availability and move today's visits through care."
        >
          <div className="room-strip">
            {rooms.length ? (
              rooms.map((r) => {
                const ticket = active.find((t) => t.roomId === r.id);
                return (
                  <div className={`room ${ticket ? 'occupied' : ''}`} key={r.id}>
                    <span>{r.name}</span>
                    <strong>{ticket?.ticketNumber || 'Ready'}</strong>
                    <small>
                      {ticket
                        ? ticket.patientName || 'Patient called'
                        : 'Available for consultation'}
                    </small>
                  </div>
                );
              })
            ) : (
              <p>No consultation rooms configured.</p>
            )}
          </div>
          <Panel
            title="Live visit queue"
            action={
              <button className="text-button" onClick={resource.refresh}>
                <RefreshCw size={16} />
                Refresh
              </button>
            }
          >
            <div className="queue-controls">
              <label>
                Call into room
                <select value={room} onChange={(e) => setRoom(e.target.value)}>
                  <option value="">Select room</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Attending practitioner
                <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                  <option value="">Select practitioner</option>
                  {practitioners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Queue updates every 15 seconds.
                <br />
                Room allocation is checked when you call.
              </p>
            </div>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            {queueList.controls}
            <ResourceState {...resource}>
              {tickets.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Patient</th>
                        <th>Stage</th>
                        <th>Room</th>
                        <th>Next action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queueList.items.map((t) => (
                        <tr key={t.id}>
                          <td className="ticket">
                            {t.ticketNumber}
                            <small>Ticket ID #{t.id}</small>
                          </td>
                          <td>
                            {t.patientName ||
                              patients.data?.find((p) => p.id === t.patientId)?.name ||
                              'Patient record'}
                          </td>
                          <td>
                            <Status value={t.status} />
                          </td>
                          <td>{t.roomName || rooms.find((r) => r.id === t.roomId)?.name || '—'}</td>
                          <td>
                            {!['COMPLETED', 'SKIPPED'].includes(t.status) && (
                              <button
                                className="secondary"
                                disabled={
                                  busy === t.id ||
                                  (t.status === 'TRIAGE_WAITING' && (!room || !doctor))
                                }
                                onClick={() => transition(t)}
                              >
                                {busy === t.id
                                  ? 'Updating…'
                                  : (
                                      {
                                        REGISTERED: 'Ready for triage',
                                        TRIAGE_WAITING: 'Call to room',
                                        CALLED_TO_ROOM: 'Start consultation',
                                        IN_CONSULTATION: 'Send to dispensary',
                                        DISPENSARY_WAITING: 'Ready for payment',
                                        PAYMENT_WAITING: 'Complete visit',
                                      } as Record<string, string>
                                    )[t.status]}
                                <ArrowRight size={14} />
                              </button>
                            )}
                            {['REGISTERED', 'TRIAGE_WAITING'].includes(t.status) && (
                              <button
                                className="text-button"
                                disabled={busy === t.id}
                                onClick={() => transition(t, 'SKIPPED')}
                              >
                                Skip
                              </button>
                            )}
                            {t.status === 'SKIPPED' && (
                              <button
                                className="secondary"
                                disabled={busy === t.id}
                                onClick={() => transition(t, 'TRIAGE_WAITING')}
                              >
                                Undo skip
                              </button>
                            )}
                            {t.status === 'CALLED_TO_ROOM' && (
                              <button
                                className="text-button"
                                disabled={busy === t.id}
                                onClick={() => transition(t, 'TRIAGE_WAITING')}
                              >
                                Undo call
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Ready for the first arrival"
                  description="Check in a registered patient to begin today's queue."
                />
              )}
            </ResourceState>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="check-in"
          label="Check in patient"
          description="Add a registered patient to today's queue."
        >
          <Panel title="Check in">
            <ResourceState {...patients}>
              <MutationForm
                key={checkInRevision}
                label="Add to queue"
                onSuccess={() => {
                  resource.refresh();
                  setCheckIn(false);
                  setCheckInRevision((revision) => revision + 1);
                }}
                onSubmit={(f) =>
                  api.post('/queue', {
                    patientId: Number(formText(f, 'patientId')),
                    priority: formText(f, 'priority'),
                  })
                }
              >
                <div className="form-grid">
                  <PatientSelect patients={patients.data || []} />
                  <label className="field">
                    <span>Priority</span>
                    <select name="priority">
                      <option>NORMAL</option>
                      <option>URGENT</option>
                    </select>
                  </label>
                </div>
              </MutationForm>
            </ResourceState>
          </Panel>
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
