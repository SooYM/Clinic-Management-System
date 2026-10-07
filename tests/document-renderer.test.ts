import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { buildDocumentView, type DocumentSnapshot } from '../src/shared/document-view';
import { renderDocumentPdf } from '../src/server/document-renderer';
const snapshot: DocumentSnapshot = {
  id: 1,
  kind: 'MC',
  documentNumber: 'MC-FICTIONAL-1',
  createdAt: '2026-10-07T16:30:00.000Z',
  startDate: '2026-10-08',
  endDate: '2026-10-09',
  diagnosisRedacted: true,
  payload: {
    encounterId: 3,
    branchName: 'Fictional Clinic',
    branchAddress: 'Fictional address',
    patientName: 'Fictional Patient',
    nationalId: 'SAMPLE-PASSPORT',
    practitionerName: 'Fictional Doctor',
    licenseNumber: 'NOT-A-LICENSE',
    assessment: 'PRIVATE DIAGNOSIS LITERAL',
    conditions: ['PRIVATE CONDITION'],
    days: 2,
  },
};
describe('clinical document privacy and layout', () => {
  it('uses Malaysian issue date/time and excludes redacted diagnosis from the whole preview', () => {
    const view = buildDocumentView(snapshot);
    expect(view.issuedDate).toBe('08/10/2026');
    expect(view.issuedTime).toBe('00:30 MYT');
    expect(view.diagnosis).toBeNull();
    expect(JSON.stringify(view)).not.toContain('PRIVATE');
    expect(view).not.toHaveProperty('payload');
  });
  it('retains referral clinical context while honoring diagnosis redaction', () => {
    const view = buildDocumentView({
      ...snapshot,
      kind: 'REFERRAL',
      payload: {
        ...snapshot.payload,
        target: 'Fictional specialist',
        reason: 'Fictional referral',
        vitals: { bloodPressure: '120/80' },
        allergies: ['Penicillin'],
        prescriptions: [
          {
            itemId: 5,
            itemName: 'Fictional medication',
            dosage: 'Example only',
            durationDays: 2,
            quantity: 4,
            frequencyPerDay: 2,
            mealTiming: 'AFTER_MEAL',
          },
        ],
      },
    });
    expect(view.fields.find((f) => f.label === 'Vitals')?.value).toContain('120/80');
    expect(view.fields.find((f) => f.label === 'Medications')?.value).toContain('2 time(s)/day');
    expect(JSON.stringify(view)).not.toContain('PRIVATE');
  });
  it('paginates very long unbroken clinical text and finishes a valid PDF', async () => {
    const doc = new PDFDocument({ size: 'A4', margin: 55, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const complete = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    renderDocumentPdf(
      doc,
      buildDocumentView({
        ...snapshot,
        diagnosisRedacted: false,
        payload: { ...snapshot.payload, assessment: 'LONGTEXT'.repeat(2500) },
      }),
    );
    doc.end();
    const pdf = await complete;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.length).toBeLessThan(20);
    expect(pdf.toString('latin1')).toContain('%%EOF');
  });
});
