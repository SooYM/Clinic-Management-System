import { PageTitle, Panel, useModules, useRole } from '../components';
import { startTour, tourNames } from '../GuidedTour';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
const topics = [
  {
    title: 'Start a clinic shift',
    steps: [
      'Sign in with your staff account and choose the correct branch in the sidebar.',
      'Numeric record IDs identify tenants, branches, patients, staff, rooms, consultations, stock, and invoices. Clinical document and queue references remain easy to recognise alongside record IDs.',
      'Use the modules visible in your sidebar. Your administrator controls role access.',
      'Administrators maintain Clinical and inventory choices for lab panels, specimen types, units and referral destinations. Edit or archive choices for future forms; recorded document details stay preserved.',
      'Administrators use Edit item in Dispensary to correct drug names, prices and reorder levels, or archive and reactivate items. Archived medicines stay in historical prescriptions but disappear from new medicine choices. Category, ingredient and unit cannot change after stock or prescribing history.',
      'Use Account security to change your password. New passwords need at least 14 characters.',
    ],
  },
  {
    title: 'Register or update a patient',
    steps: [
      'Open Patients and search before registering, to avoid duplicate records.',
      'Enter first and last names, then choose Malaysian or non-Malaysian.',
      'For Malaysian patients, enter all 12 IC digits. The IC is formatted automatically; date of birth and gender are derived from it. Confirm the birth century if needed.',
      'For non-Malaysian patients, enter passport number and record date of birth and gender manually.',
      'Record address, phone, allergies, chronic conditions, and notification consent. For Malaysian five-digit postcodes, review the suggested city and state. Choose a locality when several match; unknown postcodes and non-Malaysian addresses use manual city and state. Use Edit details for later changes.',
      'Clinical staff can open the patient’s encounter history and load older consultations.',
    ],
  },
  {
    title: 'Book an appointment',
    steps: [
      'Open Appointments and select Book appointment. Search by patient name, identity number, or phone.',
      'Choose a registered GP, an available room if needed, and start and end times.',
      'Save the appointment. Overlapping bookings are rejected; consented notifications enter the delivery queue.',
      'If no GP is available, ask the administrator to create an active GP account with registration number in this branch.',
    ],
  },
  {
    title: 'Manage arrivals and rooms',
    steps: [
      'Use Clinic overview to check in a registered patient and set normal or urgent priority.',
      'Move the ticket to triage, then select room and GP before calling to the room.',
      'Start consultation, send to dispensary or payment, then complete the visit.',
      'Use Skip, Undo skip, or Undo call to correct a waiting-room action.',
      'The waiting-room display shows ticket numbers and room names only. Enable the chime after opening the display. Queue estimates are approximate.',
    ],
  },
  {
    title: 'Record a GP consultation',
    steps: [
      'Open Clinical workspace and select a patient. Record subjective findings, objective findings, assessment, and plan.',
      'Add each medicine with quantity, times per day, meal timing, dosage instructions, and supply days. Recorded allergies are checked before saving.',
      'Save as draft while charting; sign when complete. Signing reserves eligible medicine stock and reduces available quantity. Signed notes are permanent.',
      'Enter blood pressure as SYS/DIA with systolic above diastolic. An unusual monitor-range warning asks you to verify the reading but does not block recording clinical extremes.',
      'Issue medical certificates, referrals, or lab orders from the encounter. Medical certificates can hide diagnosis from employers.',
      'Only the attending GP can issue documents from a signed consultation. New MC leave dates default to today before 5 pm Malaysia time, or tomorrow from 5 pm; review and change the date when needed.',
      'Issuance opens a readable letter preview. Preview saved documents from history; Download PDF is a separate action in the MySQL application. Demo previews are unsigned samples with no verified PDF. Revoke incorrect documents with an audited reason.',
    ],
  },
  {
    title: 'Receive stock and dispense',
    steps: [
      'Open Dispensary. Add medicines, consumables or retail products such as lab coats, then receive stock using batch number, expiry date, and quantity. Supplies and retail items may have no expiry. Search the catalog or filter its category.',
      'Available quantity excludes prescription reservations. Unexpired stock is eligible physical stock; Reserved is held for signed prescriptions. Dispensing deducts physical quantities once.',
      'Use supplies and retail stock records physical usage or issue with quantity and reason. Medicines cannot use this shortcut; they require prescription dispensing.',
      'Available stock excludes expired batches. Refresh the catalogue to see current amounts.',
      'Search the prescription list by patient or medicine, then select an eligible signed prescription to review patient, GP, allergies, and medicine instructions.',
      'Dispense uses first expiry, first out. Insufficient unexpired stock blocks the operation.',
      'An empty prescription list means no undispensed signed prescriptions are available; a GP must sign the consultation first. Search Prescription history and activity for completed work. Clinic activity logs record prescribing, reservations and dispensing. The clinical Patient medication-taking log separately records Taken or Missed doses, patient-reported or staff-observed, without changing stock. GPs and nurses with clinical access can record doses on signed prescriptions.',
    ],
  },
  {
    title: 'Take payment and review delivery',
    steps: [
      'Open Billing & payments and create an itemised checkout for the patient and practitioner.',
      'Add cash, card, QR, or deposit payment amounts. Split amounts must equal the invoice total exactly.',
      'Complete checkout and download the receipt. Record patient deposits separately before using a deposit payment.',
      'Open Reports & delivery to review appointment, queue, and refill notification statuses. Failed or queued delivery does not mean the patient received a message.',
    ],
  },
  {
    title: 'Administer the clinic',
    steps: [
      'Create branches and consultation rooms in Administration. Rename a room or archive it when no longer needed; a busy room cannot be changed.',
      'Create staff accounts in their branch. Choose GP for practitioners and provide the required registration number.',
      'Use Role module access to control navigation by role. Operational data remains branch scoped.',
      'Deactivate accounts when access is no longer needed and inspect the audit trail for recorded actions.',
    ],
  },
];
export default function Guide() {
  const modules = useModules();
  const role = useRole();
  const available = Object.entries(tourNames).filter(
    ([id]) => modules.includes(id) || id === 'account' || (id === 'admin' && role === 'ADMIN'),
  );
  return (
    <>
      <PageTitle
        title="User guide"
        description="Practical steps for patient registration, clinical care, dispensary, and checkout."
      />
      <WorkspaceSections label="User guide sections">
        <WorkspaceSection
          id="walkthroughs"
          label="Visual walkthroughs"
          description="Choose a task to highlight its actual controls in the app."
        >
          <Panel title="Show me on the screen">
            <p className="form-help">
              Choose a walkthrough to circle the actual controls. Use Next, Back or Close; nothing
              is saved by the guide.
            </p>
            <div className="visual-guide-list">
              {available.map(([id, label]) => (
                <button className="secondary" key={id} onClick={() => startTour(id)}>
                  {label}
                  <span>Start visual guide</span>
                </button>
              ))}
            </div>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="instructions"
          label="Written instructions"
          description="Open a topic for step-by-step reference."
        >
          <Panel title="Using your clinic workspace">
            <p className="form-help">
              Choose a topic below. Staff permissions may limit the actions available to your
              account.
            </p>
            <div className="guide-topics">
              {topics.map((topic) => (
                <details key={topic.title}>
                  <summary>{topic.title}</summary>
                  <ol>
                    {topic.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </Panel>
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
