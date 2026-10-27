export const DATABASE_RESET_PHRASE = 'RESET ALL CLINIC DATA';
export interface DatabaseResetDefaults {
  clinicName: string;
  branchName: string;
  clinicAddress: string;
  administratorEmail: string;
  administratorName: string;
  rooms: string[];
  catalogs: {
    PATIENT_GROUP: string[];
    BILLING_CATEGORY: string[];
    LAB_PANEL: string[];
    SPECIMEN_TYPE: string[];
    INVENTORY_UNIT: string[];
    REFERRAL_DESTINATION: string[];
  };
}
export interface DatabaseResetPreview {
  scope: 'ENTIRE_DATABASE';
  confirmationPhrase: typeof DATABASE_RESET_PHRASE;
  counts: { table: string; rowCount: number }[];
  defaults: DatabaseResetDefaults;
  preserves: string[];
  requiresPassword: true;
}
