export interface EncounterBillingLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  category: string;
}
/** Signed encounter prices are immutable; null fees identify historical cashier-priced charts. */
export function encounterBillingLines(
  encounter: {
    consultationFeeCents?: number | null;
    procedureFeeCents?: number | null;
    prescriptions: { itemName?: string; quantity: number; unitPriceCents?: number }[];
  },
  categories = { service: 'SERVICE', product: 'PRODUCT' },
): EncounterBillingLine[] | null {
  if (encounter.consultationFeeCents == null || encounter.procedureFeeCents == null) return null;
  return [
    {
      description: 'Consultation fee',
      quantity: 1,
      unitPriceCents: encounter.consultationFeeCents,
      category: categories.service,
    },
    {
      description: 'Procedure fee',
      quantity: 1,
      unitPriceCents: encounter.procedureFeeCents,
      category: categories.service,
    },
    ...encounter.prescriptions.map((rx) => ({
      description: rx.itemName || 'Medication',
      quantity: rx.quantity,
      unitPriceCents: rx.unitPriceCents ?? 0,
      category: categories.product,
    })),
  ];
}
