export interface User {
  id: number;
  name: string;
  role: string;
  branchId: number;
  email: string;
}
export interface Reference {
  id: number;
  name?: string;
  fullName?: string;
  roomNumber?: string;
  branchId?: number;
  branchNumber?: number;
}
export interface Patient {
  id: number;
  name: string;
  nationalId: string;
  patientNumber?: number;
  dateOfBirth: string;
  phone: string;
  email?: string;
  bloodGroup?: string;
  allergies?: string[];
  conditions?: string[];
  sex: 'MALE' | 'FEMALE' | 'OTHER';
  notificationConsent: boolean;
  version: number;
  firstName: string;
  lastName: string;
  nationality: 'MALAYSIAN' | 'NON_MALAYSIAN';
  countryCode?: string | null;
  addressLine1: string;
  addressLine2: string;
  postcode: string;
  city: string;
  state: string;
}
export interface Ticket {
  id: number;
  ticketNumber: string;
  patientId: number;
  patientName?: string;
  status: string;
  roomId?: number;
  roomName?: string;
  practitionerId?: number;
  createdAt: string;
  version: number;
}
export interface Appointment {
  id: number;
  patientId: number;
  patientName?: string;
  practitionerId: number;
  startsAt: string;
  endsAt: string;
  status: string;
  reason?: string;
  version: number;
}
export interface InventoryItem {
  active?: boolean;
  version?: number;
  priceCents?: number;
  id: number;
  name: string;
  sku: string;
  unit: string;
  category?: string;
  ingredient?: string;
  reorderLevel: number;
  quantity?: number;
  stockQuantity?: number;
  onHandQuantity?: number;
  reservedQuantity?: number;
  batches?: { id: number; batchNumber: string; quantity: number; expiresOn: string | null }[];
}
export const queueStates = [
  'REGISTERED',
  'TRIAGE_WAITING',
  'CALLED_TO_ROOM',
  'IN_CONSULTATION',
  'DISPENSARY_WAITING',
  'PAYMENT_WAITING',
  'COMPLETED',
] as const;
export const humanize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
export const money = (value: number) =>
  new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(value);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(value));
