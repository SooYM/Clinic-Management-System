import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { buildReceiptView } from '../src/shared/receipt-view';
import { renderReceiptPdf } from '../src/server/receipt-renderer';
const input = {
  id: 1,
  invoiceNumber: 'INV-FICTIONAL-1',
  createdAt: '2026-10-07T16:30:00.000Z',
  clinicName: 'Fictional Clinic',
  branchName: 'Example Branch',
  clinicAddress: 'Fictional address',
  patientName: 'Fictional Patient',
  nationalId: 'SAMPLE-PASSPORT',
  receivedBy: 'Fictional Cashier',
  lines: [
    { description: 'Consultation', quantity: 1, unitPriceCents: 3000 },
    { description: 'Fictional medicine', quantity: 2, unitPriceCents: 500 },
  ],
  totalCents: 4000,
  payments: [
    { method: 'CASH', amountCents: 1000, reference: '' },
    { method: 'CARD', amountCents: 3000, reference: 'SAMPLE-REF' },
  ],
};
const render = async (lines = input.lines) => {
  const doc = new PDFDocument({ size: 'A4', margin: 45, compress: false });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  renderReceiptPdf(doc, buildReceiptView({ ...input, lines }));
  doc.end();
  return complete;
};
describe('receipt view and printable layout', () => {
  it('retains immutable identity and cashier metadata after later catalog names change', () => {
    const v = buildReceiptView({
      ...input,
      clinicName: 'Changed clinic',
      patientName: 'Changed patient',
      receivedBy: 'Changed cashier',
      receiptSnapshot: {
        clinicName: input.clinicName,
        branchName: input.branchName,
        clinicAddress: input.clinicAddress,
        patientName: input.patientName,
        nationalId: input.nationalId,
        receivedBy: input.receivedBy,
      },
    });
    expect(v.clinicName).toBe(input.clinicName);
    expect(v.patientName).toBe(input.patientName);
    expect(v.receivedBy).toBe(input.receivedBy);
    expect(v.issuedDate).toBe('08/10/2026');
    expect(v.issuedTime).toBe('00:30 MYT');
    expect(v.lines.map((l) => l.amountCents)).toEqual([3000, 1000]);
    expect(v.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(v.totalCents);
    expect(v).not.toHaveProperty('receiptSnapshot');
    expect(v).not.toHaveProperty('requestHash');
    expect(v).not.toHaveProperty('taxCents');
  });
  it('renders a complete one-page ordinary receipt', async () => {
    const pdf = await render();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf.toString('latin1')).toContain('%%EOF');
  });
  it('paginates many long fee descriptions without dropping rows or repeating indefinitely', async () => {
    const pdf = await render(
      Array.from({ length: 70 }, (_, i) => ({
        description: `LINE-${i} ` + 'UNBROKENDESCRIPTION'.repeat(30),
        quantity: 2,
        unitPriceCents: 500,
      })),
    );
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.length).toBeLessThan(25);
    expect(pdf.toString('latin1')).toContain('%%EOF');
  });
});
