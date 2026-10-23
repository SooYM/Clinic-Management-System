import { useState } from 'react';
import { api } from './api';
import {
  Field,
  MutationForm,
  Panel,
  ResourceState,
  formText,
  useModules,
  useResource,
} from './components';
import { dateTime } from './types';
import type { RegistrationPatient } from './pages/PatientForm';
import './PublicRegistration.css';
import DetailDialog from './DetailDialog';

interface Submission {
  id: number;
  reference: string;
  ticketNumber: string;
  patient: RegistrationPatient;
  possibleMatch: { id: number; name: string; nationalId: string; phone: string } | null;
  identityConflict?: boolean;
  version: number;
  createdAt: string;
  expiresAt: string;
}
function ReviewRegistration({ entry, onSaved }: { entry: Submission; onSaved: () => void }) {
  const [action, setAction] = useState(entry.identityConflict ? 'reject' : 'confirm');
  const [open, setOpen] = useState(false);
  const patient = entry.patient;
  return (
    <div className="registration-review">
      <div className="list-row">
        <strong>
          {entry.ticketNumber} · {[patient.firstName, patient.lastName].filter(Boolean).join(' ')} ·{' '}
          {entry.reference}
        </strong>
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          Review registration
        </button>
      </div>
      <DetailDialog
        title={`Review registration · ${entry.ticketNumber}`}
        open={open}
        onClose={() => setOpen(false)}
      >
        <p className="form-help">
          Submitted {dateTime(entry.createdAt)} · Expires {dateTime(entry.expiresAt)}
        </p>
        <dl className="registration-details">
          <dt>First / last name</dt>
          <dd>
            {patient.firstName} {patient.lastName}
          </dd>
          <dt>IC / passport</dt>
          <dd>{patient.nationalId}</dd>
          <dt>Birth date / gender</dt>
          <dd>
            {patient.dateOfBirth?.slice(0, 10)} · {patient.sex}
          </dd>
          <dt>Nationality</dt>
          <dd>
            {patient.nationality === 'MALAYSIAN'
              ? 'Malaysian'
              : `${patient.countryName || patient.countryCode || 'Non-Malaysian'}`}
          </dd>
          <dt>Phone / email</dt>
          <dd>{[patient.phone, patient.email].filter(Boolean).join(' · ') || 'Not provided'}</dd>
          <dt>Address</dt>
          <dd>
            {[
              patient.addressLine1,
              patient.addressLine2,
              patient.postcode,
              patient.city,
              patient.state,
            ]
              .filter(Boolean)
              .join(', ') || 'Not provided'}
          </dd>
        </dl>
        {entry.possibleMatch && (
          <p className="notice info">
            Possible existing patient: {entry.possibleMatch.name} · Patient #
            {entry.possibleMatch.id} · {entry.possibleMatch.nationalId} ·{' '}
            {entry.possibleMatch.phone}. Verify identity before linking. Existing profile details
            will remain unchanged.
          </p>
        )}
        {entry.identityConflict && (
          <p className="notice info">
            This identity is already registered at another branch. Check-in is blocked here. Contact
            the original branch or ask an administrator to resolve the patient’s branch access; do
            not create a duplicate profile.
          </p>
        )}
        <MutationForm
          label={action === 'reject' ? 'Reject registration' : 'Confirm identity and check in'}
          onSuccess={onSaved}
          disabled={action === 'confirm' && !!entry.identityConflict}
          disabledReason="Resolve this identity with the original branch before check-in."
          onSubmit={async (form) => {
            if (action === 'reject') {
              await api.post(`/registrations/${entry.id}/reject`, {
                version: entry.version,
                reason: formText(form, 'reason'),
              });
            } else {
              if (entry.identityConflict)
                throw new Error('This identity must be handled by its original branch.');
              if (form.get('identityVerified') !== 'on')
                throw new Error('Verify the patient’s identity document before check-in.');
              const existingPatientId = formText(form, 'patientChoice');
              await api.post(`/registrations/${entry.id}/confirm`, {
                version: entry.version,
                identityVerified: true,
                ...(existingPatientId && existingPatientId !== 'new'
                  ? { existingPatientId: Number(existingPatientId) }
                  : {}),
              });
            }
          }}
        >
          <Field label="Reception action">
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="confirm" disabled={entry.identityConflict}>
                Verify and check in
              </option>
              <option value="reject">Reject registration</option>
            </select>
          </Field>
          {action === 'confirm' ? (
            <>
              <Field
                label="Patient profile"
                hint="Link only after checking the original identity document. Existing profiles are never overwritten."
              >
                <select
                  name="patientChoice"
                  required
                  defaultValue={entry.possibleMatch ? '' : 'new'}
                >
                  {entry.possibleMatch && (
                    <>
                      <option value="">Choose after identity verification</option>
                      <option value={entry.possibleMatch.id}>
                        Link existing patient #{entry.possibleMatch.id} · {entry.possibleMatch.name}
                      </option>
                    </>
                  )}
                  {!entry.possibleMatch && (
                    <option value="new">Create a new patient profile</option>
                  )}
                </select>
              </Field>
              <label className="checkbox">
                <input type="checkbox" name="identityVerified" required />I checked the IC or
                passport and confirmed the patient is present.
              </label>
              <p className="form-help">
                This activates reserved ticket {entry.ticketNumber}. It does not issue another
                ticket or assign a room.
              </p>
            </>
          ) : (
            <Field
              label="Reason"
              hint="For staff records. Ask the patient to speak with reception."
            >
              <textarea name="reason" maxLength={500} rows={2} />
            </Field>
          )}
        </MutationForm>
      </DetailDialog>
    </div>
  );
}
function Inbox() {
  const resource = useResource<Submission[]>('/registrations?status=PENDING', 15000);
  return (
    <Panel title="Online registrations awaiting reception">
      <p className="form-help">
        Reserved tickets remain outside the active queue until you verify identity and confirm
        arrival. Review each patient before check-in.
      </p>
      <ResourceState {...resource}>
        {resource.data?.length ? (
          resource.data.map((entry) => (
            <ReviewRegistration
              key={`${entry.id}:${entry.version}`}
              entry={entry}
              onSaved={resource.refresh}
            />
          ))
        ) : (
          <p className="form-help">No online registrations awaiting confirmation.</p>
        )}
      </ResourceState>
    </Panel>
  );
}
export default function RegistrationInbox() {
  const modules = useModules();
  return modules.includes('patients') && modules.includes('queue') ? <Inbox /> : null;
}
