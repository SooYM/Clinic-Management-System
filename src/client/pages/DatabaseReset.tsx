import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { api, isDemo } from '../api';
import { ErrorNotice, Field, Panel, ResourceState, useResource } from '../components';

import { DATABASE_RESET_PHRASE, type DatabaseResetPreview } from '../../shared/database-reset';

export default function DatabaseReset() {
  const preview = useResource<DatabaseResetPreview>('/admin/database-reset/preview');
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const canReset =
    phrase === DATABASE_RESET_PHRASE &&
    password.length > 0 &&
    acknowledged &&
    !!preview.data &&
    !preview.error &&
    !preview.loading;

  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal();
      cancelButton.current?.focus();
    }
  }, [open]);
  function clearConsent() {
    setPhrase('');
    setPassword('');
    setAcknowledged(false);
    setError('');
  }
  function close() {
    if (busy) return;
    dialog.current?.close();
    setOpen(false);
    clearConsent();
    trigger.current?.focus();
  }
  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReset || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/database-reset', {
        confirmationPhrase: phrase,
        currentPassword: password,
        acknowledge: true,
      });
      setPassword('');
      api.setBranch(undefined);
      window.location.href = '/';
    } catch (failure) {
      setPassword('');
      setError((failure as Error).message);
      setBusy(false);
    }
  }
  return (
    <Panel title="Reset entire database">
      <div className="database-reset-warning">
        <p>
          This permanently erases every tenant and branch, including patients, signed consultations,
          prescriptions, documents, stock, billing, staff and audit records.
        </p>
        <p>
          Signed records are protected during normal operation. This database reset is an explicit
          exception. All current sessions end, and the default clinic and administrator are
          recreated.
        </p>
        <p>Schema migrations and numeric ID sequences are retained.</p>
        {isDemo && <p>Browser demo: this resets this browser session's simulated clinic data.</p>}
      </div>
      <ResourceState {...preview}>
        {preview.data && (
          <>
            <p>
              After reset, sign in with the default administrator:{' '}
              <strong>{preview.data.defaults.administratorEmail}</strong>.
            </p>
            <details className="database-reset-counts">
              <summary>
                Review affected records (
                {preview.data.counts.reduce((total, entry) => total + entry.rowCount, 0)})
              </summary>
              <dl>
                {preview.data.counts.map(({ table, rowCount }) => (
                  <div key={table}>
                    <dt>{table.replaceAll('_', ' ')}</dt>
                    <dd>{rowCount}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}
      </ResourceState>
      {preview.error && (
        <button className="secondary" onClick={preview.refresh}>
          Reload reset preview
        </button>
      )}
      <button
        ref={trigger}
        type="button"
        className="danger"
        disabled={!preview.data || !!preview.error || preview.loading}
        onClick={() => {
          clearConsent();
          setOpen(true);
        }}
      >
        Reset database
      </button>
      <dialog
        ref={dialog}
        className="confirmation-dialog database-reset-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (!busy) {
            setOpen(false);
            clearConsent();
          }
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled)',
          );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {open && (
          <form
            onSubmit={reset}
            className="form"
            autoComplete="off"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.target instanceof HTMLInputElement)
                event.preventDefault();
            }}
          >
            <h2 id={`${id}-title`}>Erase all clinic data?</h2>
            <p id={`${id}-description`}>
              This erases the entire database, including all signed clinical records and every
              tenant and branch. It cannot be undone. All staff will be signed out.
            </p>
            {preview.data && (
              <p>
                Default sign-in after reset:{' '}
                <strong>{preview.data.defaults.administratorEmail}</strong>
              </p>
            )}
            <Field label={`Type ${DATABASE_RESET_PHRASE}`}>
              <input
                value={phrase}
                maxLength={100}
                required
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setPhrase(event.target.value)}
              />
            </Field>
            <Field label="Current password">
              <input
                type="password"
                value={password}
                maxLength={128}
                required
                disabled={busy}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={acknowledged}
                required
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I understand that this permanently erases all clinic data, including signed records.
            </label>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <div className="actions">
              <button
                ref={cancelButton}
                type="button"
                className="secondary"
                disabled={busy}
                autoFocus
                onClick={close}
              >
                Cancel
              </button>
              <button type="submit" className="danger" disabled={!canReset || busy}>
                {busy ? 'Resetting database…' : 'Erase all clinic data'}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </Panel>
  );
}
