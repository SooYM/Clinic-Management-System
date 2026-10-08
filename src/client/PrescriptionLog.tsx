import { Empty, ResourceState, Status, useResource } from './components';
import { dateTime, humanize } from './types';
import type { PrescriptionLog as Log } from '../shared/document-view';
import { useListControls } from './ListControls';

export default function PrescriptionLog({ encounterId }: { encounterId: number }) {
  const resource = useResource<Log>(`/encounters/${encounterId}/prescription-log`);
  const list = useListControls(resource.data?.events || [], {
    label: 'Prescription activity',
    search: (row) => `${row.itemName} ${row.actorName} ${row.batchNumber || ''} ${row.dosage}`,
    filters: [{ key: 'type', label: 'Activity type', value: (row) => row.type }],
    sorts: [
      { key: 'date', label: 'Activity date', value: (row) => row.at },
      { key: 'medicine', label: 'Medicine name', value: (row) => row.itemName },
      { key: 'quantity', label: 'Quantity', value: (row) => row.quantity },
    ],
  });
  return (
    <section aria-label="Prescription activity log">
      <h3>Prescription activity log</h3>
      <p className="form-help">
        Clinic prescribing, stock reservation and dispensing records. This does not record whether
        the patient took medicine.
      </p>
      {list.controls}
      <ResourceState {...resource}>
        {list.items.length ? (
          <ol className="prescription-log">
            {list.items.map((event, index) => (
              <li key={index}>
                <div className="actions">
                  <Status value={event.type} />
                  <strong>
                    {event.itemName} · {event.quantity} units
                  </strong>
                </div>
                <p>
                  {event.frequencyPerDay} times per day · {humanize(event.mealTiming)} ·{' '}
                  {event.durationDays} days
                </p>
                <p className="form-help">{event.dosage}</p>
                <small>
                  {event.batchNumber ? `Batch ${event.batchNumber} · ` : ''}
                  {event.actorName} · {dateTime(event.at)}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <Empty
            title={
              resource.data?.events.length
                ? 'No matching prescription activity'
                : 'No prescription activity recorded'
            }
            description="This encounter has no recorded prescribing or stock events."
          />
        )}
      </ResourceState>
    </section>
  );
}
