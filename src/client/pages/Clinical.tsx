import { useEffect, useRef, useState } from 'react';
import { api, isDemo } from '../api';
import { SearchBox } from '../SearchBox';
import {
  Empty,
  ErrorNotice,
  Field,
  Loading,
  MutationForm,
  PageTitle,
  Panel,
  formText,
  useResource,
  useRole,
  useDebouncedValue,
} from '../components';
import { type Patient, type InventoryItem, dateTime, humanize, money } from '../types';
import type { CatalogEntry } from '../AdminCatalogs';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
import ClinicalDocuments from './ClinicalDocuments';
import DocumentPreview from '../DocumentPreview';
import PrescriptionLog from '../PrescriptionLog';
import DetailDialog from '../DetailDialog';
import MedicationDoseLog from '../MedicationDoseLog';
import { defaultMcStartDate } from '../../shared/clinic-dates';
import { parseBloodPressure } from '../../shared/blood-pressure';
import { useListControls } from '../ListControls';
import { useConfirm } from '../Confirmation';
interface QueueSuggestion {
  queueTicketId: number;
  patientId: number;
  patientName: string;
  ticketNumber: string;
  roomName: string | null;
  status: string;
  expiresAt: string;
  encounterId: number | null;
}
interface Encounter {
  id: number;
  patientId: number;
  practitionerId: number;
  patientName: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: string;
  createdAt: string;
  version: number;
  specialty: string;
  queueTicketId?: number;
  procedureNotes: string;
  vitals: Record<string, string | number>;
  consultationFeeCents?: number | null;
  procedureFeeCents?: number | null;
  consumables?: { itemId: number; itemName?: string; quantity: number; reason: string }[];
  prescriptions: {
    itemId: number;
    itemName?: string;
    ingredient?: string;
    unit?: string;
    quantity: number;
    quantityPerDose?: number;
    form?: 'PILL' | 'PASTE' | 'SYRUP' | 'OTHER';
    instructions?: string;
    unitPriceCents?: number;
    indication?: string;
    dosage: string;
    durationDays: number;
    frequencyPerDay?: number;
    mealTiming?: string;
  }[];
}
interface Document {
  id: number;
  documentNumber: string;
  kind: string;
  status: string;
  verificationUrl?: string;
}
type HistoryEncounter = Pick<
  Encounter,
  | 'id'
  | 'patientId'
  | 'practitionerId'
  | 'assessment'
  | 'specialty'
  | 'status'
  | 'createdAt'
  | 'version'
