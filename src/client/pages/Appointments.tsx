import { useState } from 'react';
import { api } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  SearchablePatientSelect,
  ResourceState,
  SelectReference,
  Status,
  formText,
  useResource,
} from '../components';
import { type Patient, type Appointment, type Reference, dateTime } from '../types';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import { useListControls } from '../ListControls';
import { malaysiaDate } from '../../shared/clinic-dates';
export default function Appointments({
  practitioners,
  rooms,
}: {
  practitioners: Reference[];
  rooms: Reference[];
}) {
  const resource = useResource<Appointment[]>('/appointments');
  const patients = useResource<Patient[]>('/references/patients');
  const [section, setSection] = useState('visits');
  const [bookingRevision, setBookingRevision] = useState(0);
  const [deleting, setDeleting] = useState<Appointment>();
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const minimumDate = `${malaysiaDate()}T00:00`;
  const visits = useListControls(resource.data || [], {
    label: 'Scheduled visits',
    search: (row) =>
      `${row.id} ${row.patientName || patients.data?.find((patient) => patient.id === row.patientId)?.name || ''} ${row.reason || ''}`,
    filters: [
      { key: 'status', label: 'Status', value: (row) => row.status },
      {
        key: 'doctor',
        label: 'Practitioner',
        value: (row) =>
          practitioners.find((doctor) => doctor.id === row.practitionerId)?.name ||
          String(row.practitionerId),
      },
    ],
    sorts: [
      { key: 'time', label: 'Appointment time', value: (row) => row.startsAt },
      {
        key: 'patient',
        label: 'Patient name',
        value: (row) =>
          row.patientName || patients.data?.find((patient) => patient.id === row.patientId)?.name,
      },
      { key: 'id', label: 'Appointment ID', value: (row) => row.id },
    ],
  });
  return (
    <>
      <PageTitle
        title="Appointments"
        description="Plan practitioner time and reserve the right consultation room."
      />
      <WorkspaceSections label="Appointment sections" value={section} onChange={setSection}>
        <WorkspaceSection
          id="visits"
          label="Scheduled visits"
          description="Review booked visits and their current status."
        >
          <Panel title="Scheduled visits">
            {deleteSuccess && (
              <p className="notice success" role="status">
                Appointment deleted from scheduled visits. Audit history remains preserved.
              </p>
            )}
            {deleteError && <ErrorNotice>{deleteError}</ErrorNotice>}
            {deleting && (
              <div
                className="notice appointment-delete-confirm"
                role="group"
                aria-label="Confirm appointment deletion"
              >
                <p>
                  Delete appointment #{deleting.id} for{' '}
                  {deleting.patientName ||
                    patients.data?.find((patient) => patient.id === deleting.patientId)?.name ||
                    'this patient'}{' '}
                  on {dateTime(deleting.startsAt)}? Linked clinical visits cannot be deleted.
                </p>
                <div className="actions">
                  <button
                    type="button"
                    disabled={deletingBusy}
                    onClick={async () => {
                      setDeletingBusy(true);
                      setDeleteError('');
                      try {
                        await api.request(`/appointments/${deleting.id}`, 'DELETE', {
                          version: deleting.version,
                        });
                        setDeleting(undefined);
                        setDeleteSuccess(true);
                        resource.refresh();
                      } catch (error) {
                        setDeleteError((error as Error).message);
                      } finally {
                        setDeletingBusy(false);
                      }
                    }}
                  >
                    {deletingBusy ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={deletingBusy}
                    onClick={() => setDeleting(undefined)}
                  >
                    Keep appointment
                  </button>
                </div>
              </div>
            )}
            {visits.controls}
            <ResourceState {...resource}>
              {resource.data?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Patient</th>
                        <th>Time</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visits.items.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>
                              {a.patientName ||
                                patients.data?.find((p) => p.id === a.patientId)?.name ||
                                'Patient'}
                            </strong>
                          </td>
                          <td>
                            {dateTime(a.startsAt)}
                            <small>Until {dateTime(a.endsAt)}</small>
                          </td>
                          <td>{a.reason || 'Consultation'}</td>
                          <td>
                            <Status value={a.status} />
                          </td>
                          <td>
                            {['BOOKED', 'CANCELLED'].includes(a.status) && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setDeleting(a);
                                  setDeleteError('');
                                  setDeleteSuccess(false);
                                }}
                              >
                                Delete appointment
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
                  title="No appointments yet"
                  description="Book a visit to reserve practitioner time. Booking notifications enter the delivery queue automatically."
                />
              )}
            </ResourceState>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="booking"
          label="Book appointment"
          description="Choose a patient, practitioner and consultation slot before confirming the visit."
        >
          <Panel title="New appointment">
            <MutationForm
              key={bookingRevision}
              label="Confirm booking"
              onSuccess={() => {
                resource.refresh();
                setSection('visits');
                setBookingRevision((value) => value + 1);
              }}
              onSubmit={(f) =>
                api.post('/appointments', {
                  patientId: Number(formText(f, 'patientId')),
                  practitionerId: Number(formText(f, 'practitionerId')),
                  roomId: Number(formText(f, 'roomId')) || undefined,
                  startsAt: new Date(formText(f, 'startsAt')).toISOString(),
                  endsAt: new Date(formText(f, 'endsAt')).toISOString(),
                  reason: formText(f, 'reason'),
                })
              }
            >
              <div className="form-grid">
                <SearchablePatientSelect />
                <SelectReference name="practitionerId" label="Practitioner" items={practitioners} />
                <SelectReference name="roomId" label="Room" items={rooms} required={false} />
                <Field label="Reason for visit">
                  <input name="reason" required />
                </Field>
                <Field label="Starts">
                  <input name="startsAt" type="datetime-local" min={minimumDate} required />
                </Field>
                <Field label="Ends">
                  <input name="endsAt" type="datetime-local" min={minimumDate} required />
                </Field>
              </div>
              <p className="form-help">
                Overlapping practitioner and room bookings are checked before confirmation. Choose
                today or a future date in Malaysia time. Earlier times today are allowed.
              </p>
            </MutationForm>
          </Panel>
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
