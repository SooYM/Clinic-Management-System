import { useState } from 'react';
import { api } from './api';
import {
  Empty,
  Field,
  MutationForm,
  Panel,
  ResourceState,
  formText,
  useResource,
  useRole,
} from './components';
import { dateTime, humanize } from './types';
import type { MedicationDoseLog as DoseLog } from '../shared/medication-doses';

function malaysiaTimeInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export default function MedicationDoseLog({
  encounterId,
  signed,
  medicines,
}: {
  encounterId: number;
  signed: boolean;
  medicines: { id: number; name: string; unit: string }[];
}) {
  const role = useRole();
  const resource = useResource<DoseLog>(`/encounters/${encounterId}/medication-doses`);
  const [outcome, setOutcome] = useState('TAKEN');
  const [formKey, setFormKey] = useState(crypto.randomUUID());
  return (
    <Panel title="Patient medication-taking log">
      <p className="form-help">
        Record reported or observed doses only. These records never reduce clinic stock or imply a
        medicine schedule.
      </p>
      {signed && medicines.length > 0 && (role === 'DOCTOR' || role === 'NURSE') && (
        <MutationForm
          key={formKey}
          label="Record medication dose"
          onSuccess={() => {
            resource.refresh();
            setFormKey(crypto.randomUUID());
            setOutcome('TAKEN');
          }}
          onSubmit={(form) =>
            api.post(`/encounters/${encounterId}/medication-doses`, {
              itemId: Number(formText(form, 'itemId')),
              outcome: formText(form, 'outcome'),
              source: formText(form, 'source'),
              occurredAt: new Date(`${formText(form, 'occurredAt')}:00+08:00`).toISOString(),
              amount: outcome === 'TAKEN' ? Number(form.get('amount')) : null,
              notes: formText(form, 'notes'),
              idempotencyKey: formKey,
            })
          }
        >
          <Field label="Prescribed medicine">
            <select name="itemId" required>
              <option value="">Choose medicine</option>
              {medicines.map((medicine) => (
                <option value={medicine.id} key={medicine.id}>
                  {medicine.name} · {medicine.unit}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Dose outcome">
              <select
                name="outcome"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
              >
                <option value="TAKEN">Taken</option>
                <option value="MISSED">Missed</option>
              </select>
            </Field>
            <Field label="Information source">
              <select name="source">
                <option value="PATIENT_REPORTED">Patient reported</option>
                <option value="STAFF_OBSERVED">Staff observed</option>
              </select>
            </Field>
            <Field label="Dose date and time (Malaysia)">
              <input
                name="occurredAt"
                type="datetime-local"
                required
                defaultValue={malaysiaTimeInput()}
              />
            </Field>
            {outcome === 'TAKEN' && (
              <Field
                label="Amount taken (medicine units)"
                hint="Positive amount in the prescribed inventory unit; up to 3 decimal places."
              >
                <input
                  name="amount"
                  type="number"
                  min="0.001"
                  max="1000000"
                  step="0.001"
                  required
                />
              </Field>
            )}
          </div>
          <Field label="Dose notes (optional)">
            <textarea name="notes" maxLength={2000} />
          </Field>
        </MutationForm>
      )}
      {!signed && (
        <p className="form-help">
          Medication doses can be recorded only after the GP signs a medicine prescription.
        </p>
      )}
      <ResourceState {...resource}>
        {resource.data?.entries.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Medicine / outcome</th>
                  <th>Source / dose time</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.entries.map((dose) => (
                  <tr key={dose.id}>
                    <td>
                      <strong>{dose.medicineName}</strong>
                      <small>
                        {humanize(dose.outcome)}
                        {dose.amount !== null ? ` · ${dose.amount} ${dose.unit}` : ''}
                      </small>
                      {dose.notes && <small>{dose.notes}</small>}
                    </td>
                    <td>
                      {humanize(dose.source)}
                      <small>{dateTime(dose.occurredAt)} MYT</small>
                    </td>
                    <td>
                      {dose.actorName}
                      <small>{dateTime(dose.createdAt)} MYT</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No patient doses recorded"
            description="No reports or observations have been recorded for this consultation. Absence of a record does not mean a dose was missed."
          />
        )}
      </ResourceState>
    </Panel>
  );
}
