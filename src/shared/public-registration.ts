import type { QueueStatus } from '../domain/models.js';
export const registrationPatientFields = [
  'firstName',
  'lastName',
  'nationality',
  'countryCode',
  'countryName',
  'nationalId',
  'dateOfBirth',
  'sex',
  'addressLine1',
  'addressLine2',
  'postcode',
  'city',
  'state',
  'phone',
  'email',
  'notificationConsent',
] as const;
export type RegistrationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export interface RegistrationReceipt {
  reference: string;
  ticketNumber: string;
  status: RegistrationStatus;
  expiresAt: string;
  branchName: string;
  visitStatus: QueueStatus | 'EXPIRED' | null;
  roomName: string | null;
  receiptToken?: string;
}
