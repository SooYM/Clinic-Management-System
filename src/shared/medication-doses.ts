export interface MedicationDose {
  id: number;
  encounterId: number;
  itemId: number;
  medicineName: string;
  unit: string;
  outcome: 'TAKEN' | 'MISSED';
  source: 'PATIENT_REPORTED' | 'STAFF_OBSERVED';
  occurredAt: string;
  amount: number | null;
  notes: string;
  actorId: number;
  actorName: string;
  createdAt: string;
  idempotencyKey: string;
}
export interface MedicationDoseLog {
  encounterId: number;
  patientId: number;
  patientName: string;
  entries: MedicationDose[];
}
