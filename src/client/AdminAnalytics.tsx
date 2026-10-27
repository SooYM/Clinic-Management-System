import { useState, type FormEvent } from 'react';
import { api } from './api';
import {
  Field,
  MutationForm,
  Panel,
  ResourceState,
  ErrorNotice,
  formText,
  useResource,
} from './components';
import { useConfirm } from './Confirmation';
import { humanize, money } from './types';
import { malaysiaDate } from '../shared/clinic-dates';
import {
  defaultAnalyticsRange,
  analyticsRangeSchema,
  expenseAmountCents,
  expenseCategories,
  type AdminAnalytics,
  type ExpenseRecord,
} from '../shared/admin-analytics';

function RangeFilter({
  range,
  onChange,
}: {
  range: { from: string; to: string };
  onChange: (range: { from: string; to: string }) => void;
}) {
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const result = analyticsRangeSchema.safeParse({
      from: formText(data, 'from'),
      to: formText(data, 'to'),
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    onChange(result.data);
  }
  return (
    <form onSubmit={submit} className="form">
      <div className="form-grid">
        <Field label="From date">
          <input name="from" type="date" required defaultValue={range.from} />
        </Field>
        <Field label="To date">
          <input name="to" type="date" required defaultValue={range.to} />
        </Field>
      </div>
      <div className="actions">
        <button type="submit" className="secondary">
          Apply dates
        </button>
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
    </form>
  );
}
export function AdminDashboard() {
  const [range, setRange] = useState(defaultAnalyticsRange);
  const resource = useResource<AdminAnalytics>(
    `/admin/analytics?from=${range.from}&to=${range.to}`,
    15000,
  );
  return (
    <>
      <Panel title="Income and activity">
        <RangeFilter range={range} onChange={setRange} />
        <p className="form-help">
          Cash basis · current branch · Malaysia dates. Net income deducts recorded paid costs;
          enter stock purchases and all operating expenses in Expenses.
        </p>
        <ResourceState {...resource}>
          {resource.data && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Income / expense</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Revenue collected</th>
                      <td>{money(resource.data.collectedCents / 100)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Stock purchases paid</th>
                      <td>{money(resource.data.stockPurchaseCents / 100)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Operating expenses paid</th>
                      <td>{money(resource.data.operatingExpenseCents / 100)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Total recorded costs</th>
                      <td>{money(resource.data.totalExpenseCents / 100)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Net cash income after recorded costs</th>
                      <td>
                        <strong>{money(resource.data.netCashIncomeCents / 100)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="form-help">
                {resource.data.paidInvoiceCount} paid receipts issued in this period. Revenue
                includes Cash, Card and QR receipts; historical deposit allocations are excluded.
                Unrecorded costs are not included.
              </p>
            </>
          )}
        </ResourceState>
      </Panel>
      <Panel title="Patients by group">
        <p className="form-help">
          All currently registered patients in this branch, including archived group assignments.
        </p>
        <ResourceState {...resource}>
          {resource.data &&
            (resource.data.patientGroups.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Patient group</th>
                      <th>Patients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.patientGroups.map((group) => (
                      <tr key={group.patientGroupId ?? 'none'}>
                        <td>{group.label}</td>
                        <td>{group.patients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No patients registered.</p>
            ))}
        </ResourceState>
      </Panel>
      <Panel title="Top medicines and consumables used">
        <p className="form-help">
          Top 10 items by units dispensed or used in the selected period. Reservations and stock
          receipts are excluded; compare quantities within their stated units.
        </p>
        <ResourceState {...resource}>
          {resource.data &&
            (resource.data.topUsage.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Dispensed</th>
                      <th>Used</th>
                      <th>Total units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.topUsage.map((item) => (
                      <tr key={item.itemId}>
                        <td>
                          {item.name}
                          <small className="record-id">{item.unit}</small>
                        </td>
                        <td>{humanize(item.category)}</td>
                        <td>{item.dispensedQuantity}</td>
                        <td>{item.usedQuantity}</td>
                        <td>{item.totalQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No medicines dispensed or supplies used in this period.</p>
            ))}
        </ResourceState>
      </Panel>
    </>
  );
}
export function ExpenseLedger() {
  const confirm = useConfirm();
  const [range, setRange] = useState(defaultAnalyticsRange);
  const [beforeId, setBeforeId] = useState<number>();
  const [editing, setEditing] = useState<ExpenseRecord>();
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const resource = useResource<ExpenseRecord[]>(
    `/admin/expenses?from=${range.from}&to=${range.to}${beforeId ? `&beforeId=${beforeId}` : ''}`,
  );
  const refresh = () => {
    resource.refresh();
    window.dispatchEvent(new Event('clinic:workflow-updated'));
  };
  return (
    <>
      <Panel title={editing ? 'Edit paid expense' : 'Record paid expense'}>
        <p className="form-help">
          Record actual stock purchases, rent, salaries, utilities and other paid costs once.
          Inventory quantities do not create an expense automatically.
        </p>
        <MutationForm
          key={editing ? `${editing.id}:${editing.version}` : requestKey}
          label={editing ? 'Save expense' : 'Record expense'}
          onSubmit={(form) => {
            const input = {
              paidOn: formText(form, 'paidOn'),
              category: formText(form, 'category'),
              description: formText(form, 'description'),
              amountCents: expenseAmountCents(formText(form, 'amount')),
              reference: formText(form, 'reference'),
            };
            return editing
              ? api.put(`/admin/expenses/${editing.id}`, { ...input, version: editing.version })
              : api.post('/admin/expenses', { ...input, idempotencyKey: requestKey });
          }}
          onSuccess={() => {
            setEditing(undefined);
            setRequestKey(crypto.randomUUID());
            setBeforeId(undefined);
            refresh();
          }}
        >
          <div className="form-grid">
            <Field label="Paid date">
              <input
                name="paidOn"
                type="date"
                required
                max={malaysiaDate()}
                defaultValue={editing?.paidOn || malaysiaDate()}
              />
            </Field>
            <Field label="Expense category">
              <select name="category" defaultValue={editing?.category || 'STOCK_PURCHASE'}>
                {expenseCategories.map((category) => (
                  <option key={category} value={category}>
                    {humanize(category)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount paid (MYR)">
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                required
                min="0.01"
                max="20000000"
                step="0.01"
                defaultValue={editing ? (editing.amountCents / 100).toFixed(2) : ''}
              />
            </Field>
            <Field label="Supplier / receipt reference">
              <input name="reference" maxLength={200} defaultValue={editing?.reference || ''} />
            </Field>
            <Field label="Expense description">
              <input
                name="description"
                required
                maxLength={500}
                defaultValue={editing?.description || ''}
              />
            </Field>
          </div>
          {editing && (
            <button type="button" className="secondary" onClick={() => setEditing(undefined)}>
              Cancel expense edit
            </button>
          )}
        </MutationForm>
      </Panel>
      <Panel title="Paid expense ledger">
        <RangeFilter
          range={range}
          onChange={(value) => {
            setRange(value);
            setBeforeId(undefined);
          }}
        />
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <ResourceState {...resource}>
          {resource.data &&
            (resource.data.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Paid date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.map((row) => (
                      <tr key={row.id}>
                        <td>{row.paidOn}</td>
                        <td>
                          {row.description}
                          {row.reference && <small className="record-id">{row.reference}</small>}
                        </td>
                        <td>{humanize(row.category)}</td>
                        <td>{money(row.amountCents / 100)}</td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => setEditing(row)}
                            >
                              Edit expense #{row.id}
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={async () => {
                                if (
                                  !(await confirm({
                                    title: 'Void paid expense?',
                                    message: `Remove ${row.description} from cash income calculations? Its audit history remains.`,
                                    confirmLabel: 'Void expense',
                                  }))
                                )
                                  return;
                                setError('');
                                try {
                                  await api.request(`/admin/expenses/${row.id}`, 'DELETE', {
                                    version: row.version,
                                  });
                                  if (editing?.id === row.id) setEditing(undefined);
                                  refresh();
                                } catch (cause) {
                                  setError(
                                    cause instanceof Error
                                      ? cause.message
                                      : 'Could not void expense.',
                                  );
                                }
                              }}
                            >
                              Void expense #{row.id}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No paid expenses in this period.</p>
            ))}
        </ResourceState>
        <div className="actions">
          {beforeId && (
            <button type="button" className="secondary" onClick={() => setBeforeId(undefined)}>
              Newest expenses
            </button>
          )}
          {resource.data?.length === 200 && (
            <button
              type="button"
              className="secondary"
              onClick={() => setBeforeId(resource.data!.at(-1)!.id)}
            >
              Older expenses
            </button>
          )}
        </div>
      </Panel>
    </>
  );
}
