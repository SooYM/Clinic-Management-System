import { Empty, ResourceState, Status, useResource } from './components';
import { dateTime, humanize } from './types';
import type { PrescriptionLog as Log } from '../shared/document-view';

export default function PrescriptionLog({ encounterId }: { encounterId: number }) {
  const resource = useResource<Log>(`/encounters/${encounterId}/prescription-log`);
  return (
    <section aria-label="Prescription activity log">
      <h3>Prescription activity log</h3>
      <p className="form-help">
        Clinic prescribing, stock reservation and dispensing records. This does not record whether
        the patient took medicine.
      </p>
      <ResourceState {...resource}>
        {resource.data?.events.length ? (
          <ol className="prescription-log">
            {resource.data.events.map((event, index) => (
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
            title="No prescription activity recorded"
            description="This encounter has no recorded prescribing or stock events."
          />
        )}
      </ResourceState>
    </section>
  );
}
