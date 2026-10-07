import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../api';
import {
  Empty,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  ResourceState,
  Status,
  formText,
  useResource,
} from '../components';
import { type InventoryItem, dateTime, humanize } from '../types';
interface PendingPrescription {
  id: number;
  patientId: number;
  patientName: string;
  nationalId: string;
  practitionerName: string;
  createdAt: string;
  allergies: string[];
  prescriptions: {
    itemId: number;
    itemName: string;
    quantity: number;
    dosage: string;
    durationDays: number;
    frequencyPerDay: number;
    mealTiming: string;
  }[];
}
export default function Inventory() {
  const resource = useResource<InventoryItem[]>('/inventory');
  const pending = useResource<PendingPrescription[]>('/dispensary/encounters');
  const [create, setCreate] = useState(false);
  const [encounterId, setEncounterId] = useState('');
  const [dispenseKey, setDispenseKey] = useState(crypto.randomUUID());
  const selected = pending.data?.find((e) => e.id === Number(encounterId));
  function refresh() {
    resource.refresh();
    pending.refresh();
  }
  return (
    <>
      <PageTitle
        title="Dispensary"
        description="Receive stock by batch and dispense signed GP prescriptions using first expiry, first out."
        action={
          <div className="actions">
            <button className="secondary" onClick={refresh}>
              <RefreshCw size={16} />
              Refresh stock
            </button>
            <button data-guide="open-inventory-item" onClick={() => setCreate(!create)}>
              {create ? 'Close new item' : 'Add inventory item'}
            </button>
          </div>
        }
      />
      {create && (
        <Panel title="Inventory item">
          <MutationForm
            label="Add item"
            onSuccess={() => {
              refresh();
              setCreate(false);
            }}
            onSubmit={(f) =>
              api.post('/inventory', {
                name: formText(f, 'name'),
                sku: formText(f, 'sku'),
                ingredient: formText(f, 'ingredient'),
                category: formText(f, 'category'),
                unit: formText(f, 'unit'),
                priceCents: Math.round(Number(f.get('price')) * 100),
                reorderLevel: Number(f.get('reorderLevel')),
              })
            }
          >
            <div className="form-grid">
              <Field label="Item name">
                <input name="name" required placeholder="e.g. Paracetamol 500 mg" />
              </Field>
              <Field label="SKU">
                <input name="sku" required placeholder="e.g. PARA-500" />
              </Field>
              <Field label="Active ingredient">
                <input name="ingredient" placeholder="e.g. Paracetamol" />
              </Field>
              <Field label="Category">
                <select name="category">
                  <option>MEDICATION</option>
                  <option>CONSUMABLE</option>
                  <option>RETAIL</option>
                </select>
              </Field>
              <Field label="Unit">
                <input name="unit" required defaultValue="tablet" />
              </Field>
              <Field label="Price (MYR)">
                <input name="price" type="number" required min="0" step="0.01" />
              </Field>
              <Field label="Reorder level">
                <input name="reorderLevel" type="number" min="0" defaultValue="10" required />
              </Field>
            </div>
          </MutationForm>
        </Panel>
      )}
      <div className="two-column">
        <Panel title="Stock catalogue">
          <ResourceState {...resource}>
            {resource.data?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Available</th>
                      <th>Reorder level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <small>
                            Item ID #{item.id} · {item.sku} · {item.unit}
                          </small>
                          {item.batches?.length ? (
                            <details>
                              <summary>View batches</summary>
                              {item.batches.map((batch) => (
                                <p className="form-help" key={batch.id}>
                                  {batch.batchNumber} · {batch.quantity} units · expiry{' '}
                                  {batch.expiresOn?.slice(0, 10)}
                                </p>
                              ))}
                            </details>
                          ) : (
                            <small>No batches received</small>
                          )}
                        </td>
                        <td>{item.stockQuantity ?? item.quantity ?? 0}</td>
                        <td>{item.reorderLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No inventory items"
                description="Add medicine catalogue items, then receive batches. Available quantities update after receiving or dispensing."
              />
            )}
          </ResourceState>
        </Panel>
        <div className="stack">
          <Panel title="Receive a stock batch">
            <MutationForm
              label="Receive stock"
              onSuccess={refresh}
              onSubmit={(f) =>
                api.post('/inventory/batches', {
                  itemId: Number(formText(f, 'itemId')),
                  batchNumber: formText(f, 'batchNumber'),
                  expiresOn: formText(f, 'expiresOn'),
                  quantity: Number(f.get('quantity')),
                })
              }
            >
              <Field label="Inventory item">
                <select name="itemId" required>
                  <option value="">Select item</option>
                  {resource.data?.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Batch number">
                  <input name="batchNumber" required placeholder="e.g. BATCH-2026-01" />
                </Field>
                <Field label="Expiry date">
                  <input name="expiresOn" type="date" required />
                </Field>
                <Field label="Quantity">
                  <input name="quantity" type="number" required min="1" />
                </Field>
              </div>
            </MutationForm>
          </Panel>
          <Panel title="Dispense a signed prescription">
            <ResourceState {...pending}>
              {pending.data?.length ? (
                <MutationForm
                  label="Dispense eligible batches"
                  onSuccess={() => {
                    refresh();
                    setEncounterId('');
                    setDispenseKey(crypto.randomUUID());
                  }}
                  onSubmit={() => {
                    if (!selected) throw new Error('Select a signed prescription first.');
                    return api.post('/dispenses', {
                      encounterId: selected.id,
                      idempotencyKey: dispenseKey,
                    });
                  }}
                >
                  <Field label="Signed GP prescription">
                    <select
                      required
                      value={encounterId}
                      onChange={(e) => {
                        setEncounterId(e.target.value);
                        setDispenseKey(crypto.randomUUID());
                      }}
                    >
                      <option value="">Select patient prescription</option>
                      {pending.data.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.patientName} · Patient ID #{e.patientId} · Prescription encounter #
                          {e.id} · {e.practitionerName} · {dateTime(e.createdAt)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selected && (
                    <div>
                      <h3>{selected.patientName}</h3>
                      <p className="form-help">
                        Patient ID #{selected.patientId} · {selected.nationalId} · GP{' '}
                        {selected.practitionerName}
                      </p>
                      <p className="allergies">
                        Allergies: {selected.allergies?.join(', ') || 'None recorded'}
                      </p>
                      {selected.prescriptions.map((rx, index) => (
                        <div className="list-row" key={`${rx.itemId}:${index}`}>
                          <strong>{rx.itemName}</strong>
                          <p>
                            {rx.quantity} units · {rx.frequencyPerDay || 1} times daily ·{' '}
                            {humanize(rx.mealTiming || 'ANY_TIME')} · {rx.durationDays} days
                          </p>
                          <p className="form-help">{rx.dosage}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="notice info">
                    <Status value="FEFO" />
                    Only unexpired batches with enough available stock are used.
                  </div>
                </MutationForm>
              ) : (
                <Empty
                  title="No signed prescriptions waiting"
                  description="A GP must save and sign a consultation containing medicines. Already dispensed prescriptions are excluded. Ask your administrator to create a GP account if none is available."
                />
              )}
            </ResourceState>
            <a href="#guide">Read the consultation and dispensing guide</a>
          </Panel>
        </div>
      </div>
    </>
  );
}
