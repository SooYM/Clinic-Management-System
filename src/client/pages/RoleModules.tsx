import { useEffect, useState } from 'react';
import { api } from '../api';
import { Field, MutationForm, Panel, ResourceState, useResource } from '../components';
interface AccessPolicy {
  roles: { role: string; modules: string[] }[];
  moduleDefinitions: { id: string; label: string }[];
}
export default function RoleModules({ onSaved }: { onSaved: () => void }) {
  const resource = useResource<AccessPolicy>('/admin/role-modules');
  const [role, setRole] = useState('RECEPTIONIST');
  const [modules, setModules] = useState<string[]>([]);
  useEffect(() => {
    setModules(resource.data?.roles.find((r) => r.role === role)?.modules || []);
  }, [role, resource.data]);
  return (
    <Panel title="Role module access">
      <ResourceState {...resource}>
        {resource.data && (
          <MutationForm
            label="Save role access"
            onSubmit={() => api.put('/admin/role-modules', { role, modules })}
            onSuccess={() => {
              resource.refresh();
              onSaved();
            }}
          >
            <Field label="Staff role">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {resource.data.roles
                  .filter((r) => r.role !== 'ADMIN')
                  .map((r) => (
                    <option value={r.role} key={r.role}>
                      {r.role === 'DOCTOR'
                        ? 'GP (general practitioner)'
                        : r.role.toLowerCase().replaceAll('_', ' ')}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="access-matrix">
              {resource.data.moduleDefinitions.map((module) => (
                <label className="checkbox" key={module.id}>
                  <input
                    type="checkbox"
                    checked={modules.includes(module.id)}
                    onChange={(e) =>
                      setModules((v) =>
                        e.target.checked ? [...v, module.id] : v.filter((id) => id !== module.id),
                      )
                    }
                  />
                  {module.label}
                </label>
              ))}
            </div>
            <p className="form-help">
              Module access applies to staff with this role. Clinical signing and other restricted
              actions still require the appropriate professional role. Administrators retain all
              modules. Account security and the user guide remain available to everyone.
            </p>
          </MutationForm>
        )}
      </ResourceState>
    </Panel>
  );
}
