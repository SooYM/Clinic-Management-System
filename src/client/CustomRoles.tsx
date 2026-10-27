import { useState } from 'react';
import { api } from './api';
import { Field, MutationForm, Panel, ResourceState, useResource, formText } from './components';
import { moduleDefinitions } from '../shared/module-permissions';
import type { CustomRole } from '../shared/custom-roles';

export default function CustomRoles({ onSaved }: { onSaved: () => void }) {
  const resource = useResource<CustomRole[]>('/admin/custom-roles');
  const [editing, setEditing] = useState<CustomRole>();
  const [modules, setModules] = useState<string[]>([]);
  return (
    <Panel title="Custom staff roles">
      <p className="form-help">
        Create a named module policy, then assign it under Staff accounts. Professional roles still
        control clinical actions. Administrators retain full access.
      </p>
      <MutationForm
        key={editing?.id ?? 'new'}
        label={editing ? 'Save custom role' : 'Create custom role'}
        onSubmit={(form) =>
          editing
            ? api.put(`/admin/custom-roles/${editing.id}`, {
                name: formText(form, 'name'),
                modules,
                version: editing.version,
              })
            : api.post('/admin/custom-roles', { name: formText(form, 'name'), modules })
        }
        onSuccess={() => {
          setEditing(undefined);
          setModules([]);
          resource.refresh();
          onSaved();
        }}
      >
        <Field label="Custom role name">
          <input name="name" required maxLength={100} defaultValue={editing?.name ?? ''} />
        </Field>
        <div className="access-matrix">
          {moduleDefinitions.map((module) => (
            <label className="checkbox" key={module.id}>
              <input
                type="checkbox"
                checked={modules.includes(module.id)}
                onChange={(event) =>
                  setModules((value) =>
                    event.target.checked
                      ? [...value, module.id]
                      : value.filter((id) => id !== module.id),
                  )
                }
              />
              {module.label}
            </label>
          ))}
        </div>
        {editing && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setEditing(undefined);
              setModules([]);
            }}
          >
            Cancel editing role
          </button>
        )}
      </MutationForm>
      <ResourceState {...resource}>
        {resource.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Custom role</th>
                  <th>Allowed modules</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resource.data.map((role) => (
                  <tr key={role.id}>
                    <td>{role.name}</td>
                    <td>
                      {moduleDefinitions
                        .filter((module) => role.modules.includes(module.id))
                        .map((module) => module.label)
                        .join(', ') || 'No modules'}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditing(role);
                          setModules(role.modules);
                        }}
                      >
                        Edit {role.name}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="form-help">No custom roles created.</p>
        )}
      </ResourceState>
    </Panel>
  );
}
