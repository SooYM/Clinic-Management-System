import { useState } from 'react';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
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
import { useListControls } from '../ListControls';
import { useConfirm } from '../Confirmation';
interface Staff extends User {
  active: boolean;
}
interface AdminBranch extends Reference {
  address: string;
  active: boolean;
  version: number;
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
  const confirm = useConfirm();
  const users = useResource<Staff[]>('/admin/users');
  const branchRecords = useResource<AdminBranch[]>('/admin/branches');
  const [editingBranch, setEditingBranch] = useState<AdminBranch>();
  const [editingStaff, setEditingStaff] = useState<Staff>();
  const rooms =
    useResource<(Reference & { branchName?: string; active: boolean })[]>('/admin/rooms');
  const audit = useResource<Audit[]>('/admin/audit');
  const clinic = useResource<{ id: number; name: string }>('/admin/clinic');
  const [clinicSaved, setClinicSaved] = useState(false);
  const [showRemovedStaff, setShowRemovedStaff] = useState(false);
  const [showRemovedBranches, setShowRemovedBranches] = useState(false);
  const [showRemovedRooms, setShowRemovedRooms] = useState(false);
  const [section, setSection] = useState('staff');
  const [staffError, setStaffError] = useState('');
  const [branchError, setBranchError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [staffRole, setStaffRole] = useState('RECEPTIONIST');
  const [editingRoom, setEditingRoom] = useState<Reference & { active: boolean }>();
  const staffList = useListControls(
    (users.data || []).filter((row) => showRemovedStaff || row.active),
    {
      label: 'Staff accounts',
      search: (row) => `${row.id} ${row.name} ${row.email}`,
      filters: [
        { key: 'role', label: 'Role', value: (row) => row.role },
        { key: 'status', label: 'Status', value: (row) => (row.active ? 'Active' : 'Removed') },
      ],
      sorts: [
        { key: 'name', label: 'Name', value: (row) => row.name },
        { key: 'id', label: 'Staff ID', value: (row) => row.id },
      ],
    },
  );
  const branchList = useListControls(
    (branchRecords.data || []).filter((row) => showRemovedBranches || row.active),
    {
      label: 'Branches',
      search: (row) => `${row.id} ${row.name} ${row.address}`,
      filters: [
        { key: 'status', label: 'Status', value: (row) => (row.active ? 'Active' : 'Removed') },
      ],
      sorts: [
        { key: 'name', label: 'Name', value: (row) => row.name },
        { key: 'id', label: 'Branch ID', value: (row) => row.id },
      ],
    },
  );
  const roomList = useListControls(
    (rooms.data || []).filter((row) => showRemovedRooms || row.active),
    {
      label: 'Consultation rooms',
      search: (row) => `${row.id} ${row.name} ${row.branchName || ''}`,
      filters: [
        {
          key: 'branch',
          label: 'Branch',
          value: (row) =>
            row.branchName ||
            branches.find((branch) => branch.id === row.branchId)?.name ||
            String(row.branchId),
        },
        { key: 'status', label: 'Status', value: (row) => (row.active ? 'Active' : 'Removed') },
      ],
      sorts: [
        { key: 'name', label: 'Room name', value: (row) => row.name },
        { key: 'id', label: 'Room ID', value: (row) => row.id },
      ],
    },
  );
  const auditList = useListControls(audit.data || [], {
    label: 'Audit trail',
    search: (row) =>
      `${row.id} ${row.action} ${row.entityType} ${row.entityId} ${row.actorName || ''}`,
    filters: [
      { key: 'action', label: 'Action', value: (row) => row.action },
      { key: 'type', label: 'Record type', value: (row) => row.entityType },
    ],
    sorts: [
      { key: 'date', label: 'Date', value: (row) => row.createdAt },
      { key: 'id', label: 'Audit ID', value: (row) => row.id },
    ],
  });
  return (
    <>
      <PageTitle
        title="Clinic administration"
        description="Manage staff access, branches, and the system audit trail."
      />
      <WorkspaceSections label="Administration sections" value={section} onChange={setSection}>
        <WorkspaceSection
          id="clinic"
          label="Clinic settings"
          description="Set the clinic name shown on future clinic documents and receipts."
        >
          <Panel title="Clinic name">
            <ResourceState {...clinic}>
              {clinic.data && (
                <MutationForm
                  key={clinic.data.name}
                  label="Save clinic name"
                  onSuccess={() => {
                    setClinicSaved(true);
                    clinic.refresh();
                  }}
                  onSubmit={(form) =>
                    api.put('/admin/clinic', {
                      name: formText(form, 'name'),
                      expectedName: clinic.data!.name,
                    })
                  }
                >
                  <Field label="Clinic name">
                    <input
                      name="name"
                      required
                      maxLength={200}
                      defaultValue={clinic.data.name}
                      onChange={() => setClinicSaved(false)}
                    />
                  </Field>
                  <p className="form-help">
                    New receipts use the updated clinic name. Receipts with saved clinic details
                    keep their recorded clinic name.
                  </p>
                </MutationForm>
              )}
            </ResourceState>
            {clinicSaved && (
              <p className="notice success" role="status">
                Clinic name saved.
              </p>
            )}
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="staff"
          label="Staff accounts"
          description="Create accounts and manage existing staff access."
        >
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
                  licenseNumber:
                    formText(f, 'role') === 'DOCTOR' ? formText(f, 'licenseNumber') || null : null,
                })
              }
            >
              <div className="form-grid">
                <Field label="Full name">
                  <input name="name" required maxLength={150} />
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
                {staffRole === 'DOCTOR' && (
                  <Field label="Practitioner registration number" hint="Required for GP accounts.">
                    <input name="licenseNumber" required />
                  </Field>
                )}
              </div>
            </MutationForm>
          </Panel>
          <Panel title="Staff access">
            {staffError && <ErrorNotice>{staffError}</ErrorNotice>}
            {editingStaff && (
              <MutationForm
                key={editingStaff.id}
                label="Save staff name"
                onSuccess={() => {
                  users.refresh();
                  setEditingStaff(undefined);
                  onBranchCreated();
                }}
                onSubmit={(form) =>
                  api.put('/admin/users/' + editingStaff.id, { name: formText(form, 'name') })
                }
              >
                <Field label="Staff name">
                  <input name="name" maxLength={150} required defaultValue={editingStaff.name} />
                </Field>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditingStaff(undefined)}
                >
                  Cancel editing
                </button>
              </MutationForm>
            )}
            <p className="form-help">
              Removal hides future choices; existing records stay preserved. Remove access disables
              sign-in and preserves staff history. Restore access to reactivate an account.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showRemovedStaff}
                onChange={(event) => setShowRemovedStaff(event.target.checked)}
              />
              Show removed staff accounts
            </label>
            {staffList.controls}
            <ResourceState {...users}>
              {users.data?.some((user) => showRemovedStaff || user.active) ? (
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
                      {staffList.items.map((u) => (
                        <tr key={u.id}>
                          <td>#{u.id}</td>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td>{u.role === 'DOCTOR' ? 'GP' : u.role}</td>
                          <td>
                            <Status value={u.active ? 'ACTIVE' : 'INACTIVE'} />
                          </td>
                          <td>
                            <div className="actions">
                              <button className="secondary" onClick={() => setEditingStaff(u)}>
                                Edit name
                              </button>
                              <button
                                className="secondary"
                                onClick={async () => {
                                  if (
                                    !(await confirm({
                                      title: u.active
                                        ? 'Remove staff access?'
                                        : 'Restore staff access?',
                                      message: u.active
                                        ? `Disable sign-in for ${u.name}? Their existing records remain preserved.`
                                        : `Allow ${u.name} to sign in again with their existing role?`,
                                      confirmLabel: u.active ? 'Remove access' : 'Restore access',
                                    }))
                                  )
                                    return;
                                  try {
                                    setStaffError('');
                                    await api.put(`/admin/users/${u.id}`, { active: !u.active });
                                    if (editingStaff?.id === u.id) setEditingStaff(undefined);
                                    users.refresh();
                                    onBranchCreated();
                                  } catch (e) {
                                    setStaffError((e as Error).message);
                                  }
                                }}
                              >
                                {u.active ? 'Remove access' : 'Restore access'}
                              </button>
                            </div>
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
        </WorkspaceSection>
        <WorkspaceSection
          id="branches"
          label="Branches"
          description="Create clinic branches and review their record identifiers."
        >
          <Panel title="Create branch">
            <MutationForm
              label="Create branch"
              onSuccess={() => {
                branchRecords.refresh();
                onBranchCreated();
              }}
              onSubmit={(f) =>
                api.post('/admin/branches', {
                  name: formText(f, 'name'),
                  address: formText(f, 'address'),
                })
              }
            >
              <Field label="Branch name">
                <input name="name" required maxLength={150} />
              </Field>
              <Field label="Address">
                <textarea name="address" required maxLength={1000} />
              </Field>
            </MutationForm>
          </Panel>
          <Panel title="Branch record IDs">
            <p className="form-help">
              Remove archives a branch and preserves its records. Switch to another branch first.
              Branches assigned as home branch to active staff must stay available.
            </p>
            {branchError && <ErrorNotice>{branchError}</ErrorNotice>}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showRemovedBranches}
                onChange={(event) => setShowRemovedBranches(event.target.checked)}
              />
              Show removed branches
            </label>
            {branchList.controls}
            <ResourceState {...branchRecords}>
              {branchList.items.map((branch) => (
                <div className="list-row" key={branch.id}>
                  <strong>{branch.name}</strong>
                  <p>
                    Branch ID #{branch.id} · {branch.address}
                  </p>
                  <div className="actions">
                    <Status value={branch.active ? 'ACTIVE' : 'ARCHIVED'} />
                    <button className="secondary" onClick={() => setEditingBranch(branch)}>
                      Edit name / address
                    </button>
                    <button
                      className="secondary"
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: branch.active ? 'Remove branch?' : 'Restore branch?',
                            message: branch.active
                              ? `Archive ${branch.name} and hide it from future choices? Its records remain preserved.`
                              : `Make ${branch.name} available for future use again?`,
                            confirmLabel: branch.active ? 'Remove branch' : 'Restore branch',
                          }))
                        )
                          return;
                        try {
                          setBranchError('');
                          await api.put('/admin/branches/' + branch.id, {
                            name: branch.name,
                            address: branch.address,
                            active: !branch.active,
                            version: branch.version,
                          });
                          if (editingBranch?.id === branch.id) setEditingBranch(undefined);
                          branchRecords.refresh();
                          onBranchCreated();
                        } catch (failure) {
                          setBranchError((failure as Error).message);
                        }
                      }}
                    >
                      {branch.active ? 'Remove' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </ResourceState>
            {editingBranch && (
              <MutationForm
                key={editingBranch.id + ':' + editingBranch.version}
                label="Save branch details"
                onSuccess={() => {
                  branchRecords.refresh();
                  setEditingBranch(undefined);
                  onBranchCreated();
                }}
                onSubmit={(form) =>
                  api.put('/admin/branches/' + editingBranch.id, {
                    name: formText(form, 'name'),
                    address: formText(form, 'address'),
                    active: editingBranch.active,
                    version: editingBranch.version,
                  })
                }
              >
                <Field label="Branch name">
                  <input name="name" required maxLength={150} defaultValue={editingBranch.name} />
                </Field>
                <Field label="Address">
                  <textarea
                    name="address"
                    required
                    maxLength={1000}
                    defaultValue={editingBranch.address}
                  />
                </Field>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setEditingBranch(undefined)}
                >
                  Cancel editing
                </button>
              </MutationForm>
            )}
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="rooms"
          label="Consultation rooms"
          description="Create, rename or archive rooms in this branch."
        >
          <Panel title="Consultation rooms">
            <p className="form-help">
              Remove deletes unused rooms or archives rooms with history. Busy rooms and rooms with
              upcoming bookings cannot be removed.
            </p>
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
                  <input name="name" required maxLength={100} placeholder="Room 01" />
                </Field>
                <SelectReference items={branches} name="branchId" label="Branch" />
              </div>
            </MutationForm>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showRemovedRooms}
                onChange={(event) => setShowRemovedRooms(event.target.checked)}
              />
              Show removed rooms
            </label>
            {roomList.controls}
            <ResourceState {...rooms}>
              {roomList.items.map((r) => (
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
                        if (
                          !(await confirm({
                            title: r.active
                              ? 'Remove consultation room?'
                              : 'Restore consultation room?',
                            message: r.active
                              ? `Remove ${r.name} from future choices? Rooms with history are archived and unused rooms are deleted.`
                              : `Make ${r.name} available for future consultations again?`,
                            confirmLabel: r.active ? 'Remove room' : 'Restore room',
                          }))
                        )
                          return;
                        try {
                          setRoomError('');
                          if (r.active) await api.request(`/admin/rooms/${r.id}`, 'DELETE');
                          else await api.put(`/admin/rooms/${r.id}`, { active: true });
                          if (editingRoom?.id === r.id) setEditingRoom(undefined);
                          rooms.refresh();
                          onBranchCreated();
                        } catch (e) {
                          setRoomError((e as Error).message);
                        }
                      }}
                    >
                      {r.active ? 'Remove' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
            </ResourceState>
            {roomError && <ErrorNotice>{roomError}</ErrorNotice>}
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
                  <input name="name" required maxLength={100} defaultValue={editingRoom.name} />
                </Field>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setEditingRoom(undefined)}
                >
                  Cancel rename
                </button>
              </MutationForm>
            )}
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="catalogs"
          label="Catalog choices"
          description="Manage the active choices available to clinic staff."
        >
          <AdminCatalogs />
        </WorkspaceSection>
        <WorkspaceSection
          id="access"
          label="Role access"
          description="Choose the modules each staff role may use."
        >
          <RoleModules onSaved={onBranchCreated} />
        </WorkspaceSection>
        <WorkspaceSection
          id="audit"
          label="Audit trail"
          description="Review recorded access and changes to clinic records."
        >
          <Panel title="Audit trail">
            {auditList.controls}
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
                      {auditList.items.map((a) => (
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
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
