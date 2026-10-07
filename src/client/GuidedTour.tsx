import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';

interface Step {
  target: string;
  title: string;
  text: string;
  open?: string;
}
const anchor = (name: string) => `[data-guide="${name}"]`;
const field = (name: string) => `${anchor(`field-${name}`)}`;
const panel = (name: string) => anchor(`panel-${name}`);
export const tourNames: Record<string, string> = {
  patients: 'Patient registration',
  appointments: 'Appointment booking',
  queue: 'Arrivals and queue',
  clinical: 'GP consultation',
  inventory: 'Stock and dispensing',
  billing: 'Patient checkout',
  reports: 'Notification delivery',
  admin: 'Clinic administration',
  account: 'Account security',
};
const tours: Record<string, Step[]> = {
  patients: [
    {
      target: '[aria-label="Search patients"]',
      title: 'Search before registering',
      text: 'Find existing patients by name, IC/passport or phone. This helps prevent duplicate records.',
    },
    {
      target: anchor('open-registration'),
      title: 'Register a first visit',
      text: 'This button opens the patient form. The next steps open it for you, without saving a record.',
    },
    {
      target: field('first-name'),
      open: 'open-registration',
      title: 'Record the legal name',
      text: 'Use the identity document. Last name can stay blank for a single legal name.',
    },
    {
      target: field('nationality'),
      open: 'open-registration',
      title: 'Choose identity type',
      text: 'Malaysian IC formats 12 digits and derives birth date and gender. Passport details are entered manually; check the birth century.',
    },
    {
      target: field('postcode'),
      open: 'open-registration',
      title: 'Review the address',
      text: 'Malaysian postcode lookup assists city and state. Choose a locality when several match; manual corrections remain available.',
    },
    {
      target: field('allergies'),
      open: 'open-registration',
      title: 'Capture safety details',
      text: 'Record allergies and chronic conditions, then review notification consent. Close the tour and review all details before saving.',
    },
  ],
  appointments: [
    {
      target: anchor('open-appointment'),
      title: 'Open a booking',
      text: 'Book an appointment for an existing patient. The tour opens this form without creating a booking.',
    },
    {
      target: `${panel('new-appointment')} ${field('search-patient')}`,
      open: 'open-appointment',
      title: 'Search and select the patient',
      text: 'Type a name, identity number or phone, then choose the matching patient from the selector.',
    },
    {
      target: `${panel('new-appointment')} ${field('practitioner')}`,
      open: 'open-appointment',
      title: 'Assign a GP',
      text: 'Active GP accounts in this branch appear here. Rooms are optional; archived rooms are excluded.',
    },
    {
      target: field('starts'),
      open: 'open-appointment',
      title: 'Confirm the time',
      text: 'Set start and end times. Practitioner and room overlaps prevent booking. The guide never confirms a booking.',
    },
    {
      target: panel('scheduled-visits'),
      title: 'Review scheduled visits',
      text: 'This list shows server records for your branch. An empty list means no visits are currently returned.',
    },
  ],
  queue: [
    {
      target: anchor('open-check-in'),
      title: 'Check in an arrival',
      text: 'Use this button for a registered patient. This guide opens the form but never adds a queue ticket.',
    },
    {
      target: `${panel('check-in')} ${field('patient')}`,
      open: 'open-check-in',
      title: 'Choose the correct patient',
      text: 'Confirm the patient and priority before adding a ticket. One active visit per patient is allowed.',
    },
    {
      target: '.queue-controls',
      title: 'Choose room and GP',
      text: 'Assign an active room and GP before calling a ticket. Busy rooms cannot hold another consultation.',
    },
    {
      target: panel('live-visit-queue'),
      title: 'Move the visit forward',
      text: 'Use ticket actions for triage, call, consultation, dispensing and payment. Skip and undo actions correct arrivals; this tour never changes statuses.',
    },
  ],
  clinical: [
    {
      target: `${panel('new-consultation')} ${field('patient')}, ${panel('consultation-note')}`,
      title: 'Choose a patient or draft',
      text: 'Review patient identity and allergies before charting. Only the attending GP can write or sign clinical notes.',
    },
    {
      target: field('s-subjective'),
      title: 'Record SOAP findings',
      text: 'Write subjective history, objective findings, assessment and plan. Existing signed consultations cannot be overwritten.',
    },
    {
      target: field('medicine'),
      title: 'Prescribe from the catalog',
      text: 'Choose a medicine, then record quantity, supply days, times per day, meal timing and dosage instructions. Clinical decisions remain yours.',
    },
    {
      target: field('note-status'),
      title: 'Review before signing',
      text: 'Keep the note as a draft while working. Signing makes it permanent and reserves eligible medicine stock, reducing available quantity before dispensing.',
    },
    {
      target: panel('clinical-documents'),
      title: 'Issue documents separately',
      text: 'Select a signed consultation to issue MC, referral or laboratory documents. The guide never signs or issues anything.',
    },
  ],
  inventory: [
    {
      target: anchor('open-inventory-item'),
      title: 'Add a catalog item',
      text: 'Catalog medicines, consumables and retail products such as lab coats. Adding an item does not create available stock.',
    },
    {
      target: field('item-name'),
      open: 'open-inventory-item',
      title: 'Describe the medicine',
      text: 'Record its name, SKU, active ingredient, unit and price. The tour opens this form without saving an item.',
    },
    {
      target: `${panel('receive-a-stock-batch')} ${field('batch-number')}`,
      title: 'Receive a batch',
      text: 'Select an item and record batch number and quantity. Medicines need future expiry; supplies and retail items may have no expiry.',
    },
    {
      target: `${panel('use-supplies-and-retail-stock')} .panel-heading`,
      title: 'Record supplies or retail usage',
      text: 'Choose a consumable or retail item, quantity and reason to record physical usage. Medication must use signed-prescription dispensing; the guide never submits usage.',
    },
    {
      target: panel('dispense-a-signed-prescription'),
      title: 'Review pending prescriptions',
      text: 'Only signed, medicine-bearing consultations not already dispensed appear. Empty work is legitimate; do not create records merely to fill it.',
    },
    {
      target: `${panel('stock-catalogue')} .panel-heading`,
      title: 'Check remaining stock',
      text: 'Available excludes signed-prescription reservations. Unexpired stock is eligible physical stock; Reserved is held for prescriptions. Dispensing reduces physical stock once.',
    },
  ],
  billing: [
    {
      target: anchor('open-checkout'),
      title: 'Open patient checkout',
      text: 'Create itemized charges and payments together. The guide opens a form but never creates an invoice.',
    },
    {
      target: `${panel('patient-checkout')} ${field('patient')}`,
      open: 'open-checkout',
      title: 'Confirm patient and practitioner',
      text: 'Choose the correct patient and GP before entering invoice lines.',
    },
    {
      target: '.invoice-line',
      open: 'open-checkout',
      title: 'Enter itemized charges',
      text: 'Record description, quantity, price and category. Add more lines only when needed.',
    },
    {
      target: '.payment-line',
      open: 'open-checkout',
      title: 'Split the payment',
      text: 'Cash, card, QR and deposit amounts must exactly match the total. Deposit spending cannot exceed the recorded balance.',
    },
    {
      target: panel('invoices'),
      title: 'Review saved receipts',
      text: 'Successful checkout adds a persisted invoice. Receipt links use recorded payments; card and QR entries do not authorize a gateway charge.',
    },
  ],
  reports: [
    {
      target: panel('patient-notification-delivery'),
      title: 'Read delivery states',
      text: 'Pending, failed and unconfigured messages are distinct from sent messages. SENT records provider acceptance, not patient receipt.',
    },
  ],
  admin: [
    {
      target: `${panel('create-staff-account')} ${field('role')}`,
      title: 'Create staff with the right role',
      text: 'GP accounts require a registration number and appear automatically as practitioners when active in their branch.',
    },
    {
      target: panel('consultation-rooms'),
      title: 'Maintain rooms',
      text: 'Create, rename or archive consultation rooms. Active occupancy or future bookings prevent room changes.',
    },
    {
      target: panel('role-module-access'),
      title: 'Grant workflow access',
      text: 'Save modules by role. Branch membership still applies; only GPs write clinical notes and only administrators change these settings.',
    },
    {
      target: panel('staff-access'),
      title: 'Review staff access',
      text: 'Deactivate accounts that no longer need access. Self-deactivation and loss of the final administrator are protected.',
    },
    {
      target: panel('audit-trail'),
      title: 'Inspect recorded actions',
      text: 'Review scoped audit records. This guide does not change staff, rooms or permissions.',
    },
  ],
  account: [
    {
      target: field('current-password'),
      title: 'Verify your current password',
      text: 'Password changes require the current password. Do not share staff accounts.',
    },
    {
      target: field('new-password'),
      title: 'Choose a new password',
      text: 'Use 14–128 characters. A successful change ends sessions and requires signing in again. The guide does not submit the form.',
    },
  ],
};
export function startTour(module: string) {
  window.dispatchEvent(new CustomEvent('clinic:start-tour', { detail: module }));
}

