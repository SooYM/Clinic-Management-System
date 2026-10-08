import { useEffect, useRef, useState } from 'react';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import type { CatalogEntry } from '../AdminCatalogs';
import PrescriptionLog from '../PrescriptionLog';
import { RefreshCw } from 'lucide-react';
import { api } from '../api';
import {
  Empty,
  ErrorNotice,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  ResourceState,
  Status,
  formText,
  useResource,
  useDebouncedValue,
  useRole,
} from '../components';
import { type InventoryItem, dateTime, humanize } from '../types';
import { useListControls } from '../ListControls';
function StockBatches({ item }: { item: InventoryItem }) {
  const list = useListControls(item.batches || [], {
    defaultSort: 'id',
    label: `${item.name} batches`,
    search: (row) => `${row.id} ${row.batchNumber}`,
    filters: [
      {
        key: 'expiry',
        label: 'Expiry type',
        value: (row) => (row.expiresOn ? 'DATED' : 'NO_EXPIRY'),
      },
    ],
    sorts: [
      { key: 'id', label: 'Batch ID', value: (row) => row.id },
      { key: 'expiry', label: 'Expiry date', value: (row) => row.expiresOn || '9999' },
      { key: 'batch', label: 'Batch number', value: (row) => row.batchNumber },
      { key: 'quantity', label: 'Quantity', value: (row) => row.quantity },
    ],
  });
  return (
    <details>
      <summary>View batches</summary>
      {list.controls}
      {list.items.map((batch) => (
        <p className="form-help" key={batch.id}>
          {batch.batchNumber} · {batch.quantity} units ·{' '}
          {batch.expiresOn ? `expiry ${batch.expiresOn.slice(0, 10)}` : 'No expiry'}
        </p>
      ))}
      {!list.items.length && <p className="form-help">No matching batches.</p>}
    </details>
  );
}
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
function PendingMedicines({
  prescriptions,
}: {
  prescriptions: PendingPrescription['prescriptions'];
}) {
  const list = useListControls(prescriptions, {
    defaultSort: 'id',
    label: 'Selected prescription medicines',
    search: (row) => `${row.itemName} ${row.dosage}`,
    filters: [{ key: 'meal', label: 'Meal timing', value: (row) => row.mealTiming || 'ANY_TIME' }],
    sorts: [
      { key: 'id', label: 'Item ID', value: (row) => row.itemId },
      { key: 'name', label: 'Medicine name', value: (row) => row.itemName },
      { key: 'quantity', label: 'Quantity', value: (row) => row.quantity },
      { key: 'frequency', label: 'Times per day', value: (row) => row.frequencyPerDay || 1 },
    ],
  });
  return (
    <>
      {list.controls}
      <p className="form-help">
        Filters change this view only. Dispensing uses the entire selected prescription.
      </p>
      {list.items.map((rx, index) => (
        <div className="list-row" key={`${rx.itemId}:${index}`}>
          <strong>{rx.itemName}</strong>
          <p>
            {rx.quantity} units · {rx.frequencyPerDay || 1} times daily ·{' '}
            {humanize(rx.mealTiming || 'ANY_TIME')} · {rx.durationDays} days
          </p>
          <p className="form-help">{rx.dosage}</p>
        </div>
      ))}
    </>
  );
}
export default function Inventory() {
  const role = useRole();
  const [showRemoved, setShowRemoved] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [section, setSection] = useState('stock');
  const editorRef = useRef<HTMLDivElement>(null);
  const units = useResource<CatalogEntry[]>('/references/catalogs?kind=INVENTORY_UNIT');
  const [editingItem, setEditingItem] = useState<InventoryItem>();
  const [itemCategory, setItemCategory] = useState('MEDICATION');
  const [create, setCreate] = useState(false);
  useEffect(() => {
    if (create || editingItem) editorRef.current?.scrollIntoView({ block: 'start' });
    setItemCategory(editingItem?.category || 'MEDICATION');
  }, [create, editingItem]);
  const [historySearch, setHistorySearch] = useState('');
  const [logEncounterId, setLogEncounterId] = useState('');
  const [logRevision, setLogRevision] = useState(0);
  const historyTerm = useDebouncedValue(historySearch.trim());
  const history = useResource<
    { id: number; patientName: string; patientId: number; dispensed: boolean }[]
  >(`/dispensary/history?search=${encodeURIComponent(historyTerm)}`);
  const [encounterId, setEncounterId] = useState('');
  const [prescriptionSearch, setPrescriptionSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [category, setCategory] = useState('');
  const [receivingItemId, setReceivingItemId] = useState('');
  const [usageKey, setUsageKey] = useState(crypto.randomUUID());
  const [usageRecorded, setUsageRecorded] = useState(false);
  const prescriptionTerm = useDebouncedValue(prescriptionSearch.trim());
  const inventoryTerm = useDebouncedValue(inventorySearch.trim());
  const resource = useResource<InventoryItem[]>(
    `/inventory?search=${encodeURIComponent(inventoryTerm)}${category ? `&category=${encodeURIComponent(category)}` : ''}`,
  );
  const pending = useResource<PendingPrescription[]>(
    `/dispensary/encounters?search=${encodeURIComponent(prescriptionTerm)}`,
  );
  const [dispenseKey, setDispenseKey] = useState(crypto.randomUUID());
  const selected = pending.data?.find((e) => e.id === Number(encounterId));
  const matchingPrescriptions = pending.data || [];
  const matchingItems = [...(resource.data || [])].sort((left, right) => left.id - right.id);
  const catalogItems = matchingItems.filter((item) => showRemoved || item.active !== false);
  const catalogList = useListControls(catalogItems, {
    defaultSort: 'id',
    label: 'Loaded stock catalogue',
    search: (row) => `${row.id} ${row.name} ${row.sku} ${row.ingredient || ''}`,
    filters: [
      {
        key: 'stock',
        label: 'Stock level',
        value: (row) =>
          (row.stockQuantity ?? row.quantity ?? 0) <= row.reorderLevel ? 'REORDER' : 'AVAILABLE',
      },
      {
        key: 'active',
        label: 'Item status',
        value: (row) => (row.active === false ? 'ARCHIVED' : 'ACTIVE'),
      },
    ],
    sorts: [
      { key: 'name', label: 'Item name', value: (row) => row.name },
      {
        key: 'available',
        label: 'Available quantity',
        value: (row) => row.stockQuantity ?? row.quantity ?? 0,
      },
      { key: 'id', label: 'Item ID', value: (row) => row.id },
    ],
  });
  const pendingList = useListControls(matchingPrescriptions, {
    defaultSort: 'id',
    label: 'Loaded pending prescriptions',
    search: (row) =>
      `${row.id} ${row.patientName} ${row.practitionerName} ${row.prescriptions.map((rx) => rx.itemName).join(' ')}`,
    filters: [{ key: 'gp', label: 'Prescribing GP', value: (row) => row.practitionerName }],
    sorts: [
      { key: 'date', label: 'Prescription date', value: (row) => row.createdAt },
      { key: 'patient', label: 'Patient name', value: (row) => row.patientName },
      { key: 'id', label: 'Encounter ID', value: (row) => row.id },
    ],
  });
  const historyList = useListControls(history.data || [], {
    defaultSort: 'id',
    label: 'Loaded prescription history',
    search: (row) => `${row.id} ${row.patientId} ${row.patientName}`,
    filters: [
      {
        key: 'dispensed',
        label: 'Dispensing status',
        value: (row) => (row.dispensed ? 'DISPENSED' : 'PENDING'),
      },
    ],
    sorts: [
      { key: 'id', label: 'Encounter ID', value: (row) => row.id },
      { key: 'patient', label: 'Patient name', value: (row) => row.patientName },
    ],
  });
  const receivingItem = resource.data?.find((item) => item.id === Number(receivingItemId));
  const optionalExpiry =
    receivingItem?.category === 'CONSUMABLE' || receivingItem?.category === 'RETAIL';
  const supplies = matchingItems
    .filter((item) => item.category === 'CONSUMABLE' || item.category === 'RETAIL')
    .sort((left, right) => left.id - right.id);
  function refresh() {
    setLogRevision((revision) => revision + 1);
    resource.refresh();
    pending.refresh();
    history.refresh();
  }
  return (
    <>
      <PageTitle
        title="Dispensary"
        description="Manage medicines, consumables and retail stock; dispense signed GP prescriptions by first expiry, first out."
        action={
          <div className="actions">
            <button className="secondary" onClick={refresh}>
              <RefreshCw size={16} />
              Refresh stock
            </button>
            {role === 'ADMIN' && (
              <button
                data-guide="open-inventory-item"
                onClick={() => {
                  setSection('stock');
                  setCreate(!create);
                  setEditingItem(undefined);
                }}
              >
                {create ? 'Close new item' : 'Add inventory item'}
              </button>
            )}
          </div>
        }
      />
      <WorkspaceSections label="Dispensary sections" value={section} onChange={setSection}>
        <WorkspaceSection
          id="stock"
          label="Stock catalogue"
          description="Review stock levels, medicine holds and inventory catalogue details."
        >
          <div ref={editorRef}>
            {' '}
            {(create || editingItem) && (
              <Panel title={editingItem ? 'Edit inventory item' : 'Inventory item'}>
                <MutationForm
                  key={editingItem ? `${editingItem.id}:${editingItem.version}` : 'new-item'}
                  label={editingItem ? 'Save inventory item' : 'Add item'}
                  onSuccess={() => {
                    refresh();
                    setCreate(false);
                    setEditingItem(undefined);
                  }}
                  onSubmit={(f) => {
                    const body = {
                      name: formText(f, 'name'),
                      sku: formText(f, 'sku'),
                      ingredient: formText(f, 'ingredient'),
                      category: formText(f, 'category'),
                      unit: formText(f, 'unit'),
                      priceCents: Math.round(Number(f.get('price')) * 100),
                      reorderLevel: Number(f.get('reorderLevel')),
                    };
                    return editingItem
                      ? api.put('/admin/inventory/' + editingItem.id, {
                          ...body,
                          active: f.get('active') === 'on',
                          version: editingItem.version,
                        })
                      : api.post('/inventory', body);
                  }}
                >
                  <div className="form-grid">
                    <Field label="Item name">
                      <input
                        name="name"
                        defaultValue={editingItem?.name}
                        required
                        placeholder="Medicine, gloves, lab coat or other item"
                      />
                    </Field>
                    <Field label="SKU">
                      <input
                        name="sku"
                        defaultValue={editingItem?.sku}
                        required
                        placeholder="e.g. PARA-500"
                      />
                    </Field>
                    <Field
                      label="Active ingredient"
                      hint={
                        itemCategory === 'MEDICATION'
                          ? 'Required for medicines.'
                          : 'Optional for supplies and retail items, such as lab coats.'
                      }
                    >
                      <input
                        name="ingredient"
                        defaultValue={editingItem?.ingredient}
                        required={itemCategory === 'MEDICATION'}
                        placeholder="e.g. Paracetamol"
                      />
                    </Field>
                    <Field label="Category">
                      <select
                        name="category"
                        value={itemCategory}
                        onChange={(event) => setItemCategory(event.target.value)}
                      >
                        <option value="MEDICATION">Medication</option>
                        <option value="CONSUMABLE">Consumables and supplies</option>
                        <option value="RETAIL">Retail products (e.g. lab coat)</option>
                      </select>
                    </Field>
                    <Field
                      label="Stock unit"
                      hint="How stock is counted, such as tablet, bottle or piece. Administrators manage these choices under Catalog choices → Inventory units."
                    >
                      <select name="unit" required defaultValue={editingItem?.unit || ''}>
                        <option value="">Select configured unit</option>
                        {editingItem?.unit &&
                          !units.data?.some((unit) => unit.label === editingItem.unit) && (
                            <option value={editingItem.unit}>{editingItem.unit} (recorded)</option>
                          )}
                        {units.data?.map((unit) => (
                          <option value={unit.label} key={unit.id}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                      {!units.data?.length && (
                        <small>
                          Add stock units in Administration → Catalog choices → Inventory units,
                          then return here.
                        </small>
                      )}
                    </Field>
                    <Field label="Price (MYR)">
                      <input
                        name="price"
                        defaultValue={editingItem ? (editingItem.priceCents || 0) / 100 : undefined}
                        type="number"
                        required
                        min="0"
                        step="0.01"
                      />
                    </Field>
                    <Field label="Reorder level">
                      <input
                        name="reorderLevel"
                        type="number"
                        min="0"
                        defaultValue={editingItem?.reorderLevel ?? 10}
                        required
                      />
                    </Field>
                  </div>
                  {editingItem && (
                    <>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={editingItem.active !== false}
                        />
                        Active in new catalog choices
                      </label>
                      <p className="form-help">
                        Archiving preserves stock and historical prescriptions. Category, ingredient
                        and unit cannot change after stock or prescribing history.
                      </p>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setEditingItem(undefined)}
                      >
                        Cancel editing
                      </button>
                    </>
                  )}
                </MutationForm>
              </Panel>
            )}
          </div>
          <Panel title="Stock catalogue">
            <p className="form-help">
              Removal hides future choices; existing records stay preserved. Show removed items to
              restore them. Available excludes signed-prescription reservations and ineligible
              expired stock. Signing reserves stock; dispensing deducts physical quantities once.
              Unexpired stock includes non-expiring supplies.
            </p>
            <div className="form-grid">
              <Field label="Search inventory">
                <input
                  type="search"
                  placeholder="Item name, SKU, ingredient or category"
                  value={inventorySearch}
                  onChange={(event) => setInventorySearch(event.target.value)}
                />
              </Field>
              <Field label="Inventory category">
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">All categories</option>
                  <option value="MEDICATION">Medication</option>
                  <option value="CONSUMABLE">Consumables and supplies</option>
                  <option value="RETAIL">Retail products</option>
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showRemoved}
                onChange={(event) => setShowRemoved(event.target.checked)}
              />
              Show removed inventory items
            </label>
            {catalogError && <ErrorNotice>{catalogError}</ErrorNotice>}
            {catalogList.controls}
            <ResourceState {...resource}>
              {catalogList.items.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Available</th>
                        <th>Unexpired stock</th>
                        <th>Reserved</th>
                        <th>Reorder level</th>
                        <th>Status</th>
                        {role === 'ADMIN' && <th>Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {catalogList.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.name}</strong>
                            <small>
                              Item ID #{item.id} · {item.sku} · {item.unit}
                            </small>
                            {item.batches?.length ? (
                              <StockBatches item={item} />
                            ) : (
                              <small>No batches received</small>
                            )}
                          </td>
                          <td>{humanize(item.category || 'MEDICATION')}</td>
                          <td>{item.stockQuantity ?? item.quantity ?? 0}</td>
                          <td>{item.onHandQuantity ?? '—'}</td>
                          <td>{item.reservedQuantity ?? '—'}</td>
                          <td>{item.reorderLevel}</td>
                          <td>
                            <Status value={item.active === false ? 'ARCHIVED' : 'ACTIVE'} />
                          </td>
                          {role === 'ADMIN' && (
                            <td>
                              <button
                                className="secondary"
                                onClick={() => {
                                  setSection('stock');
                                  setEditingItem(item);
                                  setCreate(false);
                                }}
                              >
                                Edit item
                              </button>
                              <button
                                className="secondary"
                                onClick={async () => {
                                  try {
                                    setCatalogError('');
                                    await api.put('/admin/inventory/' + item.id, {
                                      name: item.name,
                                      sku: item.sku,
                                      ingredient: item.ingredient || '',
                                      category: item.category || 'MEDICATION',
                                      unit: item.unit,
                                      priceCents: item.priceCents || 0,
                                      reorderLevel: item.reorderLevel,
                                      active: item.active === false,
                                      version: item.version,
                                    });
                                    if (editingItem?.id === item.id) setEditingItem(undefined);
                                    refresh();
                                  } catch (failure) {
                                    setCatalogError((failure as Error).message);
                                  }
                                }}
                              >
                                {item.active === false ? 'Restore' : 'Remove'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title={
                    catalogItems.length || inventoryTerm || category
                      ? 'No matching inventory items'
                      : 'No inventory items'
                  }
                  description={
                    catalogItems.length || inventoryTerm || category
                      ? 'Clear filters, try another search or choose All categories.'
                      : 'Add medicines, consumables or retail products, then receive batches. Available quantities update after receiving, reservation or dispensing.'
                  }
                />
              )}
            </ResourceState>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="receive"
          label="Receive stock"
          description="Record delivered batches and their expiry dates."
        >
          <Panel title="Receive a stock batch">
            <MutationForm
              label="Receive stock"
              onSuccess={refresh}
              onSubmit={(f) =>
                api.post('/inventory/batches', {
                  itemId: Number(formText(f, 'itemId')),
                  batchNumber: formText(f, 'batchNumber'),
                  expiresOn: formText(f, 'expiresOn') || null,
                  quantity: Number(f.get('quantity')),
                })
              }
            >
              <Field label="Inventory item">
                <select
                  name="itemId"
                  required
                  value={receivingItemId}
                  onChange={(event) => setReceivingItemId(event.target.value)}
                >
                  <option value="">Select item</option>
                  {matchingItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {humanize(i.category || 'MEDICATION')}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Batch number">
                  <input name="batchNumber" required placeholder="e.g. BATCH-2026-01" />
                </Field>
                <Field
                  label="Expiry date"
                  hint={
                    optionalExpiry
                      ? 'Optional for supplies and retail products. Leave blank when the item has no expiry.'
                      : 'Medicines require an expiry date after today.'
                  }
                >
                  <input name="expiresOn" type="date" required={!optionalExpiry} />
                </Field>
                <Field label="Quantity">
                  <input name="quantity" type="number" required min="1" />
                </Field>
              </div>
            </MutationForm>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="supplies"
          label="Use supplies"
          description="Record non-medication stock issued or used by clinic staff."
        >
          <Panel title="Use supplies and retail stock">
            {usageRecorded && (
              <p className="notice success" role="status">
                Supply usage recorded. Stock has been refreshed.
              </p>
            )}
            <p className="form-help">
              Record physical usage or issue of consumables and retail items, such as gloves or a
              lab coat. Medicines require signed-prescription dispensing.
            </p>
            {supplies.length ? (
              <MutationForm
                key={usageKey}
                label="Record supply usage"
                onSuccess={() => {
                  refresh();
                  setUsageRecorded(true);
                  setUsageKey(crypto.randomUUID());
                }}
                onSubmit={(form) =>
                  api.post('/inventory/usage', {
                    itemId: Number(formText(form, 'itemId')),
                    quantity: Number(form.get('quantity')),
                    reason: formText(form, 'reason'),
                    idempotencyKey: usageKey,
                  })
                }
              >
                <Field label="Supply / retail item">
                  <select name="itemId" required>
                    <option value="">Choose non-medication item</option>
                    {supplies.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.unit} · Available {item.stockQuantity ?? 0}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity used">
                  <input name="quantity" type="number" min="1" step="1" required />
                </Field>
                <Field label="Usage reason">
                  <input
                    name="reason"
                    maxLength={500}
                    placeholder="e.g. Gloves used during procedure, lab coat issued"
                    required
                  />
                </Field>
              </MutationForm>
            ) : (
              <p className="form-help">
                No consumable or retail items match the current catalog filters. Choose All
                categories, search for an item, or add one above.
              </p>
            )}
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="dispense"
          label="Dispense medicines"
          description="Review and complete signed GP prescriptions."
        >
          <Panel title="Dispense a signed prescription">
            <Field
              label="Search prescription list"
              hint="Search patient, IC/passport, GP, encounter ID or medicine name."
            >
              <input
                type="search"
                placeholder="Patient or medicine"
                value={prescriptionSearch}
                onChange={(event) => {
                  setPrescriptionSearch(event.target.value);
                  setEncounterId('');
                  setDispenseKey(crypto.randomUUID());
                }}
              />
            </Field>
            <ResourceState {...pending}>
              {pendingList.controls}
              {pendingList.items.map((row) => (
                <div className="list-row" key={row.id}>
                  <strong>{row.patientName}</strong>
                  <p className="form-help">
                    Encounter #{row.id} · {row.practitionerName} · {dateTime(row.createdAt)}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setEncounterId(String(row.id));
                      setDispenseKey(crypto.randomUUID());
                    }}
                  >
                    Review prescription
                  </button>
                </div>
              ))}
              {!!pending.data?.length && !pendingList.items.length && (
                <p className="form-help">
                  No pending prescriptions match these filters. Clear filters to review all loaded
                  records.
                </p>
              )}
              {pending.data?.length ? (
                <MutationForm
                  label="Dispense eligible batches"
                  onSuccess={() => {
                    setLogEncounterId(encounterId);
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
                  {!matchingPrescriptions.length && (
                    <p className="form-help" role="status">
                      No prescriptions match this search. Clear or change the search to see pending
                      work.
                    </p>
                  )}
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
                      {matchingPrescriptions.map((e) => (
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
                      <PendingMedicines key={selected.id} prescriptions={selected.prescriptions} />
                    </div>
                  )}
                  <div className="notice info">
                    <Status value="FEFO" />
                    Signed prescriptions use reserved stock. Older unreserved prescriptions use
                    eligible FEFO batches. Physical stock is deducted once when dispensed.
                  </div>
                </MutationForm>
              ) : (
                <Empty
                  title={
                    prescriptionTerm
                      ? 'No matching prescriptions'
                      : 'No signed prescriptions waiting'
                  }
                  description={
                    prescriptionTerm
                      ? 'Clear or change the search to find pending signed prescriptions.'
                      : 'A GP must save and sign a consultation containing medicines. Already dispensed prescriptions are excluded. Ask your administrator to create a GP account if none is available.'
                  }
                />
              )}
            </ResourceState>
            <a href="#guide">Read the consultation and dispensing guide</a>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="history"
          label="Prescription history"
          description="Find pending or completed prescriptions and their clinic activity."
        >
          <Panel title="Prescription history and activity">
            <Field
              label="Search prescription history"
              hint="Find pending or completed prescriptions by patient, GP or encounter ID."
            >
              <input
                type="search"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Patient, GP or encounter ID"
              />
            </Field>
            <ResourceState {...history}>
              {historyList.controls}
              {historyList.items.map((row) => (
                <div className="list-row" key={row.id}>
                  <strong>{row.patientName}</strong>
                  <p className="form-help">
                    Patient #{row.patientId} · Encounter #{row.id} ·{' '}
                    {row.dispensed ? 'Dispensed' : 'Pending'}
                  </p>
                  <button className="secondary" onClick={() => setLogEncounterId(String(row.id))}>
                    View activity
                  </button>
                </div>
              ))}
              {!!history.data?.length && !historyList.items.length && (
                <p className="form-help">No prescription history matches these filters.</p>
              )}
              {history.data?.length ? (
                <Field label="Prescription activity record">
                  <select
                    value={logEncounterId}
                    onChange={(event) => setLogEncounterId(event.target.value)}
                  >
                    <option value="">Select pending or completed prescription</option>
                    {history.data.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.patientName} · Patient #{e.patientId} · Encounter #{e.id} ·{' '}
                        {e.dispensed ? 'Dispensed' : 'Pending'}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Empty
                  title="No matching prescription history"
                  description="Signed medicine prescriptions appear here, including completed dispensing."
                />
              )}
            </ResourceState>
            {logEncounterId && (
              <PrescriptionLog
                key={`${logEncounterId}:${logRevision}`}
                encounterId={Number(logEncounterId)}
              />
            )}
          </Panel>
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
