import { useState } from 'react';
import { api } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  ResourceState,
  SelectReference,
  Status,
  formText,
  useResource,
} from '../components';
import { type Reference, type User, dateTime } from '../types';
import AdminCatalogs from '../AdminCatalogs';
import RoleModules from './RoleModules';
import { PASSWORD_MIN_LENGTH } from '../../shared/password-policy';
interface Staff extends User {
  active: boolean;
}
interface Audit {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  actorName?: string;
  createdAt: string;
}
export default function Admin({
  branches,
  onBranchCreated,
}: {
  branches: Reference[];
  onBranchCreated: () => void;
}) {
  const users = useResource<Staff[]>('/admin/users');
  const rooms =
    useResource<(Reference & { branchName?: string; active: boolean })[]>('/admin/rooms');
  const audit = useResource<Audit[]>('/admin/audit');
  const [error, setError] = useState('');
  const [staffRole, setStaffRole] = useState('RECEPTIONIST');
  const [editingRoom, setEditingRoom] = useState<Reference & { active: boolean }>();
  return (
    <>
      <PageTitle
        title="Clinic administration"
        description="Manage staff access, branches, and the system audit trail."
      />
      <div className="two-column">
        <Panel title="Create staff account">
          <MutationForm
            label="Create account"
            onSuccess={() => {
              users.refresh();
              onBranchCreated();
            }}
            onSubmit={(f) =>
              api.post('/admin/users', {
                name: formText(f, 'name'),
                email: formText(f, 'email'),
                password: formText(f, 'password'),
                role: formText(f, 'role'),
                branchId: Number(formText(f, 'branchId')),
                licenseNumber: formText(f, 'licenseNumber') || null,
              })
            }
          >
            <div className="form-grid">
              <Field label="Full name">
                <input name="name" required />
              </Field>
              <Field label="Email">
                <input name="email" type="email" required />
              </Field>
              <Field
                label="Initial password"
                hint={`Use at least ${PASSWORD_MIN_LENGTH} characters.`}
              >
                <input
                  name="password"
                  type="password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="Role">
                <select
                  name="role"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                >
                  {['RECEPTIONIST', 'DOCTOR', 'NURSE', 'THERAPIST', 'ADMIN'].map((r) => (
                    <option key={r} value={r}>
                      {r === 'DOCTOR' ? 'GP (general practitioner)' : r}
                    </option>
                  ))}
                </select>
              </Field>
              <SelectReference items={branches} name="branchId" label="Branch" />
              <Field
                label="Practitioner registration number"
                hint={staffRole === 'DOCTOR' ? 'Required for GP accounts.' : undefined}
              >
                <input name="licenseNumber" required={staffRole === 'DOCTOR'} />
              </Field>
            </div>
          </MutationForm>
        </Panel>
        <Panel title="Create branch">
          <MutationForm
            label="Create branch"
            onSuccess={onBranchCreated}
            onSubmit={(f) =>
              api.post('/admin/branches', {
                name: formText(f, 'name'),
                address: formText(f, 'address'),
              })
            }
          >
            <Field label="Branch name">
              <input name="name" required />
            </Field>
            <Field label="Address">
              <textarea name="address" required />
            </Field>
          </MutationForm>
        </Panel>
      </div>
      <Panel title="Consultation rooms">
        <MutationForm
          label="Create room"
          onSuccess={() => {
            rooms.refresh();
            onBranchCreated();
          }}
          onSubmit={(f) =>
            api.post('/admin/rooms', {
              name: formText(f, 'name'),
              branchId: Number(formText(f, 'branchId')),
            })
          }
        >
          <div className="form-grid">
            <Field label="Room name">
              <input name="name" required placeholder="Room 01" />
            </Field>
            <SelectReference items={branches} name="branchId" label="Branch" />
          </div>
        </MutationForm>
        <ResourceState {...rooms}>
          {rooms.data?.map((r) => (
            <div key={r.id} className="list-row">
              <strong>{r.name}</strong>
              <p>
                Room ID #{r.id} · Branch ID #{r.branchId} ·{' '}
                {r.branchName || branches.find((b) => b.id === r.branchId)?.name}
              </p>
              <div className="actions">
                <Status value={r.active ? 'ACTIVE' : 'ARCHIVED'} />
                <button className="secondary" onClick={() => setEditingRoom(r)}>
                  Rename
                </button>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      setError('');
                      await api.put(`/admin/rooms/${r.id}`, { active: !r.active });
                      rooms.refresh();
                      onBranchCreated();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  {r.active ? 'Archive' : 'Restore'}
                </button>
              </div>
            </div>
          ))}
        </ResourceState>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {editingRoom && (
          <MutationForm
            key={editingRoom.id}
            label="Save room name"
            onSuccess={() => {
              rooms.refresh();
              onBranchCreated();
              setEditingRoom(undefined);
            }}
            onSubmit={(f) =>
              api.put(`/admin/rooms/${editingRoom.id}`, { name: formText(f, 'name') })
            }
          >
            <Field label="Room name">
              <input name="name" required defaultValue={editingRoom.name} />
            </Field>
            <button className="text-button" type="button" onClick={() => setEditingRoom(undefined)}>
              Cancel rename
            </button>
          </MutationForm>
        )}
      </Panel>
      <RoleModules onSaved={onBranchCreated} />
      <Panel title="Branch record IDs">
        {branches.map((branch) => (
          <div className="list-row" key={branch.id}>
            <strong>{branch.name}</strong>
            <p>Branch ID #{branch.id}</p>
          </div>
        ))}
      </Panel>
      <Panel title="Staff access">
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <ResourceState {...users}>
          {users.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td>#{u.id}</td>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{u.role === 'DOCTOR' ? 'GP' : u.role}</td>
                      <td>
                        <Status value={u.active ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td>
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              setError('');
                              await api.put(`/admin/users/${u.id}`, { active: !u.active });
                              users.refresh();
                              onBranchCreated();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No staff accounts"
              description="Create staff accounts to give your care team access."
            />
          )}
        </ResourceState>
      </Panel>
      <AdminCatalogs />
      <Panel title="Audit trail">
        <ResourceState {...audit}>
          {audit.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Record type</th>
                    <th>Record reference</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.map((a) => (
                    <tr key={a.id}>
                      <td>{dateTime(a.createdAt)}</td>
                      <td>{a.action}</td>
                      <td>{a.entityType}</td>
                      <td>{a.entityId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No audit entries"
              description="Record access and mutations appear here as the clinic starts using the system."
            />
          )}
        </ResourceState>
      </Panel>
    </>
  );
}
