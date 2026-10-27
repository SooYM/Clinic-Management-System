import type { PrintBranding } from './letterhead';
/** Saved prescription directions, print branding and the original successful dispensing time. */
export interface MedicineLabelPrescription extends PrintBranding {
  id: number;
  patientId: number;
  patientName: string;
  practitionerName: string;
  dispensedAt: string | null;
  prescriptions: {
    itemId?: number;
    itemName: string;
    unit?: string;
    quantity: number;
    quantityPerDose?: number;
    form?: 'PILL' | 'PASTE' | 'SYRUP' | 'OTHER';
    instructions?: string;
    indication?: string;
    dosage: string;
    durationDays: number;
    frequencyPerDay: number;
    mealTiming: string;
  }[];
}
