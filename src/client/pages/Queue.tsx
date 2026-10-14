import { Fragment, useEffect, useState } from 'react';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { api, isDemo } from '../api';
import {
  Empty,
  ErrorNotice,
  MutationForm,
  PageTitle,
  Panel,
  SearchablePatientSelect,
  ResourceState,
  formText,
  useResource,
  useModules,
} from '../components';
import {
  type Patient,
  type Reference,
  type Ticket,
  type Appointment,
  dateTime,
  queueStates,
} from '../types';
import { useListControls } from '../ListControls';
import { useConfirm } from '../Confirmation';
export default function Queue({
  rooms,
  practitioners,
}: {
  rooms: Reference[];
  practitioners: Reference[];
}) {
  const modules = useModules();
  const confirm = useConfirm();
  const resource = useResource<Ticket[]>('/queue');
  const arrivals = useResource<(Appointment & { practitionerName: string })[]>(
    '/queue/appointment-arrivals',
  );
  const estimate = useResource<{
    visitsToday: number;
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
  const [callingTicket, setCallingTicket] = useState<number>();
  const [arrivalBusy, setArrivalBusy] = useState<number>();
  const [arrivalError, setArrivalError] = useState('');
  useEffect(() => {
    const refresh = () => {
      resource.refresh();
      estimate.refresh();
      arrivals.refresh();
    };
    const stream = isDemo ? undefined : new EventSource(api.url('/queue/events'));
    stream?.addEventListener('queue', refresh);
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener('clinic:workflow-updated', refresh);
    return () => {
      stream?.close();
      window.clearInterval(interval);
      window.removeEventListener('clinic:workflow-updated', refresh);
    };
  }, []);
  const tickets = resource.data || [];
  const queueList = useListControls(tickets, {
    label: 'Queue tickets',
    search: (row) =>
      `${row.ticketNumber} ${row.patientName || patients.data?.find((patient) => patient.id === row.patientId)?.name || ''} ${row.roomName || ''}`,
    filters: [
      { key: 'status', label: 'Stage', value: (row) => stageLabel(row.status) },
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
  const waiting = tickets.filter(
    (t) => !t.expiredAt && ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status),
  );
  const active = tickets.filter(
    (t) => !t.expiredAt && ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status),
  );
  const canCall =
    rooms.some((entry) => entry.id === Number(room)) &&
    !active.some((ticket) => ticket.roomId === Number(room)) &&
    practitioners.some((entry) => entry.id === Number(doctor));
  function stageLabel(status: string) {
    return (
      (
        {
          REGISTERED: 'Waiting for doctor',
          TRIAGE_WAITING: 'Waiting for doctor',
          CALLED_TO_ROOM: 'Called to room',
          IN_CONSULTATION: 'With doctor',
          DISPENSARY_WAITING: 'Waiting for medicines',
          PAYMENT_WAITING: 'Waiting for payment',
          COMPLETED: 'Completed',
          SKIPPED: 'Skipped',
        } as Record<string, string>
      )[status] || status.replaceAll('_', ' ')
    );
  }
  function openCall(ticket: Ticket) {
    setCallingTicket(ticket.id);
    setRoom('');
    setDoctor(
      practitioners.some((entry) => entry.id === ticket.practitionerId)
        ? String(ticket.practitionerId)
        : '',
    );
    setError('');
  }
  async function transition(ticket: Ticket, target?: string) {
    const next =
      target || queueStates[queueStates.indexOf(ticket.status as (typeof queueStates)[number]) + 1];
    if (!next) return;
    if (
      !(await confirm({
        title: 'Update patient visit?',
        message:
          next === 'CALLED_TO_ROOM'
            ? `Call ${ticket.patientName || 'patient'} (${ticket.ticketNumber}) to ${rooms.find((entry) => entry.id === Number(room))?.name || 'selected room'} with ${practitioners.find((entry) => entry.id === Number(doctor))?.name || 'selected doctor'}?`
            : `Move ${ticket.patientName || 'patient'} (${ticket.ticketNumber}) from ${stageLabel(ticket.status).toLowerCase()} to ${stageLabel(next).toLowerCase()}? This updates the live queue.`,
        confirmLabel: next === 'CALLED_TO_ROOM' ? 'Call patient' : 'Update visit',
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
      estimate.refresh();
      if (callingTicket === ticket.id) setCallingTicket(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }
  async function checkInAppointment(appointment: Appointment) {
    if (
      !(await confirm({
        title: 'Check in appointment?',
        message: `Confirm ${appointment.patientName || 'patient'} has arrived for their ${dateTime(appointment.startsAt)} appointment? They will join the queue waiting to be called.`,
        confirmLabel: 'Check in patient',
      }))
    )
      return;
    setArrivalBusy(appointment.id);
    setArrivalError('');
    try {
      await api.post('/queue', {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        appointmentVersion: appointment.version,
        priority: 'NORMAL',
      });
      resource.refresh();
      arrivals.refresh();
      estimate.refresh();
      setCheckIn(false);
    } catch (failure) {
      setArrivalError((failure as Error).message);
      arrivals.refresh();
    } finally {
      setArrivalBusy(undefined);
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
              : tickets.filter(
                  (t) =>
                    !t.expiredAt && ['DISPENSARY_WAITING', 'PAYMENT_WAITING'].includes(t.status),
                ).length}
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
      <Panel title="Appointments ready for check-in">
        <p className="form-help">
          Today's appointments appear when their scheduled time arrives. Confirm arrival to add the
          patient to the waiting queue.
        </p>
        <ResourceState {...arrivals}>
          {arrivals.data?.length ? (
            <div className="consultation-history-list" role="list">
              {arrivals.data.map((appointment) => (
                <div className="consultation-history-row" role="listitem" key={appointment.id}>
                  <div className="consultation-history-summary">
                    <strong>{appointment.patientName}</strong>
                    <small>
                      Patient #{appointment.patientId} · {dateTime(appointment.startsAt)} ·{' '}
                      {appointment.practitionerName}
                    </small>
                    {appointment.reason && <p>{appointment.reason}</p>}
                  </div>
                  <button
                    className="secondary"
                    disabled={arrivalBusy !== undefined}
                    onClick={() => void checkInAppointment(appointment)}
                  >
                    {arrivalBusy === appointment.id ? 'Checking in…' : 'Check in patient'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="form-help">No appointments are due for check-in.</p>
          )}
        </ResourceState>
        {arrivalError && <ErrorNotice>{arrivalError}</ErrorNotice>}
      </Panel>
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
            <p className="form-help" role="status">
              <strong>
                Visits today:{' '}
                {resource.loading ? '—' : (estimate.data?.visitsToday ?? tickets.length)}
              </strong>
              {' · '}Resets at midnight, Malaysia time.
            </p>
            <p className="form-help">
              Choose Call to room beside a waiting patient, then select their room and doctor. Queue
              updates every 15 seconds.
            </p>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <details className="queue-filters">
              <summary>Search, filter and sort queue</summary>
              {queueList.controls}
            </details>
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
                        <Fragment key={t.id}>
                          <tr>
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
                              <span
                                className={`status ${t.expiredAt ? 'skipped' : t.status.toLowerCase()}`}
                              >
                                {t.expiredAt ? 'Expired' : stageLabel(t.status)}
                              </span>
                            </td>
                            <td>
                              {t.roomName || rooms.find((r) => r.id === t.roomId)?.name || '—'}
                            </td>
                            <td>
                              {!t.expiredAt && !['COMPLETED', 'SKIPPED'].includes(t.status) && (
                                <button
                                  className="secondary"
                                  disabled={busy !== undefined}
                                  aria-expanded={
                                    ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status)
                                      ? callingTicket === t.id
                                      : undefined
                                  }
                                  onClick={() =>
                                    ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status)
                                      ? openCall(t)
                                      : void transition(t)
                                  }
                                >
                                  {busy === t.id
                                    ? 'Updating…'
                                    : (
                                        {
                                          REGISTERED: 'Call to room',
                                          TRIAGE_WAITING: 'Call to room',
                                          CALLED_TO_ROOM: 'Start consultation',
                                          IN_CONSULTATION: 'Send to dispensary',
                                          DISPENSARY_WAITING: 'Send to payment',
                                          PAYMENT_WAITING: 'Complete visit',
                                        } as Record<string, string>
                                      )[t.status]}
                                  <ArrowRight size={14} />
                                </button>
                              )}
                              {!t.expiredAt &&
                                ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status) && (
                                  <button
                                    className="text-button"
                                    disabled={busy === t.id}
                                    onClick={() => transition(t, 'SKIPPED')}
                                  >
                                    Skip
                                  </button>
                                )}
                              {!t.expiredAt &&
                                t.status === 'SKIPPED' &&
                                new Date(t.createdAt).getTime() + 12 * 60 * 60 * 1000 >
                                  Date.now() && (
                                  <button
                                    className="secondary"
                                    disabled={busy === t.id}
                                    onClick={() => transition(t, 'TRIAGE_WAITING')}
                                  >
                                    Undo skip
                                  </button>
                                )}
                              {!t.expiredAt && t.status === 'CALLED_TO_ROOM' && (
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
                          {!t.expiredAt &&
                            callingTicket === t.id &&
                            ['REGISTERED', 'TRIAGE_WAITING'].includes(t.status) && (
                              <tr>
                                <td colSpan={5}>
                                  <form
                                    className="queue-call-panel"
                                    aria-label={`Call ${t.patientName || t.ticketNumber} to room`}
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      if (canCall && busy === undefined)
                                        void transition(t, 'CALLED_TO_ROOM');
                                    }}
                                  >
                                    <h3>Call {t.patientName || t.ticketNumber} to room</h3>
                                    {!rooms.length || !practitioners.length ? (
                                      <p className="notice" role="status">
                                        {!rooms.length
                                          ? 'No consultation room is configured for this branch. '
                                          : ''}
                                        {!practitioners.length
                                          ? 'No active doctor is configured for this branch. '
                                          : ''}
                                        Ask an administrator to configure these before calling this
                                        patient.
                                      </p>
                                    ) : (
                                      <div className="queue-controls">
                                        <label data-guide="field-call-into-room">
                                          Consultation room
                                          <select
                                            required
                                            value={room}
                                            onChange={(event) => setRoom(event.target.value)}
                                          >
                                            <option value="">Choose room</option>
                                            {rooms.map((entry) => (
                                              <option
                                                key={entry.id}
                                                value={entry.id}
                                                disabled={active.some(
                                                  (ticket) => ticket.roomId === entry.id,
                                                )}
                                              >
                                                {entry.name}
                                                {active.some((ticket) => ticket.roomId === entry.id)
                                                  ? ' · Occupied'
                                                  : ''}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label data-guide="field-attending-practitioner">
                                          Doctor
                                          <select
                                            required
                                            value={doctor}
                                            onChange={(event) => setDoctor(event.target.value)}
                                          >
                                            <option value="">Choose doctor</option>
                                            {practitioners.map((entry) => (
                                              <option key={entry.id} value={entry.id}>
                                                {entry.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <p>
                                          Review this patient's room and doctor. Occupied rooms
                                          cannot be selected.
                                        </p>
                                      </div>
                                    )}
                                    {!!rooms.length &&
                                      rooms.every((entry) =>
                                        active.some((ticket) => ticket.roomId === entry.id),
                                      ) && (
                                        <p role="status">
                                          All consultation rooms are occupied. Wait for a room to
                                          become available.
                                        </p>
                                      )}
                                    <div className="actions">
                                      <button
                                        type="submit"
                                        disabled={!canCall || busy !== undefined}
                                      >
                                        Confirm call
                                      </button>
                                      <button
                                        type="button"
                                        className="secondary"
                                        disabled={busy !== undefined}
                                        onClick={() => setCallingTicket(undefined)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                </td>
                              </tr>
                            )}
                        </Fragment>
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
          <Panel
            title="Check in"
            action={
              modules.includes('patients') ? (
                <a
                  className="button"
                  href="#patients"
                  onClick={() =>
                    sessionStorage.setItem(
                      `clinic:register-patient:${api.getBranch() || 'default'}`,
                      '1',
                    )
                  }
                >
                  Register patient
                </a>
              ) : undefined
            }
          >
            <p className="form-help">
              A check-in stays active for 12 hours. If the patient already has an active visit,
              continue that ticket in Live queue. Expiry keeps their clinical records.
            </p>
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
                  <SearchablePatientSelect />
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
