import { Empty, PageTitle, Panel, ResourceState, Status, useResource } from '../components';
import { dateTime } from '../types';
import { useListControls } from '../ListControls';
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
  const list = useListControls(resource.data || [], {
    label: 'Loaded notification delivery',
    search: (row) => `${row.id} ${row.patientName || ''} ${row.template} ${row.lastError || ''}`,
    filters: [
      { key: 'status', label: 'Delivery status', value: (row) => row.status },
      { key: 'channel', label: 'Channel', value: (row) => row.channel },
    ],
    sorts: [
      { key: 'date', label: 'Created date', value: (row) => row.createdAt },
      { key: 'patient', label: 'Patient name', value: (row) => row.patientName || '' },
      { key: 'id', label: 'Notification ID', value: (row) => row.id },
    ],
  });
  return (
    <>
      <PageTitle
        title="Reports & delivery"
        description="Review patient notification delivery for appointments, queue calls, and medication refills."
      />
      <Panel title="Patient notification delivery">
        {list.controls}
        <ResourceState {...resource}>
          {list.items.length ? (
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
                  {list.items.map((n) => (
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
              title={
                resource.data?.length ? 'No matching notifications' : 'No notifications queued'
              }
              description="Consent-based appointment confirmations, queue alerts, and refill reminders appear here when created."
            />
          )}
        </ResourceState>
      </Panel>
    </>
  );
}
