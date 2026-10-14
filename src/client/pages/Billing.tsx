import ReceiptPreview from '../ReceiptPreview';
import './Billing.css';
import { useListControls } from '../ListControls';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useConfirm } from '../Confirmation';
import {
  Empty,
  Field,
  MutationForm,
  PageTitle,
  Panel,
  PatientSelect,
  ResourceState,
  SelectReference,
  Status,
  formText,
  useResource,
} from '../components';
import { type Patient, type Reference, money } from '../types';
import { WorkspaceSections, WorkspaceSection } from '../WorkspaceSections';
interface BillingSuggestion {
  id: number;
  encounterId: number;
  patientId: number;
  patientNumber: string;
  patientName: string;
  practitionerId: number;
  practitionerName: string;
  dispensedAt: string | null;
  prescriptions: { itemName: string; quantity: number; unitPriceCents: number }[];
}
interface Invoice {
  id: number;
  invoiceNumber: string;
  patientName: string;
  totalCents: number;
  payments: { amountCents: number }[];
  status: string;
}
interface Line {
  description: string;
  quantity: number;
  unitPriceCents: number;
  category: string;
}
interface Payment {
  method: string;
  amountCents: number;
  reference: string;
}
export default function Billing({ practitioners }: { practitioners: Reference[] }) {
  const confirm = useConfirm();
  const checkoutDirty = useRef(false);
  const invoices = useResource<Invoice[]>('/invoices', 15000);
  const suggestions = useResource<BillingSuggestion[]>('/billing/suggestions', 15000);
  const [selectedVisit, setSelectedVisit] = useState<BillingSuggestion>();
  const handoffConsumed = useRef(false);
  const [handoffMissing, setHandoffMissing] = useState(false);
  const invoiceList = useListControls(invoices.data || [], {
    label: 'Loaded invoices',
    search: (row) => `${row.id} ${row.invoiceNumber} ${row.patientName}`,
    filters: [{ key: 'status', label: 'Invoice status', value: (row) => row.status }],
    sorts: [
      { key: 'id', label: 'Invoice ID', value: (row) => row.id },
      { key: 'patient', label: 'Patient name', value: (row) => row.patientName },
      { key: 'total', label: 'Total amount', value: (row) => row.totalCents },
    ],
  });
  const patients = useResource<Patient[]>('/references/patients');
  const [section, setSection] = useState('checkout');
  const [previewInvoice, setPreviewInvoice] = useState<number>();
  const [depositRevision, setDepositRevision] = useState(0);
  const [lines, setLines] = useState<Line[]>([
    { description: '', quantity: 1, unitPriceCents: 0, category: 'SERVICE' },
  ]);
  const [payments, setPayments] = useState<Payment[]>([
    { method: 'CASH', amountCents: 0, reference: '' },
  ]);
  const [checkoutKey, setCheckoutKey] = useState(crypto.randomUUID());
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
  const paid = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const updateLine = (index: number, patch: Partial<Line>) =>
    setLines((v) => v.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const updatePayment = (index: number, patch: Partial<Payment>) =>
    setPayments((v) => v.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  async function discardCheckout() {
    if (!checkoutDirty.current && !selectedVisit) return true;
    return confirm({
      title: 'Replace this checkout?',
      message:
        'Current patient selection, charges and payment entries will be cleared. Cancel keeps your checkout unchanged.',
      confirmLabel: 'Replace checkout',
    });
  }
  async function chooseVisit(visit: BillingSuggestion) {
    if (selectedVisit?.encounterId === visit.encounterId) {
      setSection('checkout');
      return;
    }
    if (!(await discardCheckout())) return;
    checkoutDirty.current = false;
    setSelectedVisit(visit);
    setHandoffMissing(false);
    setSection('checkout');
    setCheckoutKey(crypto.randomUUID());
    setLines(
      visit.prescriptions.length
        ? visit.prescriptions.map((rx) => ({
            description: rx.itemName,
            quantity: rx.quantity,
            unitPriceCents: rx.unitPriceCents,
            category: 'PRODUCT',
          }))
        : [{ description: 'Consultation', quantity: 1, unitPriceCents: 0, category: 'SERVICE' }],
    );
    setPayments([{ method: 'CASH', amountCents: 0, reference: '' }]);
  }
  useEffect(() => {
    if (!suggestions.data || handoffConsumed.current) return;
    handoffConsumed.current = true;
    const key = `clinic:billing-handoff:${api.getBranch() || 'default'}`;
    const encounterId = Number(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    if (!encounterId) return;
    const visit = suggestions.data.find((row) => row.encounterId === encounterId);
    if (visit) chooseVisit(visit);
    else setHandoffMissing(true);
  }, [suggestions.data]);
  return (
    <>
      <PageTitle
        title="Billing & payments"
        description="Clear itemised charges, split payments, and traceable receipts."
      />
      <WorkspaceSections label="Billing sections" value={section} onChange={setSection}>
        <WorkspaceSection
          id="checkout"
          label="Patient checkout"
          description="Prepare itemised charges and allocate payments before issuing the invoice."
        >
          <Panel title="Patients ready for billing">
            <p className="form-help">
              Completed dispensing and signed visits without medicines appear automatically. Review
              charges before collecting payment.
            </p>
            {handoffMissing && (
              <p className="notice info" role="status">
                This visit is no longer awaiting billing. Refresh or review invoice history.
              </p>
            )}
            <ResourceState {...suggestions}>
              <div className="billing-suggestion-list">
                {suggestions.data?.length ? (
                  suggestions.data.map((visit) => (
                    <div className="list-row billing-suggestion-row" key={visit.encounterId}>
                      <div>
                        <strong>{visit.patientName}</strong>
                        <p className="form-help">
                          Patient #{visit.patientId} · Consultation #{visit.encounterId} ·{' '}
                          {visit.practitionerName}
                        </p>
                      </div>
                      <button className="secondary" onClick={() => chooseVisit(visit)}>
                        Prepare checkout
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="form-help">No patients awaiting billing.</p>
                )}
              </div>
            </ResourceState>
          </Panel>
          <Panel title="Patient checkout">
            <div
              onChange={() => {
                checkoutDirty.current = true;
              }}
            >
              <MutationForm
                key={checkoutKey}
                label="Complete checkout"
                onSuccess={() => {
                  invoices.refresh();
                  suggestions.refresh();
                  setSelectedVisit(undefined);
                  checkoutDirty.current = false;
                  setLines([
                    { description: '', quantity: 1, unitPriceCents: 0, category: 'SERVICE' },
                  ]);
                  setPayments([{ method: 'CASH', amountCents: 0, reference: '' }]);
                  setSection('invoices');
                  setCheckoutKey(crypto.randomUUID());
                }}
                onSubmit={async (f) => {
                  if (total <= 0 || paid !== total)
                    throw new Error(
                      'Payment total must equal the invoice total. Adjust the split amounts before checkout.',
                    );
                  await api.post('/invoices', {
                    ...(selectedVisit ? { encounterId: selectedVisit.encounterId } : {}),
                    patientId: Number(formText(f, 'patientId')),
                    practitionerId: Number(formText(f, 'practitionerId')),
                    lines,
                    payments,
                    idempotencyKey: checkoutKey,
                  });
                }}
              >
                <div className="form-grid">
                  {selectedVisit ? (
                    <>
                      <div>
                        <strong>{selectedVisit.patientName}</strong>
                        <p className="form-help">
                          Patient #{selectedVisit.patientId} · Consultation #
                          {selectedVisit.encounterId} · GP {selectedVisit.practitionerName}
                        </p>
                        <input type="hidden" name="patientId" value={selectedVisit.patientId} />
                        <input
                          type="hidden"
                          name="practitionerId"
                          value={selectedVisit.practitionerId}
                        />
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          if (!(await discardCheckout())) return;
                          checkoutDirty.current = false;
                          setSelectedVisit(undefined);
                          setCheckoutKey(crypto.randomUUID());
                          setLines([
                            {
                              description: '',
                              quantity: 1,
                              unitPriceCents: 0,
                              category: 'SERVICE',
                            },
                          ]);
                          setPayments([{ method: 'CASH', amountCents: 0, reference: '' }]);
                        }}
                      >
                        Start manual checkout
                      </button>
                    </>
                  ) : (
                    <>
                      <PatientSelect patients={patients.data || []} />
                      <SelectReference
                        name="practitionerId"
                        label="Practitioner"
                        items={practitioners}
                      />
                    </>
                  )}
                </div>
                <fieldset>
                  <legend>Invoice items</legend>
                  {lines.map((l, i) => (
                    <div className="invoice-line" key={i}>
                      <Field label="Description">
                        <input
                          required
                          value={l.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                        />
                      </Field>
                      <Field label="Quantity">
                        <input
                          type="number"
                          required
                          min="1"
                          value={l.quantity}
                          onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                        />
                      </Field>
                      <Field label="Unit price (MYR)">
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={l.unitPriceCents / 100}
                          onChange={(e) =>
                            updateLine(i, {
                              unitPriceCents: Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </Field>
                      <Field label="Category">
                        <select
                          value={l.category}
                          onChange={(e) => updateLine(i, { category: e.target.value })}
                        >
                          <option>SERVICE</option>
                          <option>PRODUCT</option>
                        </select>
                      </Field>
                      <button
                        className="icon-button secondary"
                        type="button"
                        aria-label={`Remove invoice line ${i + 1}`}
                        disabled={lines.length === 1}
                        onClick={() => {
                          checkoutDirty.current = true;
                          setLines((v) => v.filter((_, index) => index !== i));
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      checkoutDirty.current = true;
                      setLines((v) => [
                        ...v,
                        { description: '', quantity: 1, unitPriceCents: 0, category: 'SERVICE' },
                      ]);
                    }}
                  >
                    <Plus size={16} />
                    Add item
                  </button>
                </fieldset>
                <div className="total-row">
                  <span>Invoice total</span>
                  <strong>{money(total / 100)}</strong>
                </div>
                <fieldset>
                  <legend>Split payments</legend>
                  {payments.map((p, i) => (
                    <div className="payment-line" key={i}>
                      <Field label="Payment method">
                        <select
                          value={p.method}
                          onChange={(e) => updatePayment(i, { method: e.target.value })}
                        >
                          {['CASH', 'CARD', 'QR', 'DEPOSIT'].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Amount (MYR)">
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={p.amountCents / 100}
                          onChange={(e) =>
                            updatePayment(i, {
                              amountCents: Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </Field>
                      <Field label="Payment reference">
                        <input
                          value={p.reference}
                          onChange={(e) => updatePayment(i, { reference: e.target.value })}
                        />
                      </Field>
                      <button
                        className="text-button"
                        type="button"
                        disabled={payments.length === 1}
                        onClick={() => {
                          checkoutDirty.current = true;
                          setPayments((v) => v.filter((_, index) => index !== i));
                        }}
                      >
                        Remove payment
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      checkoutDirty.current = true;
                      setPayments((v) => [...v, { method: 'CARD', amountCents: 0, reference: '' }]);
                    }}
                  >
                    <Plus size={16} />
                    Add split payment
                  </button>
                </fieldset>
                <div className="total-row">
                  <span>Remaining to allocate</span>
                  <strong>{money((total - paid) / 100)}</strong>
                </div>
                <p className="form-help">
                  Payment amounts must match the invoice. Deposit payments require sufficient
                  patient balance.
                </p>
              </MutationForm>
            </div>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="invoices"
          label="Invoice history"
          description="Review issued invoices, recorded payments and receipts."
        >
          {previewInvoice && (
            <ReceiptPreview
              key={previewInvoice}
              invoiceId={previewInvoice}
              onClose={() => setPreviewInvoice(undefined)}
            />
          )}
          <Panel title="Invoices">
            {invoiceList.controls}
            <ResourceState {...invoices}>
              {invoiceList.items.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        <th>Patient</th>
                        <th>Total</th>
                        <th>Paid</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceList.items.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.invoiceNumber}</strong>
                            <small>Invoice ID #{i.id}</small>
                          </td>
                          <td>{i.patientName}</td>
                          <td>{money(i.totalCents / 100)}</td>
                          <td>
                            {money((i.payments || []).reduce((s, p) => s + p.amountCents, 0) / 100)}
                          </td>
                          <td>
                            <Status value={i.status} />
                          </td>
                          <td>
                            <button className="secondary" onClick={() => setPreviewInvoice(i.id)}>
                              Preview receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title={invoices.data?.length ? 'No matching invoices' : 'No invoices issued'}
                  description={
                    invoices.data?.length
                      ? 'Clear filters to review all loaded invoices.'
                      : 'Create a checkout to record clinical services, products, and practitioner revenue attribution.'
                  }
                />
              )}
            </ResourceState>
          </Panel>
        </WorkspaceSection>
        <WorkspaceSection
          id="deposits"
          label="Patient deposits"
          description="Record prepaid patient funds with a payment reference."
        >
          <Panel title="Patient deposit">
            <MutationForm
              key={depositRevision}
              label="Record deposit"
              onSuccess={() => {
                setSection('invoices');
                setDepositRevision((value) => value + 1);
              }}
              onSubmit={(f) =>
                api.post('/deposits', {
                  patientId: Number(formText(f, 'patientId')),
                  amountCents: Math.round(Number(f.get('amount')) * 100),
                  reference: formText(f, 'reference'),
                })
              }
            >
              <div className="form-grid">
                <PatientSelect patients={patients.data || []} />
                <Field label="Amount (MYR)">
                  <input name="amount" type="number" min="0.01" step="0.01" required />
                </Field>
                <Field label="Payment reference">
                  <input name="reference" required />
                </Field>
              </div>
            </MutationForm>
          </Panel>
        </WorkspaceSection>
      </WorkspaceSections>
    </>
  );
}
