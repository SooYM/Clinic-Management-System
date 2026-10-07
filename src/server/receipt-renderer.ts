import type { ReceiptView } from '../shared/receipt-view';

export function renderReceiptPdf(doc: PDFKit.PDFDocument, receipt: ReceiptView) {
  const left = doc.page.margins.left,
    width = doc.page.width - left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 24;
  const money = (cents: number) => (cents / 100).toFixed(2);
  const wrap = (text: string) =>
    text
      .split(/\s+/)
      .flatMap((word) => word.match(/.{1,45}/g) || [''])
      .join(' ');
  function rule(y: number) {
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .lineWidth(0.5)
      .strokeColor('#9ca3af')
      .stroke();
  }
  function header(continued = false, fees = true) {
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#111827')
      .text(receipt.clinicName.toUpperCase(), left, doc.page.margins.top, { width });
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(receipt.branchName, { width })
      .text(wrap(receipt.clinicAddress), { width });
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(continued ? 'OFFICIAL RECEIPT — CONTINUED' : 'OFFICIAL RECEIPT', {
        width,
        align: 'center',
      })
      .moveDown();
    const y = doc.y,
      half = width / 2;
    doc.font('Helvetica').fontSize(10);
    doc.text(`IC / Passport: ${receipt.nationalId || 'Not recorded'}`, left, y, {
      width: half - 12,
    });
    const idBottom = doc.y;
    doc.text(`Receipt No: ${receipt.invoiceNumber}`, left + half, y, { width: half });
    doc.y = Math.max(doc.y, idBottom) + 8;
    const nameY = doc.y;
    doc.text(`Name: ${wrap(receipt.patientName)}`, left, nameY, { width: half - 12 });
    const nameBottom = doc.y;
    doc.text(`Date: ${receipt.issuedDate}`, left + half, nameY, { width: half });
    doc.y = Math.max(doc.y, nameBottom) + 22;
    if (fees) tableHead();
  }
  function tableHead() {
    const y = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Fee description', left + 20, y, { width: width - 180 });
    doc.text('Qty', left + width - 150, y, { width: 30, align: 'right' });
    doc.text('Unit RM', left + width - 112, y, { width: 50, align: 'right' });
    doc.text('Amount RM', left + width - 60, y, { width: 60, align: 'right' });
    doc.y = y + 22;
  }
  function space(height: number, fees = true) {
    if (doc.y + height > bottom) {
      doc.addPage();
      header(true, fees);
    }
  }
  header();
  receipt.lines.forEach((line, index) => {
    doc.font('Helvetica').fontSize(10);
    const text = wrap(line.description),
      height = Math.max(22, doc.heightOfString(text, { width: width - 185 }) + 10);
    space(height);
    doc.font('Helvetica').fontSize(10);
    const y = doc.y;
    doc.text(String(index + 1), left, y, { width: 18 });
    doc.text(text, left + 20, y, { width: width - 185 });
    doc.text(String(line.quantity), left + width - 150, y, { width: 30, align: 'right' });
    doc.text(money(line.unitPriceCents), left + width - 112, y, { width: 50, align: 'right' });
    doc.text(money(line.amountCents), left + width - 60, y, { width: 60, align: 'right' });
    doc.y = y + height;
  });
  space(Math.min(125 + receipt.payments.length * 28, 350), false);
  rule(doc.y);
  doc.y += 12;
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(`TOTAL AMOUNT: RM ${money(receipt.totalCents)}`, left, doc.y, { width, align: 'right' });
  doc.moveDown().font('Helvetica').fontSize(10);
  for (const payment of receipt.payments) {
    const label =
      payment.method === 'CARD'
        ? 'Credit / debit card'
        : payment.method === 'QR'
          ? 'QR payment'
          : payment.method === 'DEPOSIT'
            ? 'Patient deposit'
            : 'Cash';
    const text = `${label}: RM ${money(payment.amountCents)}${payment.reference ? ` · ${wrap(payment.reference)}` : ''}`;
    space(doc.heightOfString(text, { width }) + 10, false);
    doc.font('Helvetica').fontSize(10).text(text, { width, align: 'right' });
  }
  doc.moveDown();
  space(70, false);
  rule(doc.y);
  doc.y += 12;
  doc.text(`Received by: ${wrap(receipt.receivedBy)}`, left, doc.y, { width: width / 2 });
  doc.text(`Time: ${receipt.issuedTime}`, left + width / 2, doc.y - doc.currentLineHeight(), {
    width: width / 2,
    align: 'right',
  });
  doc
    .moveDown()
    .fontSize(8)
    .text('Payment methods are staff-recorded settlement references.', left, doc.y, { width });
}
