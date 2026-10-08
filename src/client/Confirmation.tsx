import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface Confirmation {
  title: string;
  message: string;
  confirmLabel?: string;
}
const ConfirmationContext = createContext<(options: Confirmation) => Promise<boolean>>(
  async () => false,
);
export const useConfirm = () => useContext(ConfirmationContext);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<Confirmation>();
  const pending = useRef<((consented: boolean) => void) | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  function finish(consented: boolean) {
    dialog.current?.close();
    const resolve = pending.current;
    pending.current = undefined;
    setPrompt(undefined);
    resolve?.(consented);
  }
  useEffect(() => {
    if (prompt && !dialog.current?.open) dialog.current?.showModal();
  }, [prompt]);
  useEffect(() => () => pending.current?.(false), []);
  return (
    <ConfirmationContext.Provider
      value={(options) => {
        // A second action must never replace an unanswered consent request.
        if (pending.current) return Promise.resolve(false);
        return new Promise<boolean>((resolve) => {
          pending.current = resolve;
          setPrompt(options);
        });
      }}
    >
      {children}
      <dialog
        ref={dialog}
        className="confirmation-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          finish(false);
        }}
      >
        {prompt && (
          <>
            <h2 id={`${id}-title`}>{prompt.title}</h2>
            <p id={`${id}-message`}>{prompt.message}</p>
            <div className="actions">
              <button className="secondary" autoFocus onClick={() => finish(false)}>
                Cancel
              </button>
              <button onClick={() => finish(true)}>{prompt.confirmLabel || 'Confirm'}</button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmationContext.Provider>
  );
}
