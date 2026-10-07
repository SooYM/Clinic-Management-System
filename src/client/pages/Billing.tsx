import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
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
  const invoices = useResource<Invoice[]>('/invoices');
  const patients = useResource<Patient[]>('/references/patients');
  const [create, setCreate] = useState(false);
  const [deposit, setDeposit] = useState(false);
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
  return (
    <>
      <PageTitle
        title="Billing & payments"
        description="Clear itemised charges, split payments, and traceable receipts."
        action={
          <div className="actions">
            <button className="secondary" onClick={() => setDeposit(!deposit)}>
              Record deposit
            </button>
            <button data-guide="open-checkout" onClick={() => setCreate(!create)}>
              {create ? 'Close checkout' : 'New checkout'}
            </button>
          </div>
        }
      />
      {deposit && (
        <Panel title="Patient deposit">
          <MutationForm
            label="Record deposit"
            onSuccess={() => setDeposit(false)}
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
      )}
      {create && (
        <Panel title="Patient checkout">
          <MutationForm
            label="Complete checkout"
            onSuccess={() => {
              invoices.refresh();
              setCreate(false);
              setCheckoutKey(crypto.randomUUID());
            }}
            onSubmit={async (f) => {
              if (total <= 0 || paid !== total)
                throw new Error(
                  'Payment total must equal the invoice total. Adjust the split amounts before checkout.',
                );
              await api.post('/invoices', {
                patientId: Number(formText(f, 'patientId')),
                practitionerId: Number(formText(f, 'practitionerId')),
                lines,
                payments,
                idempotencyKey: checkoutKey,
              });
            }}
          >
            <div className="form-grid">
              <PatientSelect patients={patients.data || []} />
              <SelectReference name="practitionerId" label="Practitioner" items={practitioners} />
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
                        updateLine(i, { unitPriceCents: Math.round(Number(e.target.value) * 100) })
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
                    onClick={() => setLines((v) => v.filter((_, index) => index !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setLines((v) => [
                    ...v,
                    { description: '', quantity: 1, unitPriceCents: 0, category: 'SERVICE' },
                  ])
                }
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
                        updatePayment(i, { amountCents: Math.round(Number(e.target.value) * 100) })
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
                    onClick={() => setPayments((v) => v.filter((_, index) => index !== i))}
                  >
                    Remove payment
                  </button>
                </div>
              ))}
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setPayments((v) => [...v, { method: 'CARD', amountCents: 0, reference: '' }])
                }
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
              Payment amounts must match the invoice. Deposit payments require sufficient patient
              balance.
            </p>
          </MutationForm>
        </Panel>
      )}
      <Panel title="Invoices">
        <ResourceState {...invoices}>
          {invoices.data?.length ? (
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
                  {invoices.data.map((i) => (
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
                        <a
                          href={api.url(`/invoices/${i.id}/receipt`)}
                          className="button secondary"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Receipt
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No invoices issued"
              description="Create a checkout to record clinical services, products, and practitioner revenue attribution."
            />
          )}
        </ResourceState>
      </Panel>
    </>
  );
}