export function GuidedTour({
  module,
  role,
  onClose,
}: {
  module: string;
  role: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect>();
  const [missing, setMissing] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(12);
  const card = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLElement | null>(null);
  const steps =
    role !== 'DOCTOR' && module === 'clinical'
      ? [
          tours.clinical[0],
          {
            target: panel('clinical-documents'),
            title: 'Review clinical records',
            text: 'Your module grant permits review. Only an attending GP can edit, sign or issue clinical documents.',
          },
        ]
      : tours[module] || [];
  const step = steps[index];
  useLayoutEffect(() => {
    if (!step) return;
    setRect(undefined);
    setMissing(false);
    let stopped = false,
      prepared = false,
      scrolled = false;
    const deadline = Date.now() + 3500;
    const update = () => {
      if (stopped) return;
      const matches = Array.from(document.querySelectorAll<HTMLElement>(step.target));
      let element = matches.find(
        (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden',
      );
      if (element && element.offsetHeight > innerHeight * 0.45)
        element = element.querySelector<HTMLElement>('.panel-heading, .field') || element;
      if (!element && step.open && !prepared) {
        const opener = document.querySelector<HTMLButtonElement>(anchor(step.open));
        if (opener) {
          opener.click();
          prepared = true;
        }
      }
      target.current = element || null;
      if (element) {
        if (!scrolled) {
          element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          if (window.innerWidth <= 600) window.scrollBy(0, 100);
          scrolled = true;
        }
        const bounds = element.getBoundingClientRect();
        const banner = document.querySelector('.demo-banner')?.getBoundingClientRect().bottom || 0;
        const viewportBottom =
          (window.visualViewport?.height || innerHeight) + (window.visualViewport?.offsetTop || 0);
        setKeyboardOffset(Math.max(12, innerHeight - viewportBottom + 12));
        const bottom =
          window.innerWidth <= 600
            ? card.current?.getBoundingClientRect().top || viewportBottom
            : viewportBottom;
        const visible =
          bounds.bottom > banner &&
          bounds.top < bottom &&
          bounds.right > 0 &&
          bounds.left < innerWidth;
        setRect(visible ? bounds : undefined);
        setMissing(!visible);
      } else if (Date.now() > deadline) {
        setRect(undefined);
        setMissing(true);
      }
    };
    const timer = window.setInterval(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    update();
    card.current?.focus({ preventScroll: true });
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [index, module, role]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [onClose]);
  if (!step) return null;
  const cardHeight = card.current?.offsetHeight || 260;
  const left = rect
    ? Math.max(12, Math.min(rect.left, innerWidth - 372))
    : Math.max(12, (innerWidth - 360) / 2);
  const banner = document.querySelector('.demo-banner')?.getBoundingClientRect().bottom || 0;
  const preferredTop = rect
    ? rect.bottom + cardHeight + 24 < innerHeight
      ? rect.bottom + 12
      : Math.max(banner + 12, rect.top - cardHeight - 12)
    : banner + 30;
  const top = Math.max(banner + 12, Math.min(preferredTop, innerHeight - cardHeight - 12));
  return (
    <div className="guided-tour">
      {rect && (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            left: Math.max(4, rect.left - 6),
            top: Math.max(4, rect.top - 6),
            width: Math.min(rect.width + 12, innerWidth - 8),
            height: Math.min(rect.height + 12, innerHeight - 8),
          }}
        />
      )}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        tabIndex={-1}
        style={
          {
            left,
            top,
            '--tour-bottom': `${keyboardOffset}px`,
            '--tour-banner': `${banner}px`,
          } as CSSProperties
        }
      >
        <div className="tour-heading">
          <span>
            {tourNames[module]} · {index + 1} / {steps.length}
          </span>
          <button
            className="icon-button secondary"
            aria-label="Close visual guide"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div aria-live="polite">
          <h2 id="tour-title">{step.title}</h2>
          <p id="tour-description">{step.text}</p>
        </div>
        {missing && (
          <p className="tour-unavailable" role="status">
            This control is unavailable in the current view. You can continue or close the guide.
          </p>
        )}
        <button
          className="tour-focus"
          disabled={!rect}
          onClick={() => {
            const element = target.current;
            const control = element?.matches('input,select,textarea,button,a')
              ? element
              : element?.querySelector<HTMLElement>('input,select,textarea,button,a');
            (control || element)?.focus({ preventScroll: true });
          }}
        >
          Focus highlighted control
        </button>
        <div className="tour-actions">
          <button className="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            Back
          </button>
          <button onClick={() => (index === steps.length - 1 ? onClose() : setIndex(index + 1))}>
            {index === steps.length - 1 ? 'Finish guide' : 'Next'}
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
