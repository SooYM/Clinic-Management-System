import { Empty, PageTitle, Panel, ResourceState, Status, useResource } from '../components';
import { dateTime } from '../types';
interface Notification {
  id: number;
  patientName?: string;
  channel: string;
  template: string;
  status: string;
  createdAt: string;
  lastError?: string;
}
export default function Reports() {
  const resource = useResource<Notification[]>('/notifications');
  return (
    <>
      <PageTitle
        title="Reports & delivery"
        description="Review patient notification delivery for appointments, queue calls, and medication refills."
      />
      <Panel title="Patient notification delivery">
        <ResourceState {...resource}>
          {resource.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Channel</th>
                    <th>Message</th>
                    <th>Delivery</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.map((n) => (
                    <tr key={n.id}>
                      <td>{n.patientName || 'Patient notification'}</td>
                      <td>{n.channel}</td>
                      <td>
                        {n.template}
                        <small>{n.lastError}</small>
                      </td>
                      <td>
                        <Status value={n.status} />
                      </td>
                      <td>{dateTime(n.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No notifications queued"
              description="Consent-based appointment confirmations, queue alerts, and refill reminders appear here when created."
            />
          )}
        </ResourceState>
      </Panel>
    </>
  );
}
