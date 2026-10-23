import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function DetailDialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return createPortal(
    <dialog
      ref={dialog}
      className="confirmation-dialog detail-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <header className="detail-dialog-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="secondary" onClick={onClose} autoFocus>
              Close
            </button>
          </header>
          {children}
        </>
      )}
    </dialog>,
    document.body,
  );
}
