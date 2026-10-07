import { useEffect, useRef } from 'react';
import { api } from './api';
import { Panel, ResourceState, useResource } from './components';
import { money } from './types';
import type { ReceiptView } from '../shared/receipt-view';

export default function ReceiptPreview({
  invoiceId,
  onClose,
}: {
  invoiceId: number;
  onClose: () => void;
}) {
  const resource = useResource<ReceiptView>(`/invoices/${invoiceId}/receipt-view`);
  const receipt = resource.data;
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = preview.current;
    if (!element) return;
    const navigation = element.closest('.workspace-sections')?.querySelector('.section-navigation');
    const banner = document.querySelector('.demo-banner');
    element.style.scrollMarginTop = `${(navigation?.getBoundingClientRect().height || 0) + (banner?.getBoundingClientRect().height || 0) + 16}px`;
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [invoiceId]);
  return (
    <div ref={preview}>
      <Panel
        title="Receipt preview"
        action={
          <button type="button" className="secondary" onClick={onClose}>
            Close preview
          </button>
        }
      >
        <ResourceState {...resource}>
          {receipt && (
            <>
              {receipt.simulated && (
                <p className="notice">Demo receipt sample — no real payment or verified PDF.</p>
              )}
              <article className="receipt-letter" aria-label={`Receipt ${receipt.invoiceNumber}`}>
                <header className="receipt-heading">
                  <h2>{receipt.clinicName}</h2>
                  <p>{receipt.branchName}</p>
                  <p>{receipt.clinicAddress}</p>
                </header>
                <h3 className="receipt-title">OFFICIAL RECEIPT</h3>
                <dl className="receipt-identity">
                  <div>
                    <dt>IC / Passport</dt>
                    <dd>{receipt.nationalId || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>Receipt No</dt>
                    <dd>{receipt.invoiceNumber}</dd>
                  </div>
                  <div>
                    <dt>Name</dt>
                    <dd>{receipt.patientName}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{receipt.issuedDate}</dd>
                  </div>
                </dl>
                <div className="table-wrap">
                  <table className="receipt-fees">
                    <thead>
                      <tr>
                        <th>Fee description</th>
                        <th>Qty</th>
                        <th>Unit price</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.lines.map((line, index) => (
                        <tr key={index}>
                          <td>
                            {index + 1}. {line.description}
                            <small className="receipt-mobile-unit">
                              {line.quantity} × {money(line.unitPriceCents / 100)}
                            </small>
                          </td>
                          <td>{line.quantity}</td>
                          <td>{money(line.unitPriceCents / 100)}</td>
                          <td>{money(line.amountCents / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="receipt-total">TOTAL AMOUNT: {money(receipt.totalCents / 100)}</p>
                <dl className="receipt-payments">
                  {receipt.payments.map((payment, index) => (
                    <div key={index}>
                      <dt>
                        {payment.method === 'CARD'
                          ? 'Credit / debit card'
                          : payment.method === 'QR'
                            ? 'QR payment'
                            : payment.method === 'DEPOSIT'
                              ? 'Patient deposit'
                              : 'Cash'}
                        {payment.reference && <small>{payment.reference}</small>}
                      </dt>
                      <dd>{money(payment.amountCents / 100)}</dd>
                    </div>
                  ))}
                </dl>
                <footer className="receipt-footer">
                  <p>Received by: {receipt.receivedBy}</p>
                  <p>Time: {receipt.issuedTime}</p>
                </footer>
                <small>Payment methods are staff-recorded settlement references.</small>
              </article>
              {!receipt.simulated && (
                <div className="actions">
                  <a
                    className="button secondary"
                    href={api.url(`/invoices/${invoiceId}/receipt`)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open printable PDF
                  </a>
                  <a className="button" href={api.url(`/invoices/${invoiceId}/receipt?download=1`)}>
                    Download PDF
                  </a>
                </div>
              )}
            </>
          )}
        </ResourceState>
      </Panel>
    </div>
  );
}
