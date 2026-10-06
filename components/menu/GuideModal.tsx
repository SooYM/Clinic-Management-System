import { Modal } from "../Modal";

export function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      labelledBy="guide-modal-title"
      closeLabel="Close Guide"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="pb-2 border-b border-[var(--line)]">
          <span className="badge badge-blue mb-1">KEYBOARD SHORTCUTS & USER GUIDE</span>
          <h2 id="guide-modal-title" className="text-lg font-extrabold text-[var(--navy)]">
            Clinical Management System Guide
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Press single keys directly on your keyboard to instantly trigger clinic operations.
          </p>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 text-xs">
          <div>
            <h3 className="font-extrabold text-[var(--navy)] mb-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--blue)]" />
              Front Desk & Reception
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Register New Patient</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--blue)]">1</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Issue Queue Ticket</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--blue)]">2</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Live Queue & Rooms</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--blue)]">3</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Patient Directory</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--blue)]">4</kbd>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-extrabold text-[var(--navy)] mb-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--mint)]" />
              Consultation & Clinical (Doctors)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Doctor SOAP Charting</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--mint-dark)]">5</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Digital MC Issuance</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--mint-dark)]">6</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Hospital Referral</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--mint-dark)]">7</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Lab Requisition</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--mint-dark)]">8</kbd>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-extrabold text-[var(--navy)] mb-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[var(--warning)]" />
              Treatment, Pharmacy & Finance
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Treatment Packages</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">9</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Dispensary FEFO Stock</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">0</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>3-Day Refill Simulator</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">R</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>POS Billing & Checkout</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">C</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>Commission Ledger</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">L</kbd>
              </div>
              <div className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between">
                <span>WhatsApp Delivery Logs</span>
                <kbd className="font-mono font-bold bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--ink)]">W</kbd>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[var(--blue-soft)] rounded-lg text-xs space-y-1">
            <p className="font-bold text-[var(--blue-on-soft)]">Navigation & Accessibility Tips:</p>
            <p>• Press <kbd className="font-mono bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--line)]">Esc</kbd> anywhere inside a screen to return to the Main Menu.</p>
            <p>• Press <kbd className="font-mono bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--line)]">?</kbd> anytime to open this guide.</p>
            <p>• Inactive tiles show a lock symbol if your current account role does not have authorization.</p>
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--line)] flex justify-end">
          <button className="btn-primary text-xs" onClick={onClose}>
            Close Guide
          </button>
        </div>
      </div>
    </Modal>
  );
}
