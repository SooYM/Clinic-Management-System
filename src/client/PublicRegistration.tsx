import { useCallback, useEffect, useState } from 'react';
import { api, isDemo } from './api';
import { useConfirm } from './Confirmation';
import { ErrorNotice, Loading, Panel, ResourceState, useResource } from './components';
import PatientForm, { type RegistrationPatient } from './pages/PatientForm';
import './PublicRegistration.css';

interface RegistrationBranch {
  branch: { id: number; name: string; clinicName: string };
  enabled: boolean;
}
interface Receipt {
  reference: string;
  ticketNumber: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  expiresAt: string;
  branchName: string;
}
export default function PublicRegistration() {
  const confirm = useConfirm();
  const branchId = Number(new URLSearchParams(location.search).get('branchId'));
  const validBranch = Number.isSafeInteger(branchId) && branchId > 0;
  const branch = useResource<RegistrationBranch>(
    validBranch ? `/public/registration/branches/${branchId}` : '',
    15000,
  );
  const receiptKey = `clinic:registration-receipt:${branchId}`;
  const submissionKey = `clinic:registration-submission:${branchId}`;
  const [receiptToken, setReceiptToken] = useState(() => sessionStorage.getItem(receiptKey) || '');
  const receipt = useResource<Receipt>(
    receiptToken ? `/public/registration/receipts/${encodeURIComponent(receiptToken)}` : '',
    10000,
  );
  const [sent, setSent] = useState<Receipt>();
  const visibleReceipt =
    receipt.data && (!sent || receipt.data.reference === sent.reference) ? receipt.data : sent;
  const lookupPostcode = useCallback(
    async (postcode: string, signal: AbortSignal) =>
      api.get<{ postcode: string; city: string; state: string }[]>(
        `/public/registration/branches/${branchId}/postcodes/${encodeURIComponent(postcode)}`,
        signal,
      ),
    [branchId],
  );
  async function submit(patient: RegistrationPatient) {
    let key = sessionStorage.getItem(submissionKey);
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem(submissionKey, key);
    }
    const result = await api.post<Receipt & { receiptToken: string }>(
      `/public/registration/branches/${branchId}`,
      { submissionKey: key, patient, consent: true },
    );
    sessionStorage.setItem(receiptKey, result.receiptToken);
    sessionStorage.removeItem(submissionKey);
    setSent(result);
    setReceiptToken(result.receiptToken);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    document.title = 'Patient registration · Clinic';
  }, []);
  return (
    <main className="public-registration">
      <header>
        <h1>{branch.data?.branch.clinicName || 'Patient registration'}</h1>
        {branch.data && <p>{branch.data.branch.name}</p>}
      </header>
      {isDemo && (
        <p className="notice info">
          Demo registration works only in this browser tab. A different phone or browser cannot send
          registrations to this demo reception desk. Use sample details only.
        </p>
      )}
      {!validBranch ? (
        <ErrorNotice>
          Open the registration link or QR code provided by your clinic branch.
        </ErrorNotice>
      ) : receiptToken ? (
        <Panel title="Your visit ticket">
          {!visibleReceipt && receipt.loading && <Loading />}
          {receipt.error && (
            <ErrorNotice>
              {receipt.error} Ask reception to check your registration before submitting again.
            </ErrorNotice>
          )}
          {visibleReceipt && (
            <>
              <p className="registration-ticket">{visibleReceipt.ticketNumber}</p>
              <h2>
                {visibleReceipt.status === 'PENDING'
                  ? 'Awaiting reception confirmation'
                  : visibleReceipt.status === 'ACCEPTED'
                    ? 'Checked in — waiting to be called'
                    : visibleReceipt.status === 'REJECTED'
                      ? 'Please speak with reception'
                      : 'This ticket has expired'}
              </h2>
              <p>
                {visibleReceipt.status === 'PENDING'
                  ? 'Go to reception with your IC or passport. Staff must verify your identity before you join the active queue.'
                  : visibleReceipt.status === 'ACCEPTED'
                    ? 'Your identity has been confirmed. Keep this ticket and watch the waiting-room display.'
                    : 'Ask reception to help with your visit. This ticket cannot be called.'}
              </p>
              <p className="form-help">
                {visibleReceipt.branchName} · Reference {visibleReceipt.reference}
              </p>
              <p className="form-help">
                Status refreshes automatically. Keep this page open; do not share its link or
                browser session.
              </p>
              <button type="button" className="secondary" onClick={receipt.refresh}>
                Refresh ticket status
              </button>
              {['REJECTED', 'EXPIRED'].includes(visibleReceipt.status) && (
                <button
                  type="button"
                  className="secondary"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: 'Start another registration?',
                        message:
                          'Start a new form and replace this browser’s ticket receipt. The previous registration remains in clinic records.',
                        confirmLabel: 'Start new registration',
                      }))
                    )
                      return;
                    sessionStorage.removeItem(receiptKey);
                    sessionStorage.removeItem(submissionKey);
                    setSent(undefined);
                    setReceiptToken('');
                    branch.refresh();
                  }}
                >
                  Start new registration
                </button>
              )}
            </>
          )}
        </Panel>
      ) : (
        <ResourceState {...branch}>
          {branch.data?.enabled ? (
            <Panel title="Register for your visit">
              <p>
                Enter your own details as shown on your IC or passport. Reception will verify your
                identity and confirm check-in.
              </p>
              <p className="form-help">
                A ticket number is reserved after submission. It becomes active only after reception
                confirms your arrival.
              </p>
              <PatientForm onSaved={() => {}} publicRegistration={{ submit, lookupPostcode }} />
            </Panel>
          ) : (
            <Panel title="Registration is closed">
              <p>Please visit reception to register or check in.</p>
            </Panel>
          )}
        </ResourceState>
      )}
    </main>
  );
}
