import type { DocumentView } from '../shared/document-view.js';

/** Ruled clinic letters use snapshot data and typed attribution, never a copied signature. */
export function renderDocumentPdf(doc: PDFKit.PDFDocument, view: DocumentView, qr?: Buffer) {
  const left = 55,
    width = doc.page.width - 110,
    bottom = doc.page.height - 120;
  const title =
    view.kind === 'MC'
      ? 'MEDICAL CERTIFICATE'
      : view.kind === 'REFERRAL'
        ? 'REFERRAL LETTER'
        : 'LAB INVESTIGATION REQUISITION';
  function header() {
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(view.clinicName, left, 50, { width, align: 'center' });
    doc.font('Helvetica').fontSize(10).text(view.clinicAddress, { width, align: 'center' });
    doc.moveDown(1.2).font('Helvetica-Bold').fontSize(15).text(title, { width, align: 'center' });
    if (view.revoked)
      doc
        .fillColor('red')
        .fontSize(12)
        .text('REVOKED', { width, align: 'center' })
        .fillColor('black');
    doc.moveDown(1.8).font('Helvetica').fontSize(11);
  }
  function nextPage() {
    doc.addPage();
    header();
  }
  function row(label: string, value: string) {
    const chunks = value.split(/\r?\n/);
    let pending = chunks.join('\n') || ' ';
    let continuation = false;
    while (pending) {
      if (doc.y > bottom - 35) nextPage();
      const y = doc.y,
        valueX = left + 115,
        valueWidth = width - 115;
      const lines = pending.split(/\s+/).flatMap((word) => word.match(/.{1,60}/g) || ['']),
        accepted: string[] = [];
      while (lines.length) {
        const candidate = [...accepted, lines[0]].join(' ');
        if (
          accepted.length &&
          doc.heightOfString(candidate, { width: valueWidth }) > bottom - y - 14
        )
          break;
        accepted.push(lines.shift()!);
      }
      const text = accepted.join(' '),
        height = Math.max(24, doc.heightOfString(text, { width: valueWidth }) + 10);
      doc.font('Helvetica-Bold').text(continuation ? '' : label + ':', left, y, { width: 108 });
      doc.font('Helvetica').text(text, valueX, y, { width: valueWidth });
      doc
        .moveTo(valueX, y + height - 5)
        .lineTo(left + width, y + height - 5)
        .strokeColor('#777777')
        .lineWidth(0.4)
        .stroke();
      doc.y = y + height + 9;
      pending = lines.join(' ');
      continuation = true;
      if (pending) nextPage();
    }
  }
  header();
  for (const field of view.fields) row(field.label, field.value);
  if (view.kind === 'MC') row('Diagnosis', view.diagnosis === null ? 'Withheld' : view.diagnosis);
  if (doc.y > bottom - 90) nextPage();
  const signatureY = Math.max(doc.y + 20, bottom - 105);
  doc
    .font('Helvetica')
    .fontSize(9)
    .text('Issued electronically by', left + width / 2, signatureY, {
      width: width / 2,
      align: 'center',
    });
  doc
    .moveDown()
    .font('Helvetica-Bold')
    .text(view.practitionerName, { width: width / 2, align: 'center' });
  doc.font('Helvetica').text('Registration: ' + (view.licenseNumber || 'Not recorded'), {
    width: width / 2,
    align: 'center',
  });
  doc.moveDown().text('Electronic document; no handwritten signature reproduced.', {
    width: width / 2,
    align: 'center',
  });
  doc
    .fontSize(8)
    .text(`Issued: ${view.issuedDate} ${view.issuedTime}`, left, doc.page.height - 95, {
      width: width - 80,
    });
  doc.text(`MC / document serial: ${view.documentNumber}`, { width: width - 80 });
  doc.text('QR confirms current document status without public patient or diagnosis details.', {
    width: width - 80,
  });
  if (qr) doc.image(qr, left + width - 65, doc.page.height - 100, { width: 65, height: 65 });
}
