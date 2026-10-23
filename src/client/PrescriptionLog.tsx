import { Empty, ErrorNotice, Loading, Status, useResource } from './components';
import { dateTime, humanize } from './types';
import type { PrescriptionLog as Log } from '../shared/document-view';
import type { MedicationDoseLog as DoseLog } from '../shared/medication-doses';
import { useListControls } from './ListControls';

export default function PrescriptionLog({
  encounterId,
  includeDoses = false,
  revision = 0,
}: {
  encounterId: number;
  includeDoses?: boolean;
  revision?: number;
}) {
  const resource = useResource<Log>(`/encounters/${encounterId}/prescription-log`);
  const doses = useResource<DoseLog>(
    includeDoses ? `/encounters/${encounterId}/medication-doses?revision=${revision}` : '',
  );
  const events = [
    ...(resource.data?.events || []).map((event, index) => ({
      id: `stock-${index}`,
      type: event.type,
      medicine: event.itemName,
      amount: `${event.quantity} units`,
      at: event.at,
      actor: event.actorName,
      detail: [
        event.quantityPerDose ? `${event.quantityPerDose} per serving` : '',
        event.indication ? `For ${event.indication}` : '',
        event.dosage,
        event.instructions && event.instructions !== event.dosage ? event.instructions : '',
        `${event.frequencyPerDay} times daily · ${humanize(event.mealTiming)} · ${event.durationDays} days`,
      ]
        .filter(Boolean)
        .join(' · '),
      source: event.batchNumber ? `Batch ${event.batchNumber}` : 'Clinic prescription',
    })),
    ...(includeDoses ? doses.data?.entries || [] : []).map((dose) => ({
      id: `dose-${dose.id}`,
      type: dose.outcome === 'TAKEN' ? 'DOSE_TAKEN' : 'DOSE_MISSED',
      medicine: dose.medicineName,
      amount: dose.amount === null ? '' : `${dose.amount} ${dose.unit}`,
      at: dose.occurredAt,
      actor: dose.actorName,
      detail: dose.notes,
      source: humanize(dose.source),
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const list = useListControls(events, {
    label: includeDoses ? 'Medication timeline' : 'Prescription activity',
    search: (row) => `${row.medicine} ${row.actor} ${row.source} ${row.detail}`,
    filters: [{ key: 'type', label: 'Activity type', value: (row) => row.type }],
    sorts: [
      { key: 'date', label: 'Activity date', value: (row) => row.at },
      { key: 'medicine', label: 'Medicine name', value: (row) => row.medicine },
    ],
  });
  const loading = resource.loading || (includeDoses && doses.loading);
  const error = resource.error || (includeDoses && doses.error);
  return (
    <section aria-label={includeDoses ? 'Medication timeline' : 'Prescription activity log'}>
      <p className="form-help">
        {includeDoses
          ? 'Prescribed, reserved and dispensed entries track clinic stock. Dose taken or missed entries record patient reports or staff observations.'
          : 'Clinic prescribing, stock reservation and dispensing records.'}
      </p>
      {list.controls}
      {loading && <Loading />}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {!loading &&
        !error &&
        (list.items.length ? (
          <ol className="prescription-log">
            {list.items.map((event) => (
              <li key={event.id}>
                <div className="actions">
                  <Status value={event.type} />
                  <strong>
                    {event.medicine}
                    {event.amount && ` · ${event.amount}`}
                  </strong>
                </div>
                {event.detail && <p>{event.detail}</p>}
                <small>
                  {event.source} · {event.actor} · {dateTime(event.at)}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <Empty
            title={
              events.length ? 'No matching medication activity' : 'No medication activity recorded'
            }
            description="Prescriptions, stock activity and reported doses appear here when recorded."
          />
        ))}
    </section>
  );
}
