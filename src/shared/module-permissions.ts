export const moduleDefinitions = [
  { id: 'queue', label: 'Clinic overview' },
  { id: 'patients', label: 'Patients' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'clinical', label: 'Clinical workspace' },
  { id: 'inventory', label: 'Dispensary' },
  { id: 'billing', label: 'Billing & payments' },
  { id: 'reports', label: 'Reports & delivery' },
] as const;
export type ModuleId = (typeof moduleDefinitions)[number]['id'];
export const moduleIds = moduleDefinitions.map((module) => module.id);
export const roleIds = ['ADMIN', 'DOCTOR', 'RECEPTIONIST', 'NURSE', 'THERAPIST'] as const;
export type RoleId = (typeof roleIds)[number];
export const defaultRoleModules: Record<RoleId, readonly ModuleId[]> = {
  ADMIN: moduleIds,
  DOCTOR: ['queue', 'patients', 'appointments', 'clinical', 'inventory'],
  RECEPTIONIST: ['queue', 'patients', 'appointments', 'billing', 'reports'],
  NURSE: ['queue', 'patients', 'inventory'],
  THERAPIST: ['queue', 'patients', 'appointments'],
};
