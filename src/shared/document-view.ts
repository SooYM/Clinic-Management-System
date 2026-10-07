export interface DocumentView {
  id: number;
  kind: 'MC' | 'REFERRAL' | 'LAB';
  documentNumber: string;
  clinicName: string;
  clinicAddress: string;
  patientName: string;
  nationalId: string;
  practitionerName: string;
  licenseNumber: string;
  issuedAt: string;
  issuedDate: string;
  issuedTime: string;
  revoked: boolean;
  diagnosisRedacted: boolean;
  fields: { label: string; value: string }[];
  diagnosis: string | null;
}
export interface DocumentSnapshot {
  id: number;
  kind: DocumentView['kind'];
  documentNumber: string;
  payload: Record<string, any>;
  createdAt: string;
  startDate?: string | null;
  endDate?: string | null;
  diagnosisRedacted: boolean;
  revokedAt?: string | null;
}
export function buildDocumentView(d: DocumentSnapshot): DocumentView {
  const p = d.payload;
  const date = new Date(
    d.createdAt.includes('T') ? d.createdAt : d.createdAt.replace(' ', 'T') + 'Z',
  );
  const issuedAt = date.toISOString();
  const issuedDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const issuedTime =
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date) + ' MYT';
  const view: DocumentView = {
    id: d.id,
    kind: d.kind,
    documentNumber: d.documentNumber,
    clinicName: String(p.branchName || ''),
    clinicAddress: String(p.branchAddress || ''),
    patientName: String(p.patientName || ''),
    nationalId: String(p.nationalId || ''),
    practitionerName: String(p.practitionerName || ''),
    licenseNumber: String(p.licenseNumber || ''),
    issuedAt,
    issuedDate,
    issuedTime,
    revoked: Boolean(d.revokedAt),
    diagnosisRedacted: Boolean(d.diagnosisRedacted),
    fields: [],
    diagnosis: d.diagnosisRedacted ? null : String(p.assessment || ''),
  };
  const field = (label: string, value: unknown) =>
    view.fields.push({ label, value: String(value ?? '') });
  field('Date', issuedDate);
  field('Name', view.patientName);
  field('Identification', view.nationalId);
  field('Case ID', p.encounterId);
  if (d.kind === 'MC') {
    field('Employer', p.employer || 'Not recorded');
    field('Fitness', p.lightDuty ? 'Fit for light duties only' : 'Unfit for duty');
    field('Leave days', p.days);
    const civilDate = (value: unknown) =>
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? value.split('-').reverse().join('/')
        : String(value || '');
    field('From', civilDate(d.startDate || p.startDate));
    field('To', civilDate(d.endDate || p.endDate));
    field('Doctor', view.practitionerName);
  } else if (d.kind === 'REFERRAL') {
    field('To', p.target);
    field('Urgency', p.urgency);
    field('Reason', p.reason);
    if (!view.diagnosisRedacted) field('Clinical summary', view.diagnosis);
    field(
      'Allergies',
      Array.isArray(p.allergies) ? p.allergies.join(', ') || 'None recorded' : 'Not recorded',
    );
    if (!view.diagnosisRedacted)
      field(
        'Conditions',
        Array.isArray(p.conditions) ? p.conditions.join(', ') || 'None recorded' : 'Not recorded',
      );
    field(
      'Vitals',
      Object.entries(p.vitals || {})
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join('; ') || 'Not recorded',
    );
    field(
      'Medications',
      Array.isArray(p.prescriptions)
        ? p.prescriptions
            .map(
              (rx: any) =>
                `${rx.itemName || 'Medication ID ' + rx.itemId}: ${rx.dosage}; ${rx.frequencyPerDay || 1} time(s)/day; ${String(
                  rx.mealTiming || 'ANY_TIME',
                )
                  .replace(/_/g, ' ')
                  .toLowerCase()}; ${rx.durationDays} day(s); quantity ${rx.quantity}`,
            )
            .join('\n') || 'None recorded'
        : 'Not recorded',
    );
  } else {
    field('Investigations', Array.isArray(p.panels) ? p.panels.join(', ') : '');
    field('Specimen', p.specimenType);
    field(
      'Fasting',
      p.fastingRequired ? 'Required; confirm duration with practitioner' : 'Not required',
    );
    field('Clinical notes', p.clinicalNotes);
  }
  return view;
}
export interface PrescriptionLogEvent {
  type: 'PRESCRIBED' | 'RESERVED' | 'DISPENSED' | 'RELEASED';
  itemId: number;
  itemName: string;
  quantity: number;
  batchId?: number;
  batchNumber?: string;
  actorName: string;
  at: string;
  frequencyPerDay: number;
  mealTiming: string;
  dosage: string;
  durationDays: number;
}
export interface PrescriptionLog {
  encounterId: number;
  patientId: number;
  patientName: string;
  events: PrescriptionLogEvent[];
}
