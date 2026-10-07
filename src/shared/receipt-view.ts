export interface ReceiptSnapshot {
  clinicName: string;
  branchName: string;
  clinicAddress: string;
  patientName: string;
  nationalId: string;
  receivedBy: string;
}
export interface ReceiptView extends ReceiptSnapshot {
  id: number;
  invoiceNumber: string;
  issuedDate: string;
  issuedTime: string;
  lines: { description: string; quantity: number; unitPriceCents: number; amountCents: number }[];
  totalCents: number;
  payments: { method: string; amountCents: number; reference: string }[];
  simulated: boolean;
}
export function buildReceiptView(
  input: ReceiptSnapshot & {
    id: number;
    invoiceNumber: string;
    createdAt: string;
    lines: { description: string; quantity: number; unitPriceCents: number }[];
    totalCents: number;
    payments: ReceiptView['payments'];
    receiptSnapshot?: ReceiptSnapshot | null;
    simulated?: boolean;
  },
): ReceiptView {
  const date = new Date(
    input.createdAt.includes('T') ? input.createdAt : input.createdAt.replace(' ', 'T') + 'Z',
  );
  const p = input.receiptSnapshot ?? input;
  return {
    id: input.id,
    invoiceNumber: input.invoiceNumber,
    clinicName: p.clinicName,
    branchName: p.branchName,
    clinicAddress: p.clinicAddress,
    patientName: p.patientName,
    nationalId: p.nationalId,
    receivedBy: p.receivedBy || 'Not recorded',
    issuedDate: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
    issuedTime:
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date) + ' MYT',
    lines: input.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      amountCents: l.quantity * l.unitPriceCents,
    })),
    totalCents: input.totalCents,
    payments: input.payments.map((p) => ({
      method: p.method,
      amountCents: p.amountCents,
      reference: p.reference,
    })),
    simulated: input.simulated ?? false,
  };
}