> & { practitionerName?: string };
interface HistoryPage {
  data: HistoryEncounter[];
  nextCursor: { before: string; beforeId: number } | null;
}
function ConsultationHistory({
  patientId,
  practitionerId,
  deletingId,
  onDelete,
  onOpen,
}: {
  patientId: number;
  practitionerId: number;
  deletingId?: number;
  onDelete: (encounter: HistoryEncounter) => Promise<void>;
  onOpen: (encounter: Encounter) => void;
}) {
  const role = useRole();
  const [rows, setRows] = useState<HistoryEncounter[]>([]);
  const [cursor, setCursor] = useState<HistoryPage['nextCursor']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const list = useListControls(rows, {
    label: 'Loaded patient consultations',
    search: (row) => `${row.id} ${row.assessment} ${row.specialty} ${row.practitionerName || ''}`,
    filters: [{ key: 'status', label: 'Consultation status', value: (row) => row.status }],
    sorts: [
      { key: 'date', label: 'Consultation date', value: (row) => row.createdAt },
      { key: 'id', label: 'Encounter ID', value: (row) => row.id },
    ],
  });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .getPage<HistoryPage>(`/patients/${patientId}/encounters`)
      .then((page) => {
        if (active) {
          setRows(page.data);
          setCursor(page.nextCursor);
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [patientId, revision]);
  async function older() {
    if (!cursor) return;
    setLoading(true);
    setError('');
    try {
      const page = await api.getPage<HistoryPage>(
        `/patients/${patientId}/encounters?before=${encodeURIComponent(cursor.before)}&beforeId=${cursor.beforeId}`,
      );
      setRows((existing) => [...existing, ...page.data]);
      setCursor(page.nextCursor);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function open(id: number) {
    setLoading(true);
    setError('');
    try {
      const encounter = await api.get<Encounter>(`/encounters/${id}`);
      if (mounted.current) onOpen(encounter);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <details className="consultation-history-controls">
        <summary>Search, filter &amp; sort history</summary>
        {list.controls}
      </details>
      {error && (
        <>
          <ErrorNotice>{error}</ErrorNotice>
          <button className="secondary" onClick={() => setRevision((value) => value + 1)}>
            Reload history
          </button>
        </>
      )}
      {loading && <Loading />}
      {!!list.items.length && (
        <div
          className="consultation-history-list"
          role="list"
          aria-label="Patient consultation records"
        >
          {list.items.map((row) => {
            const assessment = (row.assessment || '').replace(/\s+/g, ' ').trim();
            return (
              <div className="consultation-history-row" role="listitem" key={row.id}>
                <div className="consultation-history-summary">
                  <strong>
                    {assessment.length > 140
                      ? `${assessment.slice(0, 137)}…`
                      : assessment || 'Consultation'}
                  </strong>
                  <p>
                    #{row.id} · {dateTime(row.createdAt)} · {row.specialty} · {humanize(row.status)}
                    {row.practitionerName && ` · GP: ${row.practitionerName}`}
                  </p>
                </div>
                <div className="consultation-history-actions">
                  <button
                    className="secondary"
                    disabled={loading || deletingId !== undefined}
                    onClick={() => void open(row.id)}
                  >
                    Open consultation
                  </button>
                  {role === 'DOCTOR' &&
                    row.status === 'DRAFT' &&
                    row.practitionerId === practitionerId && (
                      <button
                        className="text-button"
                        disabled={loading || deletingId !== undefined}
                        onClick={() => void onDelete(row)}
                      >
                        {deletingId === row.id ? 'Deleting…' : 'Delete draft'}
                      </button>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !error && !rows.length && (
        <Empty
          title="No consultations yet"
          description="Use New consultation to record this visit."
        />
      )}
      {!loading && !error && !!rows.length && !list.items.length && (
        <p className="form-help" role="status">
          No consultations match the history filters.
        </p>
      )}
      {cursor && (
        <button className="secondary" disabled={loading} onClick={() => void older()}>
          Load older consultations
        </button>
      )}
    </>
  );
}
function MedicinePicker({
  name,
  onSelectionChange,
  excludedIds,
}: {
  name: string;
  excludedIds: number[];
  onSelectionChange: (selected?: InventoryItem) => void;
}) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const resource = useResource<InventoryItem[]>(
    '/references/medications?search=' + encodeURIComponent(term),
    15000,
  );
  const [selected, setSelected] = useState<InventoryItem>();
  const choices = (resource.data || []).filter(
    (item) => item.active !== false && !excludedIds.includes(item.id),
  );
  const visibleSelection = choices.find((item) => item.id === selected?.id);
  const selectedStock = useResource<InventoryItem[]>(
    selected && !visibleSelection
      ? '/references/medications?search=' + encodeURIComponent(selected.name)
      : '',
    15000,
  );
  const currentSelection =
    visibleSelection || selectedStock.data?.find((item) => item.id === selected?.id);
  const stockError = visibleSelection ? resource.error : selectedStock.error;
  const options =
    selected && !visibleSelection ? [currentSelection || selected, ...choices] : choices;
  return (
    <>
      <Field label="Search drug catalog">
        <SearchBox
          ariaLabel="Search drug catalog"
          value={search}
          onChange={setSearch}
          suggestions={choices.map((item) => ({
            id: item.id,
            label: item.name,
            description: `Item #${item.id} · ${item.sku} · ${item.stockQuantity ?? 0} ${item.unit} available`,
          }))}
          onSelect={(suggestion) => {
            const medicine = choices.find((item) => item.id === suggestion.id);
            if (!medicine) return;
            setSelected(medicine);
            onSelectionChange(medicine);
            setSearch(medicine.name);
          }}
          loading={search.trim() !== term || resource.refreshing}
          error={resource.error}
          filterSuggestions={false}
          placeholder="Medicine, SKU or ingredient"
          emptyMessage="No active medicines match. Change the search or ask an administrator to add the medicine."
        />
      </Field>
      <Field label="Medicine">
        <select
          name={name}
          value={selected?.id || ''}
          onChange={(event) => {
            const medicine = options.find((item) => item.id === Number(event.target.value));
            setSelected(medicine);
            onSelectionChange(medicine);
          }}
        >
          <option value="">No additional medication</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {!resource.error && typeof item.stockQuantity === 'number'
                ? ` · ${item.stockQuantity} ${item.unit} available`
                : ''}
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <p className="form-help" role="status">
          {stockError || typeof currentSelection?.stockQuantity !== 'number'
            ? 'Current stock unavailable. Refresh medicines before signing.'
            : `${currentSelection.stockQuantity} ${currentSelection.unit} available · ${currentSelection.reservedQuantity ?? 0} reserved · ${currentSelection.onHandQuantity ?? 0} eligible in stock. Stock refreshes automatically; signing checks and reserves it.`}
        </p>
      )}
      {resource.loading && (
        <p className="form-help" role="status">
          Loading medicines…
        </p>
      )}
      {resource.error && <ErrorNotice>{resource.error}</ErrorNotice>}
      {!resource.loading && !resource.error && !choices.length && (
        <p className="form-help">
          No active medicines match. Change the search or ask an administrator to add or reactivate
          a medication.
        </p>
      )}
    </>
  );
}
function PrescriptionRow({
  rowId,
  number,
  onRemove,
  excludedIds,
  onSelectionChange,
}: {
  rowId: number;
  number: number;
  excludedIds: number[];
  onSelectionChange: (itemId?: number) => void;
  onRemove: (hasMedicine: boolean) => void;
}) {
  const [medicine, setMedicine] = useState<InventoryItem>();
  const hasMedicine = !!medicine;
  const [dose, setDose] = useState(1);
  const [days, setDays] = useState(1);
  const [frequency, setFrequency] = useState(1);
  const [form, setForm] = useState('PILL');
  const [supply, setSupply] = useState(1);
  const [price, setPrice] = useState(0);
  const quantity = form === 'PILL' ? dose * days * frequency : supply;
  const prefix = `prescription-${rowId}-`;
  return (
    <fieldset className="prescription-row" data-prescription-row={rowId}>
      <legend>Prescription {number}</legend>
      <input type="hidden" name="prescriptionRow" value={rowId} />
      <MedicinePicker
        name={`${prefix}itemId`}
        excludedIds={excludedIds}
        onSelectionChange={(item) => {
          setMedicine(item);
          setPrice((item?.priceCents || 0) / 100);
          onSelectionChange(item?.id);
        }}
      />
      <div className="form-grid">
        <Field label="Medicine form">
          <select
            name={`${prefix}form`}
            value={form}
            onChange={(event) => setForm(event.target.value)}
            disabled={!hasMedicine}
          >
            <option value="PILL">Pill</option>
            <option value="PASTE">Paste</option>
            <option value="SYRUP">Syrup</option>
            <option value="OTHER">Others</option>
          </select>
        </Field>
        <Field
          label="Quantity per serving"
          hint={
            form === 'PILL'
              ? 'Pills per serving. Total supply = serving × times daily × days.'
              : 'Dose in mL, grams or another unit. Specify the unit in instructions.'
          }
        >
          <input
            name={`${prefix}quantityPerDose`}
            onChange={(event) => setDose(Number(event.target.value))}
            type="number"
            min={form === 'PILL' ? '1' : '0.001'}
            step={form === 'PILL' ? '1' : '0.001'}
            defaultValue="1"
            required={hasMedicine}
            disabled={!hasMedicine}
          />
        </Field>
        <Field label="Supply (days)">
          <input
            name={`${prefix}durationDays`}
            onChange={(event) => setDays(Number(event.target.value))}
            type="number"
            min="1"
            max="365"
            step="1"
            defaultValue="1"
            required={hasMedicine}
            disabled={!hasMedicine}
          />
        </Field>
        <Field label="Frequency (times per day)">
          <input
            name={`${prefix}frequencyPerDay`}
            onChange={(event) => setFrequency(Number(event.target.value))}
            type="number"
            min="1"
            max="24"
            step="1"
            defaultValue="1"
            required={hasMedicine}
            disabled={!hasMedicine}
          />
        </Field>
        <Field label="Meal timing">
          <select name={`${prefix}mealTiming`} disabled={!hasMedicine}>
            <option value="AFTER_MEAL">After meal</option>
            <option value="BEFORE_MEAL">Before meal</option>
            <option value="ANY_TIME">Any time</option>
          </select>
        </Field>
        {form !== 'PILL' && (
          <Field
            label={`Total supply (${medicine?.unit || 'stock units'})`}
            hint="Whole bottles, tubes or stock units to dispense. Separate from quantity per serving."
          >
            <input
              name={`${prefix}quantity`}
              type="number"
              min="1"
              step="1"
              defaultValue="1"
              required={hasMedicine}
              disabled={!hasMedicine}
              onChange={(event) => setSupply(Number(event.target.value))}
            />
          </Field>
        )}
        <Field
          label="Medication unit price (MYR)"
          hint="GP decides final price per stock unit. Defaults to inventory list price."
        >
          <input
            name={`${prefix}unitPrice`}
            type="number"
            min="0"
            max="20000000"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(Number(event.target.value))}
            required={hasMedicine}
            disabled={!hasMedicine}
          />
        </Field>
      </div>
      {hasMedicine && (
        <p className="form-help" role="status">
          Total supply: {quantity} {medicine?.unit || 'units'}. Medication fee:{' '}
          {money((quantity * Math.round(price * 100)) / 100)}.
        </p>
      )}
      <Field label="Medicine purpose (optional)">
        <input
          name={`${prefix}indication`}
          placeholder="e.g. headache, fever"
          maxLength={500}
          disabled={!hasMedicine}
        />
      </Field>
      <Field
        label="Dosage instructions"
        hint="For paste, syrup and other forms, include dose unit, route and application instructions."
      >
        <input
          name={`${prefix}dosage`}
          placeholder="Dose, frequency, and route"
          required={hasMedicine && form !== 'PILL'}
          disabled={!hasMedicine}
          maxLength={200}
        />
      </Field>
      <button type="button" className="text-button" onClick={() => onRemove(hasMedicine)}>
        Remove prescription row {number}
      </button>
    </fieldset>
  );
}
function PrescriptionRows({
  recordedIds,
  disabled,
  onDirty,
}: {
  recordedIds: number[];
  disabled: boolean;
  onDirty: () => void;
}) {
  const recordedCount = recordedIds.length;
  const [rows, setRows] = useState(recordedCount < 50 ? [1] : []);
  const [selections, setSelections] = useState<Record<number, number | undefined>>({});
  const nextId = useRef(2);
  const confirm = useConfirm();
  async function remove(rowId: number, hasMedicine: boolean) {
    if (
      hasMedicine &&
      !(await confirm({
        title: 'Remove prescription row?',
        message:
          'This unsaved medicine and its instructions will be removed from this consultation draft.',
        confirmLabel: 'Remove row',
      }))
    )
      return;
    setRows((current) => current.filter((id) => id !== rowId));
    setSelections((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    onDirty();
  }
  return (
    <fieldset className="prescription-rows" disabled={disabled}>
      <legend>Additional medicines</legend>
      <p className="form-help">
        One row per medicine. Selected medicines are excluded from other rows. Blank rows are
        skipped when saving.
      </p>
      {rows.map((rowId, index) => (
        <PrescriptionRow
          key={rowId}
          rowId={rowId}
          number={index + 1}
          excludedIds={[
            ...recordedIds,
            ...Object.entries(selections)
              .filter(([id]) => Number(id) !== rowId)
              .flatMap(([, id]) => (id ? [id] : [])),
          ]}
          onSelectionChange={(itemId) =>
            setSelections((current) => ({ ...current, [rowId]: itemId }))
          }
          onRemove={(hasMedicine) => void remove(rowId, hasMedicine)}
        />
      ))}
      <button
        type="button"
        className="secondary"
        disabled={recordedCount + rows.length >= 50}
        onClick={() => {
          const rowId = nextId.current++;
          setRows((current) => [...current, rowId]);
          onDirty();
        }}
      >
        Add prescription
      </button>
      {recordedCount + rows.length >= 50 && (
        <p className="form-help">A consultation supports up to 50 medicines.</p>
      )}
    </fieldset>
  );
}
function ConsumableSupply({
  initial = [],
  onDirty,
}: {
  initial?: Encounter['consumables'];
  onDirty: () => void;
}) {
  const stock = useResource<InventoryItem[]>('/references/consumables', 15000);
  const [rows, setRows] = useState(() =>
    initial.map((item, index) => ({ ...item, rowId: index + 1 })),
  );
  const nextId = useRef(initial.length + 1);
  return (
    <fieldset>
      <legend>Minor surgery &amp; consumable supply</legend>
      <p className="form-help">
        Record procedure details above and supplies used below. Signing deducts consumables from
        stock once.
      </p>
      {stock.error && <ErrorNotice>{stock.error}</ErrorNotice>}
      {rows.map((row, index) => (
        <fieldset key={row.rowId}>
          <legend>Supply {index + 1}</legend>
          <input type="hidden" name="consumableRow" value={row.rowId} />
          <div className="form-grid">
            <Field label="Consumable">
              <select
                name={`consumable-${row.rowId}-itemId`}
                value={row.itemId || ''}
                required
                onChange={(event) =>
                  setRows((current) =>
                    current.map((value) =>
                      value.rowId === row.rowId
                        ? { ...value, itemId: Number(event.target.value) }
                        : value,
                    ),
                  )
                }
              >
                <option value="">Choose supply</option>
                {!!row.itemId && !stock.data?.some((item) => item.id === row.itemId) && (
                  <option value={row.itemId}>{row.itemName || `Supply #${row.itemId}`}</option>
                )}
                {stock.data
                  ?.filter(
                    (item) =>
                      item.id === row.itemId || !rows.some((value) => value.itemId === item.id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.stockQuantity ?? item.quantity ?? 0} {item.unit} available
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Quantity used">
              <input
                name={`consumable-${row.rowId}-quantity`}
                type="number"
                min="1"
                step="1"
                required
                defaultValue={row.quantity}
              />
            </Field>
            <Field label="Purpose / procedure">
              <input
                name={`consumable-${row.rowId}-reason`}
                required
                maxLength={500}
                defaultValue={row.reason}
              />
            </Field>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRows((current) => current.filter((value) => value.rowId !== row.rowId));
              onDirty();
            }}
          >
            Remove supply
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={stock.loading || !!stock.error || !stock.data?.length || rows.length >= 50}
        onClick={() => {
          setRows((current) => [
            ...current,
            { rowId: nextId.current++, itemId: 0, quantity: 1, reason: '' },
          ]);
          onDirty();
        }}
      >
        Add consumable supply
      </button>
      {!stock.loading && !stock.error && !stock.data?.length && (
        <p className="form-help">
          No consumables configured. Add consumable items and receive stock in Inventory.
        </p>
      )}
    </fieldset>
  );
}
function CheckoutTotal({
  prescriptions,
  readOnly,
  consultationFeeCents = 0,
  procedureFeeCents = 0,
}: {
  prescriptions: Encounter['prescriptions'];
  readOnly: boolean;
  consultationFeeCents?: number | null;
  procedureFeeCents?: number | null;
}) {
  const summary = useRef<HTMLParagraphElement>(null);
  const [total, setTotal] = useState(0);
  const [medication, setMedication] = useState(0);
  useEffect(() => {
    const form = summary.current?.closest('form');
    if (!form) return;
    function update() {
      if (readOnly) {
        const medicationCents = prescriptions.reduce(
          (sum, rx) => sum + rx.quantity * (rx.unitPriceCents || 0),
          0,
        );
        setMedication(medicationCents);
        setTotal(medicationCents + (consultationFeeCents || 0) + (procedureFeeCents || 0));
        return;
      }
      const values = new FormData(form!);
      let medicationCents = prescriptions.reduce(
        (sum, rx) =>
          sum + rx.quantity * Math.round(Number(values.get(`recorded-price-${rx.itemId}`)) * 100),
        0,
      );
      for (const rowId of values.getAll('prescriptionRow')) {
        const prefix = `prescription-${rowId}-`;
        if (!Number(values.get(`${prefix}itemId`))) continue;
        const quantity =
          values.get(`${prefix}form`) === 'PILL'
            ? Number(values.get(`${prefix}quantityPerDose`)) *
              Number(values.get(`${prefix}frequencyPerDay`)) *
              Number(values.get(`${prefix}durationDays`))
            : Number(values.get(`${prefix}quantity`));
        medicationCents += quantity * Math.round(Number(values.get(`${prefix}unitPrice`)) * 100);
      }
      setMedication(medicationCents);
      setTotal(
        medicationCents +
          Math.round(Number(values.get('consultationFee')) * 100) +
          Math.round(Number(values.get('procedureFee')) * 100),
      );
    }
    update();
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(form, { childList: true, subtree: true });
    return () => {
      form.removeEventListener('input', update);
      form.removeEventListener('change', update);
      observer.disconnect();
    };
  }, [prescriptions, readOnly, consultationFeeCents, procedureFeeCents]);
  return (
    <p className="form-help" ref={summary} role="status">
      Medication fee: {money(medication / 100)} · Checkout total: {money(total / 100)}.
      {readOnly ? ' Recorded GP prices.' : ' Signing approves these itemized prices.'}
    </p>
  );
}
function McLeaveStart() {
  const [initialDate] = useState(() => defaultMcStartDate());
  return (
    <Field
      label="Leave starts"
      hint="New MCs default to today before 5 pm Malaysia time, or tomorrow from 5 pm. Review and change when needed."
    >
      <input type="date" name="startDate" required defaultValue={initialDate} />
    </Field>
  );
}
function BloodPressureField({ initial }: { initial?: string | number }) {
  const [value, setValue] = useState(String(initial ?? ''));
  let error = '',
    unusual = false;
  try {
    unusual = parseBloodPressure(value)?.unusual || false;
  } catch (failure) {
    error = (failure as Error).message;
  }
  return (
    <Field
      label="Blood pressure"
      hint="SYS/DIA in mmHg. Enter the measured reading; no clinical range limit applies."
    >
      <input
        name="bloodPressure"
        placeholder="e.g. 120/80"
        value={value}
        aria-invalid={!!error}
        aria-describedby={
          error ? 'blood-pressure-error' : unusual ? 'blood-pressure-warning' : undefined
        }
        onChange={(event) => {
          setValue(event.target.value);
          try {
            parseBloodPressure(event.target.value);
            event.currentTarget.setCustomValidity('');
          } catch (failure) {
            event.currentTarget.setCustomValidity((failure as Error).message);
          }
        }}
      />
      {error && (
        <small id="blood-pressure-error" role="alert">
          {error}
        </small>
      )}
      {unusual && (
        <small id="blood-pressure-warning" role="status">
          Unusual SYS/DIA relationship or outside common monitor operating ranges (SYS 60–260, DIA
          40–215). Verify this reading; you can still record it. These are not diagnostic ranges.
        </small>
      )}
    </Field>
  );
}
export default function Clinical({ practitionerId }: { practitionerId: number }) {
  const role = useRole();
  const confirm = useConfirm();
  const assignedPatients = useResource<QueueSuggestion[]>(
    role === 'DOCTOR' ? '/clinical/queue-suggestions' : '',
    15000,
  );
  const [section, setSection] = useState('consultations');
  const [patientSearch, setPatientSearch] = useState('');
  const patientTerm = useDebouncedValue(patientSearch.trim());
  const patients = useResource<Patient[]>(
    `/references/patients?search=${encodeURIComponent(patientTerm)}`,
  );
  const items = useResource<InventoryItem[]>('/references/medications?includeInactive=1', 15000);
  const labPanels = useResource<CatalogEntry[]>('/references/catalogs?kind=LAB_PANEL');
  const specimenTypes = useResource<CatalogEntry[]>('/references/catalogs?kind=SPECIMEN_TYPE');
  const destinations = useResource<CatalogEntry[]>(
    '/references/catalogs?kind=REFERRAL_DESTINATION',
  );
  const [selected, setSelected] = useState<Encounter>();
  const [previewEncounter, setPreviewEncounter] = useState<Encounter>();
  const activeEncounterId = useRef(selected?.id);
  activeEncounterId.current = selected?.id;
  const [deletingId, setDeletingId] = useState<number>();
  const [deletionError, setDeletionError] = useState('');
  const [deletionSuccess, setDeletionSuccess] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient>();
  const [assignedQueue, setAssignedQueue] = useState<QueueSuggestion>();
  const [openingSuggestion, setOpeningSuggestion] = useState<number>();
  const [suggestionError, setSuggestionError] = useState('');
  const suggestionRequest = useRef(0);
  const noteDirty = useRef(false);
  const selectedPatientId = chosenPatient?.id;
  const activePatientId = useRef(selectedPatientId);
  activePatientId.current = selectedPatientId;
  const [historyRevision, setHistoryRevision] = useState(0);
  const [medicationRevision, setMedicationRevision] = useState(0);
  const [openingRecord, setOpeningRecord] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [documentKind, setDocumentKind] = useState('MC');
  const [doc, setDoc] = useState<Document>();
  const [error, setError] = useState('');
  const [prescriptionSearch, setPrescriptionSearch] = useState('');
  const patientResource = useResource<Patient>(
    selectedPatientId ? `/clinical/patients/${selectedPatientId}` : '',
  );
  const patient = patientResource.data?.id === selectedPatientId ? patientResource.data : undefined;
  const patientChoices = [
    ...(chosenPatient && !(patients.data || []).some((row) => row.id === chosenPatient.id)
      ? [chosenPatient, ...(patients.data || [])]
      : patients.data || []),
  ].sort((a, b) => a.id - b.id);
  async function choosePatient(next?: Patient) {
    const request = ++suggestionRequest.current;
    setOpeningSuggestion(undefined);
    setChosenPatient(next);
    setPreviewEncounter(undefined);
    setAssignedQueue(undefined);
    setSelected(undefined);
    setDoc(undefined);
    setPrescriptionSearch('');
    setSection('consultations');
    noteDirty.current = false;
    setRecordError('');
    setOpeningRecord(false);
    if (!next) return;
    setOpeningRecord(true);
    try {
      const history = await api.getPage<HistoryPage>(`/patients/${next.id}/encounters`);
      const latest = history.data[0];
      const encounter = latest ? await api.get<Encounter>(`/encounters/${latest.id}`) : undefined;
      if (request === suggestionRequest.current) setSelected(encounter);
    } catch (failure) {
      if (request === suggestionRequest.current) setRecordError((failure as Error).message);
    } finally {
      if (request === suggestionRequest.current) setOpeningRecord(false);
    }
  }
  async function keepOrDiscardNote() {
    if (!noteDirty.current) return true;
    return confirm({
      title: 'Discard unsaved consultation changes?',
      message:
        'Changing the patient or consultation will discard your unsaved note and prescription changes.',
      confirmLabel: 'Discard changes',
    });
  }
  async function deleteDraft(
    encounter: Pick<Encounter, 'id' | 'patientId' | 'practitionerId' | 'status' | 'version'>,
  ) {
    if (
      deletingId !== undefined ||
      role !== 'DOCTOR' ||
      encounter.status !== 'DRAFT' ||
      encounter.practitionerId !== practitionerId
    )
      return;
    if (
      !(await confirm({
        title: `Delete draft consultation #${encounter.id}?`,
        message: `This draft will be removed from the patient's active history. Signed consultations cannot be deleted.${activeEncounterId.current === encounter.id && noteDirty.current ? ' Unsaved note and prescription changes will also be discarded.' : ''}`,
        confirmLabel: 'Delete draft',
      }))
    )
      return;
    setDeletingId(encounter.id);
    setDeletionError('');
    setDeletionSuccess('');
    try {
      await api.request(`/encounters/${encounter.id}`, 'DELETE', { version: encounter.version });
      if (activeEncounterId.current === encounter.id) {
        suggestionRequest.current++;
        noteDirty.current = false;
        setSelected(undefined);
        setDoc(undefined);
        setAssignedQueue(undefined);
        setPrescriptionSearch('');
        setSection('consultations');
      }
      setHistoryRevision((value) => value + 1);
      assignedPatients.refresh();
      setDeletionSuccess(`Draft consultation #${encounter.id} deleted.`);
    } catch (failure) {
      setDeletionError((failure as Error).message);
    } finally {
      setDeletingId(undefined);
    }
  }
  async function openSuggestion(suggestion: QueueSuggestion) {
    if (
      selectedPatientId === suggestion.patientId &&
      (assignedQueue?.queueTicketId === suggestion.queueTicketId ||
        selected?.id === suggestion.encounterId)
    ) {
      setSection(selected ? 'notes' : 'create');
      return;
    }
    if (!(await keepOrDiscardNote())) return;
    const request = ++suggestionRequest.current;
    setOpeningSuggestion(suggestion.queueTicketId);
    setOpeningRecord(false);
    setSuggestionError('');
    try {
      if (new Date(suggestion.expiresAt).getTime() <= Date.now()) {
        throw new Error('This queue assignment has expired. Refresh assigned patients.');
      }
      const [nextPatient, encounter] = await Promise.all([
        api.get<Patient>(`/clinical/patients/${suggestion.patientId}`),
        suggestion.encounterId
          ? api.get<Encounter>(`/encounters/${suggestion.encounterId}`)
          : Promise.resolve(undefined),
      ]);
      if (request !== suggestionRequest.current) return;
      if (encounter && encounter.patientId !== suggestion.patientId) {
        throw new Error(
          'The consultation no longer matches this patient. Refresh assigned patients.',
        );
      }
      setChosenPatient(nextPatient);
      setSelected(encounter);
      setAssignedQueue(encounter ? undefined : suggestion);
      setDoc(undefined);
      setPrescriptionSearch('');
      setSection(encounter ? 'notes' : 'create');
      noteDirty.current = false;
    } catch (failure) {
      if (request === suggestionRequest.current) setSuggestionError((failure as Error).message);
      assignedPatients.refresh();
    } finally {
      if (request === suggestionRequest.current) setOpeningSuggestion(undefined);
    }
  }
  const searchedPrescriptions = (selected?.prescriptions || []).filter((rx) =>
    `${rx.itemName || items.data?.find((item) => item.id === rx.itemId)?.name || rx.itemId} ${rx.dosage}`
      .toLowerCase()
      .includes(prescriptionSearch.trim().toLowerCase()),
  );
  const prescriptionList = useListControls(searchedPrescriptions, {
    label: 'Recorded medicines',
    search: (rx) =>
      `${rx.itemName || items.data?.find((item) => item.id === rx.itemId)?.name || rx.itemId} ${rx.dosage}`,
    filters: [{ key: 'meal', label: 'Meal timing', value: (rx) => rx.mealTiming || 'ANY_TIME' }],
    sorts: [
      {
        key: 'medicine',
        label: 'Medicine name',
        value: (rx) =>
          rx.itemName ||
          items.data?.find((item) => item.id === rx.itemId)?.name ||
          String(rx.itemId),
      },
      { key: 'quantity', label: 'Quantity', value: (rx) => rx.quantity },
      { key: 'frequency', label: 'Times per day', value: (rx) => rx.frequencyPerDay || 1 },
    ],
  });
  const matchingRecordedPrescriptions = prescriptionList.items;
  const consultationForm = (
    <div
      onChange={(event) => {
        const target = event.target;
        if (
          role === 'DOCTOR' &&
          selected?.status !== 'SIGNED' &&
          (target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement ||
            target instanceof HTMLTextAreaElement) &&
          target.name
        ) {
          noteDirty.current = true;
        }
      }}
    >
      <Panel
        title={selected ? 'Consultation note' : 'New consultation'}
        action={
          selected?.status === 'DRAFT' &&
          role === 'DOCTOR' &&
          selected.practitionerId === practitionerId ? (
            <button
              type="button"
              className="text-button"
              disabled={deletingId !== undefined}
              onClick={() => void deleteDraft(selected)}
            >
              {deletingId === selected.id ? 'Deleting…' : 'Delete draft'}
            </button>
          ) : undefined
        }
      >
        <MutationForm
          key={
            selected
              ? `${selected.id}:${selected.version}`
              : `new:${selectedPatientId}:${assignedQueue?.queueTicketId || 'manual'}`
          }
          label={selected ? 'Save consultation' : 'Create consultation'}
          disabled={
            selected?.status === 'SIGNED' ||
            role !== 'DOCTOR' ||
            (!!selected && selected.practitionerId !== practitionerId)
          }
          disabledReason={
            role !== 'DOCTOR'
              ? 'Only a GP account can create, edit, or sign clinical notes. You can review recorded consultations.'
              : selected && selected.practitionerId !== practitionerId
                ? 'Only the attending GP can edit this consultation.'
                : undefined
          }
          onSuccess={() => {
            setHistoryRevision((value) => value + 1);
            assignedPatients.refresh();
          }}
          onSubmit={async (f) => {
            const saveContext = suggestionRequest.current;
            if (selected?.status === 'SIGNED')
              throw new Error('Signed encounters cannot be edited.');
            if (
              !selected &&
              assignedQueue &&
              new Date(assignedQueue.expiresAt).getTime() <= Date.now()
            ) {
              assignedPatients.refresh();
              throw new Error(
                'This queue assignment has expired. Refresh and select an active assignment before saving.',
              );
            }
            const additionalPrescriptions = f.getAll('prescriptionRow').flatMap((rowId) => {
              const prefix = `prescription-${rowId}-`;
              const itemId = Number(formText(f, `${prefix}itemId`));
              if (!itemId) return [];
              const quantityPerDose = Number(f.get(`${prefix}quantityPerDose`));
              const durationDays = Number(f.get(`${prefix}durationDays`));
              const frequencyPerDay = Number(f.get(`${prefix}frequencyPerDay`));
              const mealTiming = formText(f, `${prefix}mealTiming`);
              const form = formText(f, `${prefix}form`) as 'PILL' | 'PASTE' | 'SYRUP' | 'OTHER';
              const instructions =
                formText(f, `${prefix}dosage`) ||
                `${quantityPerDose} per serving; ${frequencyPerDay} times daily; ${humanize(mealTiming)}; ${durationDays} days`;
              return [
                {
                  itemId,
                  quantity:
                    form === 'PILL'
                      ? quantityPerDose * frequencyPerDay * durationDays
                      : Number(f.get(`${prefix}quantity`)),
                  form,
                  instructions,
                  unitPriceCents: Math.round(Number(f.get(`${prefix}unitPrice`)) * 100),
                  quantityPerDose,
                  indication: formText(f, `${prefix}indication`),
                  durationDays,
                  frequencyPerDay,
                  mealTiming,
                  dosage: instructions,
                },
              ];
            });
            parseBloodPressure(formText(f, 'bloodPressure'));
            const body = {
              patientId: selected?.patientId || selectedPatientId,
              specialty: selected?.specialty || formText(f, 'specialty'),
              queueTicketId:
                selected?.queueTicketId ||
                (assignedQueue && assignedQueue.patientId === selectedPatientId
                  ? assignedQueue.queueTicketId
                  : undefined),
              subjective: formText(f, 'subjective'),
              objective: formText(f, 'objective'),
              assessment: formText(f, 'assessment'),
              plan: formText(f, 'plan'),
              procedureNotes: formText(f, 'procedureNotes'),
              consultationFeeCents: Math.round(Number(f.get('consultationFee')) * 100),
              procedureFeeCents: Math.round(Number(f.get('procedureFee')) * 100),
              consumables: f.getAll('consumableRow').map((rowId) => ({
                itemId: Number(f.get(`consumable-${rowId}-itemId`)),
                quantity: Number(f.get(`consumable-${rowId}-quantity`)),
                reason: formText(f, `consumable-${rowId}-reason`),
              })),
              status: formText(f, 'status'),
              version: selected?.version,
              vitals: {
                ...selected?.vitals,
                bloodPressure: formText(f, 'bloodPressure'),
                temperature: formText(f, 'temperature'),
              },
              prescriptions: [
                ...(selected?.prescriptions || []).map((rx) => ({
                  ...rx,
                  unitPriceCents: Math.round(Number(f.get(`recorded-price-${rx.itemId}`)) * 100),
                })),
                ...additionalPrescriptions,
              ],
            };
            const saved = selected
              ? await api.put<Encounter>(`/encounters/${selected.id}`, body)
              : await api.post<Encounter>('/encounters', body);
            if (
              activePatientId.current !== saved.patientId ||
              suggestionRequest.current !== saveContext
            )
              return;
            noteDirty.current = false;
            setAssignedQueue(undefined);
            setSelected(saved);
            setSection('notes');
          }}
        >
          <fieldset
            className="consultation-fields"
            disabled={
              selected?.status === 'SIGNED' ||
              role !== 'DOCTOR' ||
              (!!selected && selected.practitionerId !== practitionerId)
            }
          >
            {!selected && (
              <p className="form-help">
                New consultation for {chosenPatient?.name} · Patient ID #{selectedPatientId}
                {assignedQueue &&
                  ` · Queue ${assignedQueue.ticketNumber} · ${assignedQueue.roomName || 'Assigned room'}`}
              </p>
            )}
            <div className="form-grid">
              <Field label="Consultation template">
                <select name="specialty" defaultValue={selected?.specialty || 'GP'}>
                  <option>GP</option>
                  <option>DENTAL</option>
                  <option>AESTHETIC</option>
                </select>
              </Field>
              <Field
                label="Note status"
                hint="Signing reserves medicines and sends this patient to dispensary, or directly to billing when no medicines are prescribed."
              >
                <select name="status" defaultValue={selected?.status || 'DRAFT'}>
                  <option value="DRAFT">Draft · keep editing</option>
                  <option value="SIGNED">Signed · complete consultation</option>
                </select>
              </Field>
              <BloodPressureField initial={selected?.vitals?.bloodPressure} />
              <Field
                label="Temperature (°C)"
                hint="Enter the measured reading; no clinical range limit applies."
              >
                <input
                  name="temperature"
                  type="number"
                  step="any"
                  defaultValue={selected?.vitals?.temperature}
                />
              </Field>
            </div>
            <div className="soap-grid">
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map((key, i) => (
                <Field
                  key={key}
                  label={`${['S', 'O', 'A', 'P'][i]} · ${key[0].toUpperCase() + key.slice(1)}`}
                >
                  <textarea name={key} rows={3} required defaultValue={selected?.[key]} />
                </Field>
              ))}
            </div>
            <Field
              label="Minor surgery / procedure notes"
              hint="Record procedure, consent, findings, treatment and aftercare when applicable."
            >
              <textarea name="procedureNotes" rows={4} defaultValue={selected?.procedureNotes} />
            </Field>
            <ConsumableSupply
              initial={selected?.consumables}
              onDirty={() => {
                noteDirty.current = true;
              }}
            />
            <fieldset>
              <legend>GP checkout pricing</legend>
              <p className="form-help">
                Set final consultation, procedure and itemized medication fees before signing.
                Checkout uses these approved prices.
              </p>
              <div className="form-grid">
                <Field label="Consultation fee (MYR)">
                  <input
                    name="consultationFee"
                    type="number"
                    min="0"
                    max="20000000"
                    step="0.01"
                    required
                    defaultValue={(selected?.consultationFeeCents || 0) / 100}
                  />
                </Field>
                <Field label="Procedure fee (MYR)">
                  <input
                    name="procedureFee"
                    type="number"
                    min="0"
                    max="20000000"
                    step="0.01"
                    required
                    defaultValue={(selected?.procedureFeeCents || 0) / 100}
                  />
                </Field>
              </div>
            </fieldset>
            <fieldset>
              <legend>Prescriptions</legend>
              {!!selected?.prescriptions?.length && prescriptionList.controls}
              {!!selected?.prescriptions?.length && (
                <Field label="Search recorded prescriptions">
                  <SearchBox
                    ariaLabel="Search recorded prescriptions"
                    value={prescriptionSearch}
                    onChange={setPrescriptionSearch}
                    suggestions={(selected?.prescriptions || []).map((rx, index) => ({
                      id: index,
                      label:
                        rx.itemName ||
                        items.data?.find((item) => item.id === rx.itemId)?.name ||
                        `Item #${rx.itemId}`,
                      description: rx.dosage,
                    }))}
                    onSelect={(suggestion) => setPrescriptionSearch(suggestion.label)}
                    placeholder="Medicine or dosage instructions"
                    emptyMessage="No recorded medicines match."
                  />
                </Field>
              )}
              {!!prescriptionSearch && !matchingRecordedPrescriptions.length && (
                <p className="form-help" role="status">
                  No recorded medicines match this search. The saved prescription remains unchanged.
                </p>
              )}
              {[
                ...matchingRecordedPrescriptions,
                ...(selected?.prescriptions || []).filter(
                  (rx) => !matchingRecordedPrescriptions.includes(rx),
                ),
              ].map((rx) => {
                const medicine = items.data?.find((item) => item.id === rx.itemId);
                return (
                  <div
                    key={rx.itemId}
                    className="list-row"
                    hidden={!matchingRecordedPrescriptions.includes(rx)}
                  >
                    <p className="form-help">
                      Existing: {rx.itemName || medicine?.name || rx.itemId} · {rx.quantity} units
                      total · {rx.quantityPerDose && `${rx.quantityPerDose} per serving · `}
                      {rx.indication && `For ${rx.indication} · `}
                      {rx.frequencyPerDay || 1} times daily ·{' '}
                      {humanize(rx.mealTiming || 'ANY_TIME')} · {rx.dosage} · {rx.durationDays} days
                      <br />
                      {items.error || typeof medicine?.stockQuantity !== 'number'
                        ? 'Live stock unavailable. Refresh before prescribing.'
                        : `Live stock: ${medicine.stockQuantity} ${medicine.unit} available · ${medicine.reservedQuantity ?? 0} reserved · ${medicine.onHandQuantity ?? 0} eligible in stock.`}
                    </p>
                    <Field
                      label={`${rx.itemName || medicine?.name || rx.itemId}: unit price (MYR)`}
                      hint={`${humanize(rx.form || 'PILL')} · ${rx.quantity} ${rx.unit || medicine?.unit || 'units'} total`}
                    >
                      <input
                        name={`recorded-price-${rx.itemId}`}
                        type="number"
                        min="0"
                        max="20000000"
                        step="0.01"
                        required
                        defaultValue={(rx.unitPriceCents ?? medicine?.priceCents ?? 0) / 100}
                      />
                    </Field>
                  </div>
                );
              })}
              <PrescriptionRows
                recordedIds={(selected?.prescriptions || []).map((rx) => rx.itemId)}
                disabled={selected?.status === 'SIGNED' || role !== 'DOCTOR'}
                onDirty={() => {
                  noteDirty.current = true;
                }}
              />
              <p className="form-help">
                Allergy conflicts prevent saving a prescription. Signing sends prescribed medicines
                to the dispensary; dispensing uses the earliest eligible expiry.
              </p>
            </fieldset>
            <CheckoutTotal
              prescriptions={selected?.prescriptions || []}
              readOnly={
                selected?.status === 'SIGNED' ||
                role !== 'DOCTOR' ||
                (!!selected && selected.practitionerId !== practitionerId)
              }
              consultationFeeCents={selected?.consultationFeeCents}
              procedureFeeCents={selected?.procedureFeeCents}
            />
          </fieldset>
        </MutationForm>
        {selected?.status === 'SIGNED' && !!selected.prescriptions.length && (
          <p className="form-help">
            Signing reserves medicines and sends this consultation to Dispensary → Dispense
            medicines. Available stock excludes medicines reserved for patients.
          </p>
        )}
      </Panel>
    </div>
  );
  return (
    <>
      <PageTitle title="Clinical workspace" />
      {deletionError && <ErrorNotice>{deletionError}</ErrorNotice>}
      {deletionSuccess && (
        <p className="notice success" role="status">
          {deletionSuccess}
        </p>
      )}
      {role === 'DOCTOR' && (
        <Panel
          title="Assigned patients"
          action={
            <button className="text-button" onClick={assignedPatients.refresh}>
              Refresh assignments
            </button>
          }
        >
          <p className="form-help">
            Patients called to your consultation room appear here. Select one to prepare a note;
            assignments update automatically. Nothing is saved until you confirm.
          </p>
          {!!assignedPatients.data?.length && (
            <p className="form-help" role="status" aria-live="polite">
              {assignedPatients.data.length}{' '}
              {assignedPatients.data.length === 1 ? 'patient ready' : 'patients ready'} for
              consultation.
            </p>
          )}
          {assignedPatients.loading && <Loading />}
          {assignedPatients.error && <ErrorNotice>{assignedPatients.error}</ErrorNotice>}
          {suggestionError && <ErrorNotice>{suggestionError}</ErrorNotice>}
          {!assignedPatients.loading &&
            !assignedPatients.error &&
            !assignedPatients.data?.length && (
              <p className="form-help">
                No patients are currently assigned to you. You can still choose a patient below.
              </p>
            )}
          {assignedPatients.data?.map((suggestion) => (
            <div className="list-row assigned-patient-row" key={suggestion.queueTicketId}>
              <div>
                <strong>{suggestion.patientName}</strong>
                <p>
                  Patient ID #{suggestion.patientId} · Queue {suggestion.ticketNumber} ·{' '}
                  {suggestion.roomName || 'Assigned room'} · {humanize(suggestion.status)}
                </p>
              </div>
              <button
                className="secondary"
                disabled={openingSuggestion !== undefined}
                onClick={() => void openSuggestion(suggestion)}
              >
                {openingSuggestion === suggestion.queueTicketId
                  ? 'Opening…'
                  : suggestion.encounterId
                    ? 'Open consultation'
                    : 'Start consultation'}
              </button>
            </div>
          ))}
        </Panel>
      )}
      <Panel title="Choose patient">
        <div className="form-grid">
          <Field
            label="Search patient"
            hint="Search name, IC, passport or phone. Then select a patient."
          >
            <SearchBox
              ariaLabel="Search patient"
              value={patientSearch}
              onChange={setPatientSearch}
              suggestions={(patients.data || []).map((row) => ({
                id: row.id,
                label: row.name,
                description: `Patient #${row.id} · ${row.nationalId} · ${row.phone || ''}`,
              }))}
              onSelect={async (suggestion) => {
                const nextPatient = patients.data?.find((row) => row.id === suggestion.id);
                if (nextPatient && (await keepOrDiscardNote())) choosePatient(nextPatient);
                else setPatientSearch(patientSearch);
              }}
              loading={patientSearch.trim() !== patientTerm || patients.refreshing}
              error={patients.error}
              filterSuggestions={false}
              placeholder="Name, IC, passport or phone"
              emptyMessage="No matching patient. Change the search or register the patient first."
            />
          </Field>
          <Field label="Patient">
            <select
              value={selectedPatientId || ''}
              onChange={async (event) => {
                const nextPatient = patientChoices.find(
                  (row) => row.id === Number(event.target.value),
                );
                if (await keepOrDiscardNote()) choosePatient(nextPatient);
              }}
            >
              <option value="">
                {patients.loading ? 'Searching patients…' : 'Select patient'}
              </option>
              {patientChoices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · Patient ID #{row.id} · {row.nationalId}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {patients.error && <ErrorNotice>{patients.error}</ErrorNotice>}
        {!patients.loading && !patients.error && !patientChoices.length && (
          <p className="form-help">
            No matching patient. Change the search or register the patient first.
          </p>
        )}
        <p className="form-help">
          Select a patient to view their history or start a new consultation.
        </p>
      </Panel>
      {chosenPatient && (
        <div className="patient-banner">
          <div>
            <h2>{patient?.name || chosenPatient.name}</h2>
            <p>
              Patient ID #{selectedPatientId} · {patient?.nationalId || chosenPatient.nationalId} ·{' '}
              {patient?.bloodGroup || 'Blood group unknown'}
            </p>
          </div>
          <span className="allergies">
            Allergies:{' '}
            {patient
              ? patient.allergies?.join(', ') || 'None recorded'
              : patientResource.error
                ? 'Unable to load — review patient chart'
                : 'Loading patient record…'}
          </span>
        </div>
      )}
      {openingRecord && <Loading />}
      {recordError && <ErrorNotice>{recordError}</ErrorNotice>}
      {selected && (
        <p className="form-help">
          Viewing consultation #{selected.id} · {dateTime(selected.createdAt)}. Choose another
          record in Patient history.
        </p>
      )}
      <WorkspaceSections
        label="Clinical workspace sections"
        value={section}
        onChange={async (next) => {
          if (next === 'create') {
            if (selected && !(await keepOrDiscardNote())) return;
            if (selected) {
              suggestionRequest.current++;
              setAssignedQueue(undefined);
            }
            setSelected(undefined);
            setDoc(undefined);
            if (selected) noteDirty.current = false;
          }
          setSection(next);
        }}
      >
        <WorkspaceSection
          id="consultations"
          label="Patient history"
          description="Review consultations for the selected patient. Open a record to use its tools."
        >
          {!selectedPatientId && (
            <Empty
              title="Choose a patient first"
              description="Their history, notes, documents and medication records will become available."
            />
          )}
          {selectedPatientId && (
            <Panel title="Patient consultation history">
              <p className="form-help">
                Patient #{selectedPatientId}. Other sections show the latest consultation by
                default. Open any record below to review an earlier visit.
              </p>
              <ConsultationHistory
                key={`${selectedPatientId}:${historyRevision}`}
                patientId={selectedPatientId}
                practitionerId={practitionerId}
                deletingId={deletingId}
                onDelete={deleteDraft}
                onOpen={(encounter) => setPreviewEncounter(encounter)}
              />
            </Panel>
          )}
        </WorkspaceSection>
        <WorkspaceSection
          id="create"
          label="New consultation"
          disabled={role !== 'DOCTOR' || !selectedPatientId || openingRecord}
          description="Create a separate consultation for the selected patient. Save before opening its record tools."
        >
          {role === 'DOCTOR' && !selected && selectedPatientId && consultationForm}
        </WorkspaceSection>
        <WorkspaceSection
          id="notes"
          disabled={!selectedPatientId || openingRecord}
          label="Notes & prescription"
        >
          {selected ? (
            consultationForm
          ) : (
            <Panel title="Notes & prescription">
              <Empty
                title="No consultation recorded"
                description="This patient has no saved notes or prescriptions. A GP can start a new consultation."
              />
            </Panel>
          )}
        </WorkspaceSection>
        <WorkspaceSection
          id="documents"
          disabled={!selectedPatientId || openingRecord}
          label="Documents"
        >
          <Panel title="Clinical documents">
            {selected && role === 'DOCTOR' ? (
              <>
                {isDemo && (
                  <p className="form-help">
                    Browser demo: issuance creates a simulated record only. PDFs and clinical
                    signatures are unavailable.
                  </p>
                )}
                <div className="segmented">
                  {['MC', 'REFERRAL', 'LAB'].map((k) => (
                    <button
                      key={k}
                      className={documentKind === k ? 'active' : ''}
                      onClick={() => {
                        setDocumentKind(k);
                        setDoc(undefined);
                      }}
                    >
                      {k === 'MC' ? 'Medical certificate' : k === 'LAB' ? 'Lab order' : 'Referral'}
                    </button>
                  ))}
                </div>
                <MutationForm
                  key={`${selected.id}:${documentKind}`}
                  label="Issue document"
                  disabled={
                    selected.status !== 'SIGNED' || selected.practitionerId !== practitionerId
                  }
                  disabledReason={
                    selected.status !== 'SIGNED'
                      ? 'Sign this consultation first, then issue the document.'
                      : 'Only this consultation’s attending GP can issue its documents. Sign in with that GP account.'
                  }
                  onSubmit={async (f) => {
                    setError('');
                    const issued = await api.post<Document>('/documents', {
                      encounterId: selected.id,
                      kind: documentKind,
                      employer: formText(f, 'employer') || undefined,
                      startDate: formText(f, 'startDate') || undefined,
                      days: Number(f.get('days')) || undefined,
                      diagnosisRedacted: f.get('diagnosisRedacted') === 'on',
                      lightDuty: f.get('lightDuty') === 'on',
                      target: formText(f, 'target') || undefined,
                      urgency: formText(f, 'urgency') || undefined,
                      reason: formText(f, 'reason') || undefined,
                      panels: f.getAll('panels').map((value) => String(value)),
                      specimenType: formText(f, 'specimenType') || undefined,
                      fastingRequired: f.get('fastingRequired') === 'on',
                      clinicalNotes: formText(f, 'clinicalNotes'),
                    });
                    setDoc(issued);
                  }}
                >
                  {documentKind === 'MC' ? (
                    <>
                      <McLeaveStart />
                      <Field label="Employer / department (optional)">
                        <input name="employer" maxLength={200} />
                      </Field>
                      <div className="actions">
                        {[1, 2, 3].map((days) => (
                          <button
                            type="button"
                            className="secondary"
                            key={days}
                            onClick={(event) => {
                              const input = event.currentTarget
                                .closest('form')
                                ?.querySelector<HTMLInputElement>('input[name=days]');
                              if (input) input.value = String(days);
                            }}
                          >
                            {days} {days === 1 ? 'day' : 'days'}
                          </button>
                        ))}
                      </div>
                      <Field label="Leave duration (days)">
                        <input
                          type="number"
                          name="days"
                          min="1"
                          max="365"
                          defaultValue="1"
                          required
                        />
                      </Field>
                      <label className="checkbox">
                        <input name="diagnosisRedacted" type="checkbox" defaultChecked />
                        Hide diagnosis from employer
                      </label>
                      <label className="checkbox">
                        <input name="lightDuty" type="checkbox" />
                        Light duty only
                      </label>
                    </>
                  ) : documentKind === 'REFERRAL' ? (
                    <>
                      <Field label="Hospital / specialty">
                        <select name="target" required>
                          <option value="">Select configured destination</option>
                          {destinations.data?.map((destination) => (
                            <option key={destination.id} value={destination.label}>
                              {destination.label}
                            </option>
                          ))}
                        </select>
                        {!destinations.data?.length && (
                          <small>
                            Ask an administrator to add referral destinations in Clinical and
                            inventory choices.
                          </small>
                        )}
                      </Field>
                      <Field label="Urgency">
                        <select name="urgency">
                          <option>ROUTINE</option>
                          <option>SEMI_URGENT</option>
                          <option>URGENT_SAME_DAY</option>
                          <option>EMERGENCY</option>
                        </select>
                      </Field>
                      <Field label="Referral reason">
                        <textarea name="reason" required />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Panels" hint="Select one or more configured investigations.">
                        <select
                          name="panels"
                          multiple
                          required
                          size={Math.min(Math.max(labPanels.data?.length || 3, 3), 6)}
                          aria-label="Lab investigation panels"
                        >
                          {labPanels.data?.map((panel) => (
                            <option key={panel.id} value={panel.label}>
                              {panel.label}
                            </option>
                          ))}
                        </select>
                        {!labPanels.data?.length && (
                          <small>
                            Ask an administrator to add lab investigation panels in Clinical and
                            inventory choices.
                          </small>
                        )}
                      </Field>
                      <Field label="Specimen type">
                        <select name="specimenType" required>
                          <option value="">Select configured specimen</option>
                          {specimenTypes.data?.map((specimen) => (
                            <option key={specimen.id} value={specimen.label}>
                              {specimen.label}
                            </option>
                          ))}
                        </select>
                        {!specimenTypes.data?.length && (
                          <small>Ask an administrator to add specimen types.</small>
                        )}
                      </Field>
                      <label className="checkbox">
                        <input name="fastingRequired" type="checkbox" />
                        Fasting required
                      </label>
                      <Field label="Collection instructions">
                        <textarea name="clinicalNotes" />
                      </Field>
                    </>
                  )}
                </MutationForm>
                {doc && <DocumentPreview key={doc.id} documentId={doc.id} />}
                {error && <ErrorNotice>{error}</ErrorNotice>}
              </>
            ) : (
              <Empty
                title={selected ? 'Issued documents' : 'No consultation recorded'}
                description={
                  selected
                    ? 'Review issued documents below. Only the attending GP can issue new documents.'
                    : 'Documents appear after a GP saves a consultation.'
                }
              />
            )}
          </Panel>

          {selected && (
            <>
              <ClinicalDocuments
                key={`documents:${selected.id}:${doc?.id ?? 'none'}`}
                encounterId={selected.id}
                onRevoked={(id) => {
                  if (doc?.id === id) setDoc(undefined);
                }}
              />
            </>
          )}
        </WorkspaceSection>
        <WorkspaceSection
          id="logs"
          disabled={!selectedPatientId || openingRecord}
          label="Medication logs"
        >
          {selected ? (
            <>
              {(role === 'DOCTOR' || role === 'NURSE') && (
                <MedicationDoseLog
                  key={`${selected.id}:${selected.version}`}
                  formOnly
                  onRecorded={() => setMedicationRevision((value) => value + 1)}
                  encounterId={selected.id}
                  signed={selected.status === 'SIGNED'}
                  medicines={Array.from(
                    new Map(
                      selected.prescriptions.map((rx) => {
                        const item = items.data?.find((i) => i.id === rx.itemId);
                        return [
                          rx.itemId,
                          {
                            id: rx.itemId,
                            name: rx.itemName || item?.name || `Medicine #${rx.itemId}`,
                            unit: rx.unit || item?.unit || 'unit',
                          },
                        ] as const;
                      }),
                    ).values(),
                  )}
                />
              )}
              <Panel title="Medication timeline">
                <PrescriptionLog
                  key={`${selected.id}:${selected.version}`}
                  encounterId={selected.id}
                  includeDoses
                  revision={medicationRevision}
                />
              </Panel>
            </>
          ) : (
            <Panel title="Medication logs">
              <Empty
                title="No medication activity"
                description="Medication records appear after a GP saves a consultation with prescriptions."
              />
            </Panel>
          )}
        </WorkspaceSection>
      </WorkspaceSections>
      <DetailDialog
        open={!!previewEncounter}
        title={`Consultation #${previewEncounter?.id || ''}`}
        onClose={() => setPreviewEncounter(undefined)}
      >
        {previewEncounter && (
          <>
            <p>
              {dateTime(previewEncounter.createdAt)} · {humanize(previewEncounter.status)}
            </p>
            <dl className="detail-grid">
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map((key) => (
                <div key={key}>
                  <dt>{humanize(key)}</dt>
                  <dd>{previewEncounter[key] || 'Not recorded'}</dd>
                </div>
              ))}
              <div>
                <dt>Procedure notes</dt>
                <dd>{previewEncounter.procedureNotes || 'None recorded'}</dd>
              </div>
            </dl>
            <h3>Prescribed medicines</h3>
            {previewEncounter.prescriptions.length ? (
              previewEncounter.prescriptions.map((rx, index) => (
                <p key={index}>
                  <strong>{rx.itemName || `Medicine #${rx.itemId}`}</strong> · {rx.quantity} units
                  total{rx.quantityPerDose && ` · ${rx.quantityPerDose} per serving`}
                  {rx.indication && ` · For ${rx.indication}`}
                  <br />
                  {rx.dosage}
                </p>
              ))
            ) : (
              <p>No medicines prescribed.</p>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!(await keepOrDiscardNote())) return;
                suggestionRequest.current++;
                setOpeningRecord(false);
                noteDirty.current = false;
                setAssignedQueue(undefined);
                setSelected(previewEncounter);
                setPreviewEncounter(undefined);
                setSection('notes');
                setDoc(undefined);
                setPrescriptionSearch('');
              }}
            >
              Open record tools
            </button>
          </>
        )}
      </DetailDialog>
    </>
  );
}
