import { useState } from 'react';
import { api } from '../api';
import {
  Empty,
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
export default function Appointments({
  practitioners,
  rooms,
}: {
  practitioners: Reference[];
  rooms: Reference[];
}) {
  const resource = useResource<Appointment[]>('/appointments');
  const patients = useResource<Patient[]>('/references/patients');
  const [create, setCreate] = useState(false);
  return (
    <>
      <PageTitle
        title="Appointments"
        description="Plan practitioner time and reserve the right consultation room."
        action={
          <button onClick={() => setCreate(!create)}>
            {create ? 'Close booking' : 'Book appointment'}
          </button>
        }
      />
      {create && (
        <Panel title="New appointment">
          <MutationForm
            label="Confirm booking"
            onSuccess={() => {
              resource.refresh();
              setCreate(false);
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
                <input name="startsAt" type="datetime-local" required />
              </Field>
              <Field label="Ends">
                <input name="endsAt" type="datetime-local" required />
              </Field>
            </div>
            <p className="form-help">
              Overlapping practitioner and room bookings are checked before confirmation.
            </p>
          </MutationForm>
        </Panel>
      )}
      <Panel title="Scheduled visits">
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
                  </tr>
                </thead>
                <tbody>
                  {resource.data.map((a) => (
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
    </>
  );
}
