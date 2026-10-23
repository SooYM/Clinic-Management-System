import { describe, expect, it } from 'vitest';
import { letterheadSchema, validLogo, readLetterhead } from '../src/server/letterhead';
import { buildDocumentView } from '../src/shared/document-view';
import { buildReceiptView } from '../src/shared/receipt-view';
import PDFDocument from 'pdfkit';
import { renderDocumentPdf } from '../src/server/document-renderer';
import { renderReceiptPdf } from '../src/server/receipt-renderer';

const logoDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=';
const letterhead = {
  logoDataUrl,
  header: 'Clinic contact',
  address: 'Printed address',
  footer: 'Printed footer',
};
describe('clinic letterhead', () => {
  it('accepts bounded embedded raster logos and rejects unsafe or corrupt uploads', () => {
    expect(validLogo(logoDataUrl)).toBe(true);
    expect(validLogo('')).toBe(true);
    for (const logo of [
      'https://example.test/logo.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,YmFk',
      logoDataUrl.slice(0, -12),
    ])
      expect(validLogo(logo)).toBe(false);
    expect(letterheadSchema.safeParse({ ...letterhead, header: 'a'.repeat(501) }).success).toBe(
      false,
    );
  });
  it('reads absent settings without changing historical defaults', async () => {
    expect(await readLetterhead({ query: async () => ({ rows: [], rowCount: 0 }) }, 1)).toEqual({
      logoDataUrl: '',
      header: '',
      address: '',
      footer: '',
    });
  });
  it('rejects illegal PNG IHDR formats before storing logos', () => {
    const changeHeader = (changes: Record<number, number>) => {
      const bytes = Buffer.from(logoDataUrl.split(',')[1], 'base64');
      for (const [offset, value] of Object.entries(changes)) bytes[Number(offset)] = value;
      return 'data:image/png;base64,' + bytes.toString('base64');
    };
    for (const changes of [
      { 11: 12 },
      { 24: 0 },
      { 24: 3, 25: 0 },
      { 24: 1, 25: 2 },
      { 24: 16, 25: 3 },
      { 24: 4, 25: 4 },
      { 24: 4, 25: 6 },
      { 25: 1 },
      { 25: 5 },
      { 25: 7 },
      { 26: 1 },
      { 27: 1 },
      { 28: 2 },
    ] as Record<number, number>[])
      expect(validLogo(changeHeader(changes)), JSON.stringify(changes)).toBe(false);
    expect(validLogo(logoDataUrl)).toBe(true);
  });
  it('renders saved letterhead in real clinical and receipt PDFs', async () => {
    const clinical = buildDocumentView({
      id: 1,
      kind: 'MC',
      documentNumber: 'QA-1',
      createdAt: '2026-10-23T00:00:00Z',
      diagnosisRedacted: true,
      payload: {
        ...letterhead,
        branchName: 'Clinic',
        branchAddress: letterhead.address,
        patientName: 'Fictional patient',
        practitionerName: 'Fictional doctor',
        days: 1,
      },
    });
    const receipt = buildReceiptView({
      id: 1,
      invoiceNumber: 'QA-1',
      createdAt: '2026-10-23T00:00:00Z',
      clinicName: 'Clinic',
      branchName: 'Main',
      clinicAddress: 'Changed address',
      patientName: 'Fictional patient',
      nationalId: '',
      receivedBy: 'Fictional cashier',
      lines: [],
      totalCents: 0,
      payments: [],
      receiptSnapshot: {
        ...letterhead,
        clinicName: 'Clinic',
        branchName: 'Main',
        clinicAddress: letterhead.address,
        patientName: 'Fictional patient',
        nationalId: '',
        receivedBy: 'Fictional cashier',
      },
    });
    expect(clinical).toMatchObject({
      header: letterhead.header,
      footer: letterhead.footer,
      clinicAddress: letterhead.address,
    });
    expect(receipt).toMatchObject({
      header: letterhead.header,
      footer: letterhead.footer,
      clinicAddress: letterhead.address,
    });
    for (const render of [
      (doc: PDFKit.PDFDocument) => renderDocumentPdf(doc, clinical),
      (doc: PDFKit.PDFDocument) => renderReceiptPdf(doc, receipt),
    ]) {
      const doc = new PDFDocument({ margin: 45, compress: false }),
        chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });
      render(doc);
      doc.end();
      const pdf = await done;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('latin1')).toContain('%%EOF');
    }
  });
});
