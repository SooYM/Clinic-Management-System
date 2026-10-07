import type { CatalogEntry } from '../shared/catalogs';
export type { CatalogEntry } from '../shared/catalogs';
import { useState } from 'react';
import { api } from './api';
import {
  Empty,
  ErrorNotice,
  Field,
  MutationForm,
  Panel,
  ResourceState,
  Status,
  formText,
  useResource,
} from './components';
export const catalogKinds = [
  ['LAB_PANEL', 'Lab investigation panels'],
  ['SPECIMEN_TYPE', 'Specimen types'],
  ['INVENTORY_UNIT', 'Inventory units'],
  ['REFERRAL_DESTINATION', 'Referral destinations'],
] as const;
export default function AdminCatalogs() {
  const [showRemoved, setShowRemoved] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('LAB_PANEL');
  const [editing, setEditing] = useState<CatalogEntry>();
  const resource = useResource<CatalogEntry[]>(`/admin/catalogs?kind=${kind}`);
  return (
    <Panel title="Clinical and inventory choices">
      <p className="form-help">
        Edit choices for future records. Removal hides future choices; recorded document details
        stay unchanged.
      </p>
      <Field label="Choice list">
        <select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setEditing(undefined);
          }}
        >
          {catalogKinds.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <MutationForm
        key={editing ? `${editing.id}:${editing.version}` : kind}
        label={editing ? 'Save choice' : 'Add choice'}
        onSuccess={() => {
          resource.refresh();
          setEditing(undefined);
        }}
        onSubmit={(form) => {
          const body = {
            label: formText(form, 'label'),
            sortOrder: Number(form.get('sortOrder')),
            active: form.get('active') === 'on',
          };
          return editing
            ? api.put(`/admin/catalogs/${editing.id}`, { ...body, version: editing.version })
            : api.post('/admin/catalogs', { ...body, kind });
        }}
      >
        <div className="form-grid">
          <Field label="Choice label">
            <input
              name="label"
              maxLength={kind === 'INVENTORY_UNIT' ? 50 : kind === 'SPECIMEN_TYPE' ? 100 : 200}
              required
              defaultValue={editing?.label}
            />
          </Field>
          <Field label="Display order">
            <input
              name="sortOrder"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              defaultValue={editing?.sortOrder || 0}
            />
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} />
          Available in new forms
        </label>
        {editing && (
          <button type="button" className="text-button" onClick={() => setEditing(undefined)}>
            Cancel editing
          </button>
        )}
      </MutationForm>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={showRemoved}
          onChange={(event) => setShowRemoved(event.target.checked)}
        />
        Show removed choices
      </label>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <ResourceState {...resource}>
        {resource.data?.some((entry) => showRemoved || entry.active) ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Choice</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {resource.data
                  .filter((entry) => showRemoved || entry.active)
                  .map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {entry.label}
                        <small>Choice ID #{entry.id}</small>
                      </td>
                      <td>{entry.sortOrder}</td>
                      <td>
                        <Status value={entry.active ? 'ACTIVE' : 'ARCHIVED'} />
                      </td>
                      <td>
                        <div className="actions">
                          <button className="secondary" onClick={() => setEditing(entry)}>
                            Edit choice
                          </button>
                          <button
                            className="secondary"
                            onClick={async () => {
                              try {
                                setError('');
                                await api.put('/admin/catalogs/' + entry.id, {
                                  label: entry.label,
                                  sortOrder: entry.sortOrder,
                                  active: !entry.active,
                                  version: entry.version,
                                });
                                resource.refresh();
                                if (editing?.id === entry.id) setEditing(undefined);
                              } catch (failure) {
                                setError((failure as Error).message);
                              }
                            }}
                          >
                            {entry.active ? 'Remove' : 'Restore'}
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
            title="No choices configured"
            description="Add clinic choices above to make them available in staff forms."
          />
        )}
      </ResourceState>
    </Panel>
  );
}
