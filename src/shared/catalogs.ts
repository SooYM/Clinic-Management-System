export const catalogKinds = [
  'LAB_PANEL',
  'SPECIMEN_TYPE',
  'INVENTORY_UNIT',
  'REFERRAL_DESTINATION',
] as const;
export type CatalogKind = (typeof catalogKinds)[number];
export interface CatalogEntry {
  id: number;
  kind: CatalogKind;
  label: string;
  active: boolean;
  sortOrder: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
