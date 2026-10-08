import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import { AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { api } from './api';
import { useConfirm } from './Confirmation';
import { humanize, type Patient, type Reference } from './types';
export const RoleContext = createContext('');
export const ModuleContext = createContext<string[]>([]);
const guideKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export function useModules() {
  return useContext(ModuleContext);
}
export function useRole() {
  return useContext(RoleContext);
}
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const loaded = useRef(false);
  useEffect(() => {
    let active = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(!loaded.current);
    setError('');
    api
      .get<T>(path)
      .then((value) => {
        if (active) {
          setData(value);
          loaded.current = true;
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, refresh: () => setRevision((v) => v + 1) };
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={18} />
      {children}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return <span className={`status ${value.toLowerCase()}`}>{humanize(value)}</span>;
}
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel" data-guide={`panel-${guideKey(title)}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading">
      <div />
      <div />
      <div />
    </div>
  );
}
export function ResourceState({
  loading,
  error,
  refresh,
  children,
}: {
  loading: boolean;
  error: string;
  refresh: () => void;
  children: ReactNode;
}) {
  return loading ? (
    <Loading />
  ) : error ? (
    <div>
      <ErrorNotice>{error}</ErrorNotice>
      <button className="secondary" onClick={refresh}>
        <RefreshCw size={16} />
        Try again
      </button>
    </div>
  ) : (
    <>{children}</>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field" data-guide={`field-${guideKey(label)}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SelectReference({
  items,
  name,
  label,
  required = true,
}: {
  items: Reference[];
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select name={name} required={required}>
        <option value="">Select {label.toLowerCase()}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.fullName || item.name || item.roomNumber}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function PatientSelect({ patients }: { patients: Patient[] }) {
  return (
    <Field label="Patient">
      <select name="patientId" required>
        <option value="">Select patient</option>
        {[...patients]
          .sort((a, b) => a.id - b.id)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · Patient ID #{p.id} · {p.nationalId}
            </option>
          ))}
      </select>
    </Field>
  );
}
/** Debounced server lookup follows the reference CustomerSearch pattern; selection stays native and keyboard accessible. */
export function SearchablePatientSelect() {
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Patient>();
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const resource = useResource<Patient[]>(
    `/references/patients?search=${encodeURIComponent(term)}`,
  );
  const options = resource.data || [];
  const all = [
    ...(selected && !options.some((p) => p.id === selected.id) ? [selected, ...options] : options),
  ].sort((a, b) => a.id - b.id);
  return (
    <div className="patient-picker">
      <Field
        label="Search patient"
        hint="Search name, IC, passport, or phone. Then select the matching patient."
      >
        <input
          type="search"
          value={query}
          placeholder="e.g. Ahmad or 900101-14-5678"
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      {resource.error && <ErrorNotice>{resource.error}</ErrorNotice>}
      <Field label="Patient">
        <select
          name="patientId"
          required
          value={selected?.id || ''}
          onChange={(e) => setSelected(all.find((p) => p.id === Number(e.target.value)))}
        >
          <option value="">{resource.loading ? 'Searching patients…' : 'Select patient'}</option>
          {all.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · Patient ID #{p.id} · {p.nationalId}
            </option>
          ))}
        </select>
      </Field>
      {!resource.loading && !resource.error && !options.length && (
        <p className="form-help">
          No matching patient. Register the patient before starting this workflow.
        </p>
      )}
    </div>
  );
}
export function MutationForm({
  onSubmit,
  children,
  label = 'Save',
  onSuccess,
  disabled = false,
  disabledReason = 'Signed consultations are permanent. Documents can still be issued below.',
}: {
  onSubmit: (form: FormData) => Promise<unknown>;
  children: ReactNode;
  label?: string;
  onSuccess?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const confirm = useConfirm();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || disabled) return;
    const values = new FormData(form);
    setBusy(true);
    setError('');
    setSuccess(false);
    try {
      if (
        label !== 'Sign in' &&
        !(await confirm({
          title: `${label}?`,
          message:
            values.get('status') === 'SIGNED'
              ? 'Signing makes this consultation permanent and reserves prescribed stock. Confirm only after reviewing the patient, note and medicines.'
              : 'Review the entered details. Confirm to apply this change; Cancel keeps your form unchanged.',
          confirmLabel: label,
        }))
      )
        return;
      await onSubmit(values);
      setSuccess(true);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form" data-guide={`form-${guideKey(label)}`}>
      {children}
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {success && (
        <p className="notice success" role="status">
          Saved successfully.
        </p>
      )}
      {disabled && <p className="form-help">{disabledReason}</p>}
      <div className="form-footer">
        <button type="submit" disabled={busy || disabled}>
          {busy ? 'Saving…' : label}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
export function formText(form: FormData, key: string) {
  return String(form.get(key) || '').trim();
}
