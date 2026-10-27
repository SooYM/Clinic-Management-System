import { publicRegistrationInput } from '../server/public-registration-validation';
import { catalogKinds, defaultBillingCategories, defaultPatientGroups } from '../shared/catalogs';
import { malaysiaDate } from '../shared/clinic-dates';
import { buildDocumentView, type PrescriptionLogEvent } from '../shared/document-view';
import { buildReceiptView } from '../shared/receipt-view';
import { emptyLetterhead, type PrintBranding } from '../shared/letterhead';
import { demoBranding } from './demo-branding';
import {
  expenseCreateInput,
  expenseInput,
  parseAnalyticsRange,
  type AdminAnalytics,
} from '../shared/admin-analytics';
import { encounterBillingLines } from '../shared/encounter-billing';
import { schemas, encounterWriteSchema, validateItemIngredient } from '../server/validation';
import {
  ClinicalEncounter,
  DomainError,
  FefoAllocator,
  Money,
  QueueTicket,
  type QueueStatus,
} from '../domain/models';
import {
  defaultRoleModules,
  moduleDefinitions,
  moduleIds,
  roleIds,
  type RoleId,
} from '../shared/module-permissions';
import { idSchema } from '../shared/identifiers';
import { z } from 'zod';
import { customRoleInput } from '../shared/custom-roles';
import postcodes from '../server/data/postcodes.json';

/** Browser-only simulation. These checks demonstrate workflows, never provide backend security. */
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
type Row = Record<string, any>;
interface State {
  version: 1;
  counters: Record<string, number>;
  userId: number | null;
  rows: Record<string, Row[]>;
  grants: Record<string, string[]>;
}
const key = 'clinic-session-demo-v1';
const defaultDemoPassword = 'demo';
const now = () => new Date().toISOString();
const queueLifetimeMs = 12 * 60 * 60 * 1000;
const queueExpiryTime = (ticket: Row) =>
  Math.min(
    new Date(ticket.createdAt).getTime() + queueLifetimeMs,
    new Date(`${ticket.serviceDate}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000,
  );
const unfinishedQueue = (ticket: Row) =>
  !ticket.expiredAt && !['COMPLETED', 'SKIPPED'].includes(ticket.status);
const activeQueue = (ticket: Row) =>
  unfinishedQueue(ticket) && ticket.serviceDate === today() && queueExpiryTime(ticket) > Date.now();
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const todayFor = (value: string) => malaysiaDate(new Date(value));
const fail = (message: string, status = 422): never => {
  throw new DomainError('DEMO_ERROR', message, status);
};
function sampleCatalogs(): Row[] {
  const choices = [
    ['LAB_PANEL', 'Full Blood Count'],
    ['LAB_PANEL', 'HbA1c'],
    ['LAB_PANEL', 'Renal Profile'],
    ['SPECIMEN_TYPE', 'Blood'],
    ['SPECIMEN_TYPE', 'Urine'],
    ['SPECIMEN_TYPE', 'Swab'],
    ['INVENTORY_UNIT', 'tablet'],
    ['INVENTORY_UNIT', 'capsule'],
    ['INVENTORY_UNIT', 'piece'],
    ['INVENTORY_UNIT', 'box'],
    ['INVENTORY_UNIT', 'unit'],
    ['REFERRAL_DESTINATION', 'Demo Medical Centre – Cardiology'],
    ['REFERRAL_DESTINATION', 'Demo Specialist Clinic – Dermatology'],
  ];
  return [1, 2].flatMap((branchId) =>
    choices.map(([kind, label], index) => ({
      id: (branchId - 1) * choices.length + index + 1,
      tenantId: 1,
      branchId,
      kind,
      label,
      active: true,
      sortOrder: index,
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    })),
  );
}
const stateLabels: Record<string, string> = {
  JOHOR: 'Johor',
  KEDAH: 'Kedah',
  KELANTAN: 'Kelantan',
  MELAKA: 'Melaka',
  NEGERI_SEMBILAN: 'Negeri Sembilan',
  PAHANG: 'Pahang',
  PULAU_PINANG: 'Pulau Pinang',
  PERAK: 'Perak',
  PERLIS: 'Perlis',
  SABAH: 'Sabah',
  SARAWAK: 'Sarawak',
  SELANGOR: 'Selangor',
  TERENGGANU: 'Terengganu',
  WP_KUALA_LUMPUR: 'Wilayah Persekutuan Kuala Lumpur',
  WP_LABUAN: 'Wilayah Persekutuan Labuan',
  WP_PUTRAJAYA: 'Wilayah Persekutuan Putrajaya',
};
function seed(): State {
  const timestamp = now(),
    expiry = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  const nextVisit = new Date(`${today()}T09:30:00+08:00`);
  nextVisit.setUTCDate(nextVisit.getUTCDate() + 1);
  const users = roleIds.map((role, index) => ({
    id: index + 1,
    tenantId: 1,
    branchId: 1,
    branchIds: [1, 2],
    email: `${['admin', 'gp', 'reception', 'nurse', 'therapist', 'cashier'][index]}@example.test`,
    name: [
      'Nur Farah Aziz',
      'Dr. Aiman Hafiz',
      'Aina Sofia',
      'Nur Syafiqah',
      'Kavitha Raman',
      'Mei Tan',
    ][index],
    role,
    isSuperAdmin: role === 'ADMIN',
    licenseNumber: role === 'DOCTOR' ? 'DEMO-NOT-A-LICENSE' : null,
    password: defaultDemoPassword,
    active: true,
    createdAt: timestamp,
  }));
  // Invented identities and reserved example.test contacts; never copied from clinic data.
  const identities = [
    {
      firstName: 'Arjun',
      lastName: 'Nair',
      nationality: 'NON_MALAYSIAN',
      nationalId: 'DEMO-PASSPORT-1',
      dateOfBirth: '1987-11-08',
      sex: 'MALE',
      addressLine1: '18 Jalan Kenanga',
      addressLine2: 'Taman Seri Harmoni',
      postcode: '43000',
      city: 'Kajang',
      state: 'Selangor',
      email: 'arjun@example.test',
      allergies: ['Penicillin'],
      conditions: ['Seasonal allergic rhinitis'],
    },
    {
      firstName: 'Mei Lin',
      lastName: 'Tan',
      nationality: 'NON_MALAYSIAN',
      nationalId: 'DEMO-PASSPORT-2',
      dateOfBirth: '1994-04-12',
      sex: 'FEMALE',
      addressLine1: '7 Jalan Cempaka',
      addressLine2: 'Taman Seri Harmoni',
      postcode: '43000',
      city: 'Kajang',
      state: 'Selangor',
      email: 'meilin@example.test',
      allergies: [],
      conditions: [],
    },
    {
      firstName: 'Amir',
      lastName: 'Hakimi',
      nationality: 'MALAYSIAN',
      nationalId: '900615000001',
      addressLine1: '12 Jalan Meranti',
      addressLine2: 'Taman Bukit Sentosa',
      postcode: '50000',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan Kuala Lumpur',
      email: 'amir@example.test',
      allergies: [],
      conditions: ['Hypertension'],
    },
    {
      firstName: 'Aisyah',
      lastName: 'Rahman',
      nationality: 'MALAYSIAN',
      nationalId: '920320000002',
      addressLine1: '24 Jalan Cempaka',
      addressLine2: 'Taman Seri Murni',
      postcode: '50000',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan Kuala Lumpur',
      email: 'aisyah@example.test',
      allergies: [],
      conditions: [],
    },
  ];
  const patients = identities.map((identity, index) => ({
    id: index + 1,
    patientNumber: index + 1,
    tenantId: 1,
    branchId: 1,
    ...schemas.patient.parse(identity),
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const rows: Record<string, Row[]> = {
    tenants: [
      {
        id: 1,
        tenantNumber: 1,
        name: demoBranding.name,
        letterhead: { ...emptyLetterhead, logoDataUrl: demoBranding.logoDataUrl },
        demoBrandingVersion: 1,
      },
    ],
    branches: [
      {
        id: 1,
        branchNumber: 1,
        tenantId: 1,
        name: 'Kuala Lumpur',
        address: '32 Jalan Seri Harmoni, 50000 Kuala Lumpur (fictional)',
      },
      {
        id: 2,
        branchNumber: 2,
        tenantId: 1,
        name: 'Kajang',
        address: '10 Jalan Kenanga, 43000 Kajang, Selangor (fictional)',
      },
    ],
    users,
    patients,
    catalogs: sampleCatalogs(),
    registrations: [],
    rooms: [
      { id: 1, tenantId: 1, branchId: 1, name: 'Room 01', active: true },
      { id: 2, tenantId: 1, branchId: 1, name: 'Room 02', active: true },
      { id: 3, tenantId: 1, branchId: 2, name: 'Room 01', active: true },
    ],
    inventory: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        name: 'Paracetamol 500mg',
        sku: 'DEMO-PARA',
        ingredient: 'Paracetamol',
        category: 'MEDICATION',
        unit: 'tablet',
        priceCents: 50,
        reorderLevel: 10,
      },
      {
        id: 2,
        tenantId: 1,
        branchId: 1,
        name: 'Amoxicillin 500mg',
        sku: 'DEMO-AMOX',
        ingredient: 'Penicillin;Amoxicillin',
        category: 'MEDICATION',
        unit: 'capsule',
        priceCents: 180,
        reorderLevel: 10,
      },
    ],
    batches: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        itemId: 1,
        batchNumber: 'DEMO-001',
        expiresOn: expiry,
        quantity: 100,
      },
      {
        id: 2,
        tenantId: 1,
        branchId: 1,
        itemId: 2,
        batchNumber: 'DEMO-002',
        expiresOn: expiry,
        quantity: 50,
      },
    ],
    appointments: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        patientId: 3,
        practitionerId: 2,
        roomId: null,
        startsAt: nextVisit.toISOString(),
        endsAt: new Date(nextVisit.getTime() + 1800000).toISOString(),
        reason: 'Blood pressure follow-up',
        status: 'BOOKED',
        version: 1,
        createdAt: timestamp,
      },
    ],
    queue: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        patientId: 3,
        ticketNumber: 'Q-001',
        serviceDate: today(),
        priority: 'NORMAL',
        status: 'REGISTERED',
        expiredAt: null,
        version: 1,
        createdAt: timestamp,
      },
    ],
    encounters: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        practitionerId: 2,
        ...schemas.encounter.parse({
          patientId: 2,
          specialty: 'GP',
          subjective: 'Sore throat and mild discomfort since yesterday.',
          objective: 'Comfortable at rest; no acute distress recorded in this fictional visit.',
          assessment:
            'Upper respiratory symptoms — fictional training record, not a clinical diagnosis.',
          plan: 'Record reviewed and dispensing workflow prepared; public demo contains no treatment advice.',
          vitals: { temperature: 36.8, bloodPressure: '118/76', pulse: 78 },
          prescriptions: [
            {
              itemId: 1,
              quantity: 3,
              dosage: 'Sample dispensing label; no treatment instructions in public demo.',
              durationDays: 3,
              frequencyPerDay: 1,
              mealTiming: 'ANY_TIME',
            },
          ],
          status: 'SIGNED',
        }),
        signedAt: timestamp,
        createdAt: timestamp,
        version: 1,
      },
    ],
    dispenses: [],
    invoices: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        patientId: 1,
        practitionerId: 2,
        invoiceNumber: 'DEMO-INV-001',
        lines: [
          {
            description: 'General practitioner consultation',
            quantity: 1,
            unitPriceCents: 12000,
            category: 'SERVICE',
          },
        ],
        totalCents: 12000,
        payments: [{ method: 'CASH', amountCents: 12000, reference: 'DEMO-NO-REAL-PAYMENT' }],
        idempotencyKey: 'demo-preloaded-invoice',
        requestHash: 'demo-preloaded',
        status: 'PAID',
        createdAt: timestamp,
        version: 1,
      },
    ],
    deposits: [],
    documents: [],
    notifications: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        patientId: 3,
        channel: 'DEMO',
        template: 'BOOKING',
        status: 'UNCONFIGURED',
        attempts: 0,
        lastError: 'Fictional demo notification; never sent.',
        createdAt: timestamp,
        version: 1,
      },
    ],
    reservations: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        encounterId: 1,
        itemId: 1,
        batchId: 1,
        quantity: 3,
        status: 'RESERVED',
        consumedAt: null,
        createdAt: timestamp,
      },
    ],
    usages: [],
    expenses: [],
    medicationDoses: [],
    audit: [],
  };
  for (const branch of rows.branches) {
    branch.active = true;
    branch.version = 1;
  }
  for (const item of rows.inventory) {
    item.active = true;
    item.version = 1;
  }
  for (const encounter of rows.encounters)
    for (const rx of encounter.prescriptions) {
      const item = rows.inventory.find((i) => i.id === rx.itemId);
      Object.assign(rx, { itemName: item?.name, ingredient: item?.ingredient, unit: item?.unit });
    }
  return {
    version: 1,
    counters: Object.fromEntries(
      Object.entries(rows).map(([table, items]) => [table, Math.max(0, ...items.map((i) => i.id))]),
    ),
    userId: null,
    rows,
    grants: {},
  };
}
export class DemoClinic {
  private state: State;
  constructor(private readonly storage: DemoStorage = sessionStorage) {
    try {
      const raw = storage.getItem(key),
        parsed = raw ? JSON.parse(raw) : null;
      const tables = [
        'tenants',
        'branches',
        'users',
        'patients',
        'rooms',
        'inventory',
        'batches',
        'appointments',
        'queue',
        'encounters',
        'dispenses',
        'invoices',
        'deposits',
        'documents',
        'notifications',
        'audit',
      ];
      const valid =
        parsed?.version === 1 &&
        parsed.rows &&
        parsed.counters &&
        parsed.grants &&
        (parsed.userId === null || idSchema.safeParse(parsed.userId).success) &&
        tables.every(
          (table) =>
            Array.isArray(parsed.rows[table]) &&
            Number.isSafeInteger(parsed.counters[table]) &&
            parsed.counters[table] >= 0 &&
            parsed.rows[table].every(
              (row: Row) =>
                row && idSchema.safeParse(row.id).success && row.id <= parsed.counters[table],
            ),
        ) &&
        parsed.rows.users.length > 0 &&
        parsed.rows.users.every(
          (user: Row) =>
            roleIds.includes(user.role) &&
            typeof user.email === 'string' &&
            typeof user.password === 'string' &&
            Array.isArray(user.branchIds) &&
            user.branchIds.every((id: unknown) => idSchema.safeParse(id).success),
        ) &&
        Object.entries(parsed.grants).every(
          ([role, modules]) =>
            roleIds.includes(role as RoleId) &&
            Array.isArray(modules) &&
            modules.every((module) => moduleIds.includes(module)),
        );
      this.state = valid ? parsed : seed();
    } catch {
      this.state = seed();
    }
    const clinic = this.state.rows.tenants[0];
    if (!clinic.demoBrandingVersion) {
      if (clinic.name === 'Klinik Seri Harmoni') clinic.name = demoBranding.name;
      // Preserve settings already changed by someone using an existing demo session.
      clinic.letterhead ??= { ...emptyLetterhead, logoDataUrl: demoBranding.logoDataUrl };
      clinic.demoBrandingVersion = 1;
    }
    // Existing browser sessions retain historical prescriptions without adding retroactive holds.
    for (const patient of this.state.rows.patients) {
      patient.countryCode ??= patient.nationality === 'MALAYSIAN' ? 'MY' : null;
      patient.countryName ??= null;
      patient.patientGroupId ??= null;
    }
    for (const table of [
      'reservations',
      'usages',
      'medicationDoses',
      'registrations',
      'customRoles',
      'expenses',
    ]) {
      this.state.rows[table] ||= [];
      this.state.counters[table] ??= Math.max(0, ...this.state.rows[table].map((r) => r.id));
    }
    if (!this.state.rows.catalogs) {
      this.state.rows.catalogs = sampleCatalogs();
      this.state.counters.catalogs = this.state.rows.catalogs.length;
    }
    for (const branch of this.state.rows.branches) {
      this.ensureBillingCategories(branch.id);
      this.ensurePatientGroups(branch.id);
      branch.publicRegistrationEnabled ??= false;
      branch.publicRegistrationVersion ??= 1;
      branch.active ??= true;
      branch.version ??= 1;
    }
    for (const item of this.state.rows.inventory) {
      item.active ??= true;
      item.version ??= 1;
    }
    for (const ticket of this.state.rows.queue) {
      ticket.expiredAt ??= null;
      ticket.serviceDate ??= todayFor(ticket.createdAt);
      ticket.appointmentId ??= null;
    }
    for (const encounter of this.state.rows.encounters) encounter.deletedAt ??= null;
    for (const user of this.state.rows.users)
      user.isSuperAdmin ??=
        user.role === 'ADMIN' &&
        user.id === 1 &&
        user.email.toLowerCase().replace('@demo.clinic', '@example.test') === 'admin@example.test';
    // Upgrade only unchanged original demo accounts; retain records and user-changed passwords.
    for (const [index, alias] of ['admin', 'gp', 'reception', 'nurse', 'therapist'].entries()) {
      const user = this.state.rows.users.find(
        (row) =>
          row.id === index + 1 &&
          row.role === roleIds[index] &&
          row.email.toLowerCase().replace('@demo.clinic', '@example.test') ===
            `${alias}@example.test`,
      );
      if (user?.password === '00000000000000') user.password = defaultDemoPassword;
    }
  }
  reset() {
    this.storage.removeItem(key);
    this.state = seed();
    for (const branch of this.state.rows.branches) {
      this.ensureBillingCategories(branch.id);
      this.ensurePatientGroups(branch.id);
    }
  }
  private databaseResetDefaults() {
    return {
      clinicName: demoBranding.name,
      branchName: 'Main Branch',
      clinicAddress: 'Kuala Lumpur, Malaysia',
      administratorEmail: 'admin@example.test',
      administratorName: 'Clinic Administrator',
      rooms: ['Room 01', 'Room 02', 'Treatment Room'],
      catalogs: {
        PATIENT_GROUP: [...defaultPatientGroups],
        BILLING_CATEGORY: [...defaultBillingCategories],
        LAB_PANEL: [],
        SPECIMEN_TYPE: [],
        INVENTORY_UNIT: [],
        REFERRAL_DESTINATION: [],
      },
    };
  }
  private resetEntireDatabase(actor: Row) {
    const defaults = this.databaseResetDefaults();
    const counters = { ...this.state.counters };
    const rows: Record<string, Row[]> = Object.fromEntries(
      Object.keys(this.state.rows).map((table) => [table, []]),
    );
    const tenantId = (counters.tenants || 0) + 1;
    counters.tenants = tenantId;
    rows.tenants = [
      {
        id: tenantId,
        tenantNumber: tenantId,
        name: defaults.clinicName,
        letterhead: { ...emptyLetterhead, logoDataUrl: demoBranding.logoDataUrl },
        demoBrandingVersion: 1,
      },
    ];
    this.state = { version: 1, counters, rows, userId: null, grants: {} };
    const branch = this.add(
      'branches',
      { name: defaults.branchName, address: defaults.clinicAddress, active: true },
      0,
    );
    branch.branchId = branch.id;
    branch.branchNumber = branch.id;
    this.ensureBillingCategories(branch.id);
    this.ensurePatientGroups(branch.id);
    const admin = this.add(
      'users',
      {
        name: defaults.administratorName,
        email: defaults.administratorEmail,
        password: defaultDemoPassword,
        role: 'ADMIN',
        isSuperAdmin: true,
        active: true,
        licenseNumber: null,
        branchIds: [branch.id],
      },
      branch.id,
    );
    for (const name of defaults.rooms) this.add('rooms', { name, active: true }, branch.id);
    this.add(
      'audit',
      {
        actorId: admin.id,
        actorName: admin.name,
        action: 'DATABASE_RESET',
        entityType: 'database',
        entityId: null,
        requestId: 'browser-demo',
        metadata: {
          scope: 'ENTIRE_DATABASE',
          resetActor: { id: actor.id, name: actor.name, email: actor.email },
        },
      },
      branch.id,
    );
    return { requiresLogin: true, bootstrapEmail: defaults.administratorEmail };
  }
  private add(table: string, body: Row, branchId: number): Row {
    const id = (this.state.counters[table] || 0) + 1;
    this.state.counters[table] = id;
    const row = {
      ...body,
      id,
      tenantId: this.state.rows.tenants[0].id,
      branchId,
      createdAt: now(),
      version: 1,
    };
    this.state.rows[table].push(row);
    return row;
  }
  private modules(user: Row): string[] {
    return user.role === 'ADMIN'
      ? [...moduleIds]
      : user.customRoleId != null
        ? this.state.rows.customRoles.find((role) => role.id === user.customRoleId)?.modules || []
        : this.state.grants[user.role] || [...defaultRoleModules[user.role as RoleId]];
  }
  private validateCustomRole(role: string, id?: number | null) {
    if (id == null) return;
    if (
      role === 'ADMIN' ||
      !this.state.rows.customRoles.some(
        (row) => row.id === id && row.tenantId === this.actor().tenantId,
      )
    )
      fail('Choose a custom role in your clinic; administrators retain full access.');
  }
  private actor() {
    const user = this.state.rows.users.find((u) => u.id === this.state.userId && u.active);
    if (!user) fail('Choose a demo account to continue.', 401);
    return user!;
  }
  private publicUser(user: Row) {
    const { password, branchIds, ...safe } = user;
    return { ...safe, isSuperAdmin: user.isSuperAdmin === true };
  }
  private scoped(table: string, branch: number) {
    return this.state.rows[table].filter(
      (r) => r.tenantId === this.state.rows.tenants[0].id && r.branchId === branch,
    );
  }
  private expireQueue() {
    let changed = false;
    for (const ticket of this.state.rows.queue) {
      if (
        unfinishedQueue(ticket) &&
        (ticket.serviceDate !== today() || queueExpiryTime(ticket) <= Date.now())
      ) {
        ticket.expiredAt = now();
        ticket.version++;
        this.add(
          'audit',
          {
            actorName: 'Automatic queue expiry',
            action: 'EXPIRE',
            entityType: 'queue',
            entityId: ticket.id,
            requestId: 'browser-demo',
            status: ticket.status,
          },
          ticket.branchId,
        );
        changed = true;
      }
    }
    return changed;
  }
  private visibleQueue(branch: number) {
    return this.scoped('queue', branch).filter((ticket) => ticket.serviceDate === today());
  }
  private consultationTicket(
    ticketId: number,
    patientId: number,
    doctorId: number,
    branch: number,
  ) {
    const ticket = this.record('queue', ticketId, branch);
    if (ticket.expiredAt)
      fail(
        'Queue ticket expired after 12 hours or at clinic midnight. Check the patient in again.',
        409,
      );
    if (ticket.patientId !== patientId) fail('Queue ticket belongs to a different patient.', 409);
    if (ticket.practitionerId !== doctorId) fail('Queue ticket is assigned to another GP.', 403);
    if (!['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(ticket.status))
      fail('Choose an active patient called to your room.', 409);
    return ticket;
  }
  private record(table: string, id: number, branch: number) {
    return (
      this.scoped(table, branch).find(
        (r) => r.id === id && (table !== 'encounters' || !r.deletedAt),
      ) || fail('Record not found in this demo branch.', 404)
    );
  }
  private enrich(row: Row) {
    const patient = this.state.rows.patients.find((p) => p.id === row.patientId),
      doctor = this.state.rows.users.find((u) => u.id === row.practitionerId),
      room = this.state.rows.rooms.find((r) => r.id === row.roomId);
    return {
      ...row,
      ...(patient ? { patientName: patient.name, patientNumber: patient.id } : {}),
      ...(doctor ? { practitionerName: doctor.name } : {}),
      ...(room ? { roomName: room.name } : {}),
    };
  }
  private inventory(branch: number): Row[] {
    return this.scoped('inventory', branch).map((item) => {
      const batches = this.scoped('batches', branch).filter((b) => b.itemId === item.id);
      const eligible = batches.filter((b) =>
        b.expiresOn ? b.expiresOn > today() : item.category !== 'MEDICATION',
      );
      const onHandQuantity = eligible.reduce((sum, b) => sum + b.quantity, 0);
      const reservedQuantity = this.scoped('reservations', branch)
        .filter((r) => !r.consumedAt && eligible.some((b) => b.id === r.batchId))
        .reduce((sum, r) => sum + r.quantity, 0);
      return {
        ...item,
        batches,
        onHandQuantity,
        reservedQuantity,
        stockQuantity: onHandQuantity - reservedQuantity,
      };
    });
  }
  private letterheadSnapshot() {
    return { ...emptyLetterhead, ...this.state.rows.tenants[0].letterhead };
  }
  private printBranding(branch: number): PrintBranding {
    const letterhead = this.letterheadSnapshot();
    const clinicBranch = this.state.rows.branches.find((row) => row.id === branch)!;
    return {
      ...letterhead,
      clinicName: this.state.rows.tenants[0].name,
      branchName: clinicBranch.name,
      clinicAddress: letterhead.address || clinicBranch.address,
    };
  }
  private adminAnalytics(branch: number, range: { from: string; to: string }): AdminAnalytics {
    const inRange = (value: string) => {
      const date = malaysiaDate(new Date(value));
      return date >= range.from && date <= range.to;
    };
    const exact = (value: number) => {
      if (!Number.isSafeInteger(value)) fail('Report exceeds supported numeric range.', 422);
      return value;
    };
    const expenses = this.scoped('expenses', branch).filter(
      (row) => !row.voidedAt && row.paidOn >= range.from && row.paidOn <= range.to,
    );
    const totalExpenseCents = exact(expenses.reduce((sum, row) => sum + row.amountCents, 0));
    const stockPurchaseCents = exact(
      expenses
        .filter((row) => row.category === 'STOCK_PURCHASE')
        .reduce((sum, row) => sum + row.amountCents, 0),
    );
    const invoices = this.scoped('invoices', branch).filter((row) => row.status === 'PAID');
    const collectedCents = exact(
      invoices.reduce(
        (sum, row) =>
          sum +
          (row.payments || [])
            .filter(
              (payment: Row) =>
                ['CASH', 'CARD', 'QR'].includes(payment.method) &&
                inRange(payment.createdAt || row.createdAt),
            )
            .reduce((paid: number, payment: Row) => paid + payment.amountCents, 0),
        0,
      ),
    );
    const groups = new Map<number | null, AdminAnalytics['patientGroups'][number]>();
    for (const patient of this.scoped('patients', branch)) {
      const id = patient.patientGroupId ?? null;
      const value = groups.get(id) || {
        patientGroupId: id,
        label: this.patientWithGroup(patient, branch).patientGroupLabel || 'No group assigned',
        patients: 0,
      };
      value.patients++;
      groups.set(id, value);
    }
    const usage = new Map<number, AdminAnalytics['topUsage'][number]>();
    const addUsage = (
      itemId: number,
      quantity: number,
      type: 'dispensedQuantity' | 'usedQuantity',
    ) => {
      const item = this.scoped('inventory', branch).find((row) => row.id === itemId);
      if (!item || !['MEDICATION', 'CONSUMABLE'].includes(item.category)) return;
      const value = usage.get(itemId) || {
        itemId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        dispensedQuantity: 0,
        usedQuantity: 0,
        totalQuantity: 0,
      };
      value[type] = exact(value[type] + quantity);
      value.totalQuantity = exact(value.dispensedQuantity + value.usedQuantity);
      usage.set(itemId, value);
    };
    for (const dispense of this.scoped('dispenses', branch).filter((row) =>
      inRange(row.createdAt),
    )) {
      const encounter = this.scoped('encounters', branch).find(
        (row) => row.id === dispense.encounterId,
      );
      for (const allocation of dispense.allocations || encounter?.prescriptions || [])
        addUsage(allocation.itemId, allocation.quantity, 'dispensedQuantity');
    }
    for (const row of this.scoped('usages', branch).filter((row) => inRange(row.createdAt)))
      addUsage(row.itemId, row.quantity, 'usedQuantity');
    return {
      ...range,
      collectedCents,
      stockPurchaseCents,
      operatingExpenseCents: exact(totalExpenseCents - stockPurchaseCents),
      totalExpenseCents,
      netCashIncomeCents: exact(collectedCents - totalExpenseCents),
      paidInvoiceCount: invoices.filter((row) => inRange(row.createdAt)).length,
      patientGroups: [...groups.values()].sort(
        (a, b) => b.patients - a.patients || a.label.localeCompare(b.label),
      ),
      topUsage: [...usage.values()]
        .sort((a, b) => b.totalQuantity - a.totalQuantity || a.itemId - b.itemId)
        .slice(0, 10),
    };
  }
  private reserve(encounter: Row, branch: number) {
    for (const supply of encounter.consumables || []) {
      const item = this.record('inventory', supply.itemId, branch);
      if (item.active === false || item.category !== 'CONSUMABLE')
        fail('Choose an active consumable supply.');
      const allocations = FefoAllocator.allocate(
        this.availableBatches(item.id, branch),
        supply.quantity,
        today(),
        true,
      );
      for (const allocation of allocations)
        this.record('batches', allocation.batchId, branch).quantity -= allocation.quantity;
      this.add(
        'usages',
        {
          ...supply,
          encounterId: encounter.id,
          patientId: encounter.patientId,
          practitionerId: encounter.practitionerId,
          allocations,
        },
        branch,
      );
    }
    for (const rx of encounter.prescriptions) {
      const allocations = FefoAllocator.allocate(
        this.availableBatches(rx.itemId, branch),
        rx.quantity,
        today(),
      );
      for (const a of allocations)
        this.add(
          'reservations',
          {
            encounterId: encounter.id,
            itemId: rx.itemId,
            batchId: a.batchId,
            quantity: a.quantity,
            consumedAt: null,
            status: 'RESERVED',
          },
          branch,
        );
    }
  }
  private advanceSignedConsultation(encounter: Row, branch: number, actorName: string) {
    if (!encounter.queueTicketId) return;
    const ticket = this.scoped('queue', branch).find((row) => row.id === encounter.queueTicketId);
    if (
      !ticket ||
      !activeQueue(ticket) ||
      ticket.patientId !== encounter.patientId ||
      ticket.practitionerId !== encounter.practitionerId ||
      ticket.status !== 'IN_CONSULTATION'
    )
      return;
    const prior = ticket.status;
    ticket.status = new QueueTicket(ticket.status as QueueStatus).transition(
      encounter.prescriptions.length ? 'DISPENSARY_WAITING' : 'PAYMENT_WAITING',
    );
    ticket.version++;
    this.add(
      'audit',
      {
        actorName,
        action: 'SIGN_CONSULTATION',
        entityType: 'queue',
        entityId: ticket.id,
        requestId: 'browser-demo',
        from: prior,
        to: ticket.status,
      },
      branch,
    );
  }
  private availableBatches(itemId: number, branch: number) {
    return this.scoped('batches', branch)
      .filter((b) => b.itemId === itemId)
      .map((b) => ({
        id: b.id,
        quantity:
          b.quantity -
          this.scoped('reservations', branch)
            .filter((r) => !r.consumedAt && r.batchId === b.id)
            .reduce((sum, r) => sum + r.quantity, 0),
        expires_on: b.expiresOn,
      }));
  }
  private advanceVisit(
    encounter: Row,
    branch: number,
    actorName: string,
    from: QueueStatus,
    to: QueueStatus,
    action: string,
  ) {
    const ticket = this.scoped('queue', branch).find((row) => row.id === encounter.queueTicketId);
    if (
      !ticket ||
      !activeQueue(ticket) ||
      ticket.status !== from ||
      ticket.patientId !== encounter.patientId ||
      ticket.practitionerId !== encounter.practitionerId
    )
      return;
    ticket.status = new QueueTicket(ticket.status as QueueStatus).transition(to);
    ticket.version++;
    if (to === 'COMPLETED') ticket.completedAt = now();
    this.add(
      'audit',
      {
        actorName,
        action,
        entityType: 'queue',
        entityId: ticket.id,
        requestId: 'browser-demo',
        from,
        to,
      },
      branch,
    );
  }
  private notice(patient: Row, template: string, branch: number) {
    if (patient.notificationConsent)
      this.add(
        'notifications',
        {
          patientId: patient.id,
          patientName: patient.name,
          template,
          channel: 'DEMO',
          status: 'UNCONFIGURED',
          lastError: 'Browser demo never sends messages.',
          attempts: 0,
        },
        branch,
      );
  }
  async request(
    path: string,
    method = 'GET',
    body: any = undefined,
    branchId?: number,
  ): Promise<any> {
    // Expiry is a lifecycle change, retained even when the requested action fails.
    const receiptRead =
      method.toUpperCase() === 'GET' && /^\/public\/registration\/receipts\//.test(path);
    if (!receiptRead && this.expireQueue()) this.storage.setItem(key, JSON.stringify(this.state));
    if (this.expireRegistrations()) this.storage.setItem(key, JSON.stringify(this.state));
    const previous = structuredClone(this.state);
    try {
      const response = this.dispatch(path, method.toUpperCase(), body, branchId);
      if (path === '/admin/registration-settings' && response.url)
        response.qrCodeDataUrl = await (await import('qrcode')).default.toDataURL(response.url);
      if (method.toUpperCase() !== 'GET') {
        this.storage.setItem(key, JSON.stringify(this.state));
      }
      return structuredClone(response);
    } catch (error) {
      this.state = previous;
      throw error;
    }
  }
  private dispatch(path: string, method: string, body: any, branchId?: number): any {
    const url = new URL(path, 'https://demo.invalid'),
      route = url.pathname;
    if (route === '/public/branding' && method === 'GET') {
      const clinic = this.state.rows.tenants[0];
      return { name: clinic.name, logoDataUrl: this.letterheadSnapshot().logoDataUrl };
    }
    if (route.startsWith('/public/registration')) {
      const receiptMatch = route.match(/^\/public\/registration\/receipts\/([a-f0-9]{64})$/);
      if (receiptMatch && method === 'GET') {
        const row =
          this.state.rows.registrations.find((r) => r.receiptToken === receiptMatch[1]) ||
          fail('Registration receipt not found.', 404);
        return this.registrationReceipt(row);
      }
      const match = route.match(
        /^\/public\/registration\/branches\/(\d+)(?:\/postcodes\/(\d{5}))?$/,
      );
      if (!match) fail('Registration route not found.', 404);
      const publicBranch =
        this.state.rows.branches.find((b) => b.id === Number(match![1]) && b.active) ||
        fail('Registration branch unavailable.', 404);
      if (method === 'GET' && !match![2])
        return {
          branch: {
            id: publicBranch.id,
            name: publicBranch.name,
            clinicName: this.state.rows.tenants[0].name,
          },
          enabled: Boolean(publicBranch.publicRegistrationEnabled),
        };
      if (!publicBranch.publicRegistrationEnabled) fail('Public registration is unavailable.', 404);
      if (method === 'GET' && match![2])
        return {
          data: ((postcodes as Record<string, string[][]>)[match![2]] || []).map(
            ([city, state]) => ({ postcode: match![2], city, state: stateLabels[state] || state }),
          ),
        };
      if (method !== 'POST' || match![2]) fail('Registration route not found.', 404);
      const input = publicRegistrationInput.parse(body),
        requestHash = JSON.stringify(input);
      const prior = this.scoped('registrations', publicBranch.id).find(
        (r) => r.submissionKey === input.submissionKey,
      );
      if (prior) {
        if (prior.requestHash !== requestHash) fail('Submission key has already been used.', 409);
        return { ...this.registrationReceipt(prior), receiptToken: prior.receiptToken };
      }
      const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
      const row = this.add(
        'registrations',
        {
          reference: 'REG-' + crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(),
          submissionKey: input.submissionKey,
          requestHash,
          receiptToken: token,
          ticketNumber: this.nextQueueNumber(publicBranch.id),
          serviceDate: today(),
          payload: input.patient,
          status: 'PENDING',
          expiresAt: new Date(
            Math.min(
              Date.now() + 12 * 3600000,
              new Date(today() + 'T00:00:00+08:00').getTime() + 24 * 3600000,
            ),
          ).toISOString(),
        },
        publicBranch.id,
      );
      return { ...this.registrationReceipt(row), receiptToken: token };
    }
    if (route.startsWith('/public/display')) {
      if (method !== 'GET') fail('Public display is read-only.', 404);
      const branches = this.state.rows.branches
        .filter(
          (row) =>
            row.active && this.state.rows.tenants.some((tenant) => tenant.id === row.tenantId),
        )
        .map((row) => ({
          id: row.id,
          name: row.name,
          clinicName: this.state.rows.tenants.find((tenant) => tenant.id === row.tenantId)!.name,
        }))
        .sort((left, right) => left.id - right.id);
      if (route === '/public/display/branches') return { data: branches };
      if (route === '/public/display/queue') {
        const parsed = idSchema.safeParse(url.searchParams.get('branchId'));
        if (!parsed.success) fail('Choose a valid branch.', 400);
        const branch =
          branches.find((row) => row.id === parsed.data) || fail('Branch unavailable.', 404);
        const source = this.state.rows.branches.find((row) => row.id === branch.id)!;
        return {
          branch,
          data: this.state.rows.queue
            .filter(
              (ticket) =>
                ticket.branchId === branch.id &&
                ticket.tenantId === source.tenantId &&
                activeQueue(ticket) &&
                ['REGISTERED', 'TRIAGE_WAITING', 'CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(
                  ticket.status,
                ),
            )
            .sort((left, right) => left.id - right.id)
            .map((ticket) => ({
              ticketNumber: ticket.ticketNumber,
              status: ticket.status,
              roomName:
                this.state.rows.rooms.find(
                  (room) =>
                    room.id === ticket.roomId &&
                    room.branchId === branch.id &&
                    room.tenantId === source.tenantId,
                )?.name || null,
            })),
        };
      }
      fail('Public display route not found.', 404);
    }
    if (route === '/auth/login' && method === 'POST') {
      const user = this.state.rows.users.find(
        (u) =>
          u.email.toLowerCase().replace('@demo.clinic', '@example.test') ===
            String(body?.email).toLowerCase().replace('@demo.clinic', '@example.test') &&
          u.password === body?.password &&
          u.active,
      );
      if (!user) fail('Use a listed demo account and demo password.', 401);
      this.state.userId = user!.id;
      return {
        user: this.publicUser(user!),
        branchId: user!.branchId,
        csrfToken: 'demo-no-real-session',
        modules: this.modules(user!),
      };
    }
    if (route === '/auth/logout') {
      this.state.userId = null;
      return {};
    }
    if (route.startsWith('/verify/'))
      fail('Demo certificates are not signed or verifiable. Use the MySQL application.', 503);
    const user = this.actor(),
      branch = idSchema.parse(branchId ?? url.searchParams.get('branchId') ?? user.branchId);
    if (
      !user.branchIds.includes(branch) ||
      !this.state.rows.branches.some((b) => b.id === branch && b.active)
    )
      fail('This demo account has no access to that branch.', 403);
    const modules = this.modules(user);
    if (/^\/deposits(?:\/|$)/.test(route) || /^\/patients\/[^/]+\/deposit-balance$/.test(route))
      fail('Patient deposits have been removed from active billing.', 410);
    if (/^\/(packages|commissions|photos)(\/|$)/.test(route)) fail('Feature retired.', 410);
    if (route.startsWith('/admin/') && user.role !== 'ADMIN')
      fail('Demo administration requires administrator role.', 403);
    const module = /^\/encounters\/\d+\/medicine-labels$/.test(route)
      ? 'inventory'
      : /^\/encounters\/\d+\/prescription-log$/.test(route)
        ? modules.includes('clinical')
          ? 'clinical'
          : 'inventory'
        : /deposit-balance$/.test(route)
          ? 'billing'
          : /^\/patients\/\d+\/encounters$/.test(route)
            ? 'clinical'
            : /^\/(queue|dashboard)(\/|$)/.test(route)
              ? 'queue'
              : /^\/patients(\/|$)/.test(route)
                ? 'patients'
                : /^\/appointments(\/|$)/.test(route)
                  ? 'appointments'
                  : /^\/(encounters|documents|clinical)(\/|$)/.test(route)
                    ? 'clinical'
                    : /^\/(inventory|dispensary|dispenses)(\/|$)/.test(route)
                      ? 'inventory'
                      : /^\/(invoices|deposits|billing)(\/|$)/.test(route)
                        ? 'billing'
                        : /^\/(notifications|reports)(\/|$)/.test(route)
                          ? 'reports'
                          : undefined;
    if (module && !modules.includes(module as any))
      fail('This demo role has no access to that module.', 403);
    if (route === '/admin/analytics' && method === 'GET') {
      return this.adminAnalytics(branch, parseAnalyticsRange(Object.fromEntries(url.searchParams)));
    }
    if (route === '/admin/expenses' || /^\/admin\/expenses\/\d+$/.test(route)) {
      const view = (row: Row) => ({
        id: row.id,
        paidOn: row.paidOn,
        category: row.category,
        description: row.description,
        amountCents: row.amountCents,
        reference: row.reference,
        version: row.version,
        voidedAt: row.voidedAt,
      });
      const auditExpense = (action: string, row: Row, before?: Row) =>
        this.add(
          'audit',
          {
            actorId: user.id,
            actorName: user.name,
            action,
            entityType: 'expense',
            entityId: row.id,
            requestId: 'browser-demo',
            metadata: { before: before ? view(before) : null, after: view(row) },
          },
          branch,
        );
      const expenseId = route.match(/^\/admin\/expenses\/(\d+)$/)?.[1];
      if (method === 'GET' && !expenseId) {
        const beforeId = url.searchParams.get('beforeId');
        const query = Object.fromEntries(url.searchParams);
        delete query.beforeId;
        const range = parseAnalyticsRange(query);
        const before = beforeId ? idSchema.parse(beforeId) : undefined;
        return {
          data: this.scoped('expenses', branch)
            .filter(
              (row) =>
                !row.voidedAt &&
                row.paidOn >= range.from &&
                row.paidOn <= range.to &&
                (!before || row.id < before),
            )
            .sort((a, b) => b.id - a.id)
            .slice(0, 200)
            .map(view),
        };
      }
      if (method === 'POST' && !expenseId) {
        const { idempotencyKey, ...value } = expenseCreateInput.parse(body);
        const hash = JSON.stringify(value);
        const previous = this.scoped('expenses', branch).find(
          (row) => row.idempotencyKey === idempotencyKey,
        );
        if (previous) {
          if (previous.requestHash !== hash)
            fail('This expense key already records different details.', 409);
          return view(previous);
        }
        const created = this.add(
          'expenses',
          {
            ...value,
            idempotencyKey,
            requestHash: hash,
            actorId: user.id,
            voidedAt: null,
            updatedAt: now(),
          },
          branch,
        );
        auditExpense('EXPENSE_CREATED', created);
        return view(created);
      }
      if (expenseId && (method === 'PUT' || method === 'DELETE')) {
        const row = this.record('expenses', idSchema.parse(expenseId), branch);
        const input =
          method === 'PUT'
            ? expenseInput.extend({ version: z.number().int().positive() }).parse(body)
            : z.object({ version: z.number().int().positive() }).strict().parse(body);
        if (row.voidedAt || row.version !== input.version)
          fail('Expense changed or was already voided. Refresh before saving.', 409);
        const before = structuredClone(row);
        if (method === 'DELETE') {
          row.voidedAt = now();
          row.updatedAt = now();
          row.version++;
          auditExpense('EXPENSE_VOIDED', row, before);
          return { id: row.id, voided: true };
        }
        Object.assign(row, input, { version: row.version + 1, updatedAt: now(), actorId: user.id });
        auditExpense('EXPENSE_UPDATED', row, before);
        return view(row);
      }
      fail('Expense route not found.', 404);
    }
    const foundId = route.match(/^\/(?:admin\/)?[^/]+\/(\d+)(?:\/|$)/),
      id = foundId ? idSchema.parse(foundId[1]) : undefined;
    if (
      method !== 'GET' &&
      !route.startsWith('/auth/') &&
      route !== '/admin/database-reset' &&
      !(method === 'DELETE' && /^\/encounters\/\d+$/.test(route))
    )
      this.add(
        'audit',
        {
          actorName: user.name,
          action: method,
          entityType: route.split('/')[1],
          entityId: id || null,
          requestId: 'browser-demo',
        },
        branch,
      );
    if (route === '/admin/registration-settings') {
      if (user.role !== 'ADMIN') fail('Only administrators can configure registration.', 403);
      const current = this.state.rows.branches.find((b) => b.id === branch)!;
      if (method === 'PUT') {
        const input = z
          .object({ enabled: z.boolean(), version: z.number().int().positive() })
          .strict()
          .parse(body);
        if (input.version !== (current.publicRegistrationVersion || 1))
          fail('Settings changed. Refresh before saving.', 409);
        current.publicRegistrationEnabled = input.enabled;
        current.publicRegistrationVersion = (current.publicRegistrationVersion || 1) + 1;
      } else if (method !== 'GET') fail('Route not found.', 404);
      return {
        enabled: Boolean(current.publicRegistrationEnabled),
        version: current.publicRegistrationVersion || 1,
        branchId: branch,
        branchName: current.name,
        url: new URL(
          '/register?branchId=' + branch,
          typeof location === 'undefined' ? 'https://demo.invalid' : location.origin,
        ).href,
        qrCodeDataUrl: '',
        mobileReady: false,
        simulated: true,
      };
    }
    if (route === '/registrations' || /^\/registrations\/\d+\/(confirm|reject)$/.test(route)) {
      if (!modules.includes('patients') || !modules.includes('queue'))
        fail('Registration review requires patient and queue access.', 403);
      if (method === 'GET' && route === '/registrations')
        return {
          data: this.scoped('registrations', branch)
            .filter((r) => r.status === 'PENDING')
            .map((r) => {
              const match = this.state.rows.patients.find(
                (p) => p.tenantId === user.tenantId && p.nationalId === r.payload.nationalId,
              );
              return {
                id: r.id,
                reference: r.reference,
                ticketNumber: r.ticketNumber,
                patient: r.payload,
                version: r.version,
                createdAt: r.createdAt,
                expiresAt: r.expiresAt,
                possibleMatch:
                  match && match.branchId === branch
                    ? {
                        id: match.id,
                        name: match.name,
                        nationalId: match.nationalId,
                        phone: match.phone,
                      }
                    : null,
                identityConflict: Boolean(match && match.branchId !== branch),
              };
            }),
        };
      const row = this.record('registrations', id!, branch);
      if (route.endsWith('/reject') && method === 'POST') {
        const input = z
          .object({
            version: z.number().int().positive(),
            reason: z.string().trim().max(500).optional(),
          })
          .strict()
          .parse(body);
        if (row.status !== 'PENDING' || row.version !== input.version)
          fail('Registration changed.', 409);
        Object.assign(row, { status: 'REJECTED', payload: null, version: row.version + 1 });
        return { id: row.id, status: row.status, version: row.version };
      }
      if (!route.endsWith('/confirm') || method !== 'POST') fail('Route not found.', 404);
      const input = z
        .object({
          version: z.number().int().positive(),
          identityVerified: z.literal(true),
          existingPatientId: idSchema.optional(),
        })
        .strict()
        .parse(body);
      const decisionHash = JSON.stringify({ existingPatientId: input.existingPatientId ?? null });
      if (row.status === 'ACCEPTED' && row.decisionHash === decisionHash)
        return {
          id: row.id,
          status: row.status,
          ticketNumber: row.ticketNumber,
          patientId: row.patientId,
          version: row.version,
        };
      if (row.status !== 'PENDING' || row.version !== input.version)
        fail('Registration changed or expired.', 409);
      const match = this.state.rows.patients.find(
        (p) => p.tenantId === user.tenantId && p.nationalId === row.payload.nationalId,
      );
      if (match && (match.branchId !== branch || match.id !== input.existingPatientId))
        fail('Verify existing patient with reception.', 409);
      if (!match && input.existingPatientId) fail('Selected patient does not match identity.', 409);
      const patient = match || this.dispatch('/patients', 'POST', row.payload, branch);
      const queue = this.dispatch(
        '/queue',
        'POST',
        { patientId: patient.id, priority: 'NORMAL' },
        branch,
      );
      const saved = this.state.rows.queue.find((q) => q.id === queue.id)!;
      saved.ticketNumber = row.ticketNumber;
      Object.assign(row, {
        status: 'ACCEPTED',
        payload: null,
        patientId: patient.id,
        queueTicketId: queue.id,
        decisionHash,
        version: row.version + 1,
      });
      return {
        id: row.id,
        status: row.status,
        ticketNumber: row.ticketNumber,
        patientId: patient.id,
        version: row.version,
      };
    }
    if (route === '/auth/me')
      return {
        user: this.publicUser(user),
        branchId: branch,
        csrfToken: 'demo-no-real-session',
        modules,
      };
    if (route === '/admin/database-reset/preview' && method === 'GET') {
      if (user.isSuperAdmin !== true)
        fail('SuperAdmin privilege is required to reset the entire database.', 403);
      return {
        scope: 'ENTIRE_DATABASE',
        confirmationPhrase: 'RESET ALL CLINIC DATA',
        counts: Object.entries(this.state.rows).map(([table, rows]) => ({
          table,
          rowCount: rows.length,
        })),
        defaults: this.databaseResetDefaults(),
        preserves: ['schema_migrations', 'auto_increment_sequences'],
        requiresPassword: true,
      };
    }
    if (route === '/admin/database-reset' && method === 'POST') {
      if (user.isSuperAdmin !== true)
        fail('SuperAdmin privilege is required to reset the entire database.', 403);
      const input = z
        .object({
          confirmationPhrase: z.literal('RESET ALL CLINIC DATA'),
          currentPassword: z.string().min(1),
          acknowledge: z.literal(true),
        })
        .strict()
        .parse(body);
      if (input.currentPassword !== user.password) fail('Current password is incorrect.', 403);
      return this.resetEntireDatabase(user);
    }
    if (route === '/bootstrap')
      return {
        tenant: {
          id: this.state.rows.tenants[0].id,
          tenantNumber: this.state.rows.tenants[0].tenantNumber,
          name: this.state.rows.tenants[0].name,
          logoDataUrl: this.letterheadSnapshot().logoDataUrl,
        },
        user: this.publicUser(user),
        branchId: branch,
        branches: this.state.rows.branches.filter((b) => b.active && user.branchIds.includes(b.id)),
        rooms: this.scoped('rooms', branch).filter((r) => r.active),
        practitioners: this.state.rows.users
          .filter((u) => u.active && u.role === 'DOCTOR' && u.branchIds.includes(branch))
          .map((u) => this.publicUser(u)),
        modules,
      };
    if (route === '/references/branches' && method === 'GET')
      return {
        data: this.state.rows.branches.filter((b) => b.active && user.branchIds.includes(b.id)),
      };
    if (route === '/auth/change-password') {
      if (user.password !== body.currentPassword) fail('Current demo password is incorrect.', 401);
      if (typeof body.newPassword !== 'string' || body.newPassword.length < 14)
        fail('Use at least 14 characters.');
      user.password = body.newPassword;
      this.state.userId = null;
      return { message: 'Demo password changed in this browser tab only.' };
    }
    if (route === '/dashboard')
      return {
        patients: this.scoped('patients', branch).length,
        waiting: this.scoped('queue', branch).filter(activeQueue).length,
        encountersToday: this.scoped('encounters', branch).filter(
          (encounter) => !encounter.deletedAt,
        ).length,
        revenueCents: this.scoped('invoices', branch).reduce((sum, i) => sum + i.totalCents, 0),
      };
    if (route === '/references/patients') {
      if (
        !modules.some((m) =>
          ['queue', 'patients', 'appointments', 'clinical', 'billing'].includes(m),
        )
      )
        fail('Patient selector access denied.', 403);
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return {
        data: this.scoped('patients', branch)
          .slice()
          .sort((a, b) => a.id - b.id)
          .filter((p) =>
            [p.name, p.nationalId, p.phone].some((v) => v.toLowerCase().includes(search)),
          )
          .map((p) => ({
            id: p.id,
            patientNumber: p.id,
            name: p.name,
            nationalId: p.nationalId,
            phone: p.phone,
            patientGroupId: p.patientGroupId ?? null,
            patientGroupLabel: this.patientWithGroup(p, branch).patientGroupLabel || null,
          })),
      };
    }
    if (
      route === '/references/catalogs' ||
      route === '/admin/catalogs' ||
      /^\/admin\/catalogs\/\d+$/.test(route)
    ) {
      const kind = url.searchParams.get('kind');
      if (
        route === '/references/catalogs' &&
        (!kind || !catalogKinds.some((value) => value === kind))
      )
        fail('Select a valid choice list.');
      if (
        route === '/references/catalogs' &&
        !modules.includes(
          kind === 'PATIENT_GROUP'
            ? 'patients'
            : kind === 'BILLING_CATEGORY'
              ? 'billing'
              : kind === 'INVENTORY_UNIT'
                ? 'inventory'
                : 'clinical',
        )
      )
        fail('Choice list access denied.', 403);
      if (method === 'GET')
        return {
          data: this.scoped('catalogs', branch)
            .filter((c) => (!kind || c.kind === kind) && (route === '/admin/catalogs' || c.active))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
        };
      if (user.role !== 'ADMIN') fail('Only administrators can edit choices.', 403);
      const label = String(body.label || '').trim();
      const labelKind = id ? this.record('catalogs', id, branch).kind : body.kind;
      if (
        label.length >
        (labelKind === 'INVENTORY_UNIT' ? 50 : labelKind === 'SPECIMEN_TYPE' ? 100 : 200)
      )
        fail('Choice label is too long.');
      if (
        !label ||
        label.length > 200 ||
        !Number.isInteger(body.sortOrder ?? 0) ||
        (body.sortOrder ?? 0) < 0 ||
        (body.sortOrder ?? 0) > 1000000 ||
        (body.active !== undefined && typeof body.active !== 'boolean')
      )
        fail('Use a label up to 200 characters and a valid display order.');
      const existing = id ? this.record('catalogs', id, branch) : undefined;
      const entryKind = existing?.kind || body.kind;
      if (!catalogKinds.some((value) => value === entryKind)) fail('Select a valid choice list.');
      if (
        this.scoped('catalogs', branch).some(
          (c) =>
            c.id !== id && c.kind === entryKind && c.label.toLowerCase() === label.toLowerCase(),
        )
      )
        fail('This choice already exists.', 409);
      if (existing) {
        if (existing.version !== body.version) fail('Choice changed; refresh before saving.', 409);
        Object.assign(existing, {
          label,
          sortOrder: body.sortOrder ?? 0,
          active: body.active ?? true,
          version: existing.version + 1,
          updatedAt: now(),
        });
        return existing;
      }
      return this.add(
        'catalogs',
        {
          kind: entryKind,
          billingDefault: null,
          label,
          sortOrder: body.sortOrder ?? 0,
          active: body.active ?? true,
          updatedAt: now(),
        },
        branch,
      );
    }
    if (/^\/admin\/inventory\/\d+$/.test(route) && method === 'PUT') {
      const item = this.record('inventory', id!, branch);
      const { active, version, ...fields } = body;
      const value = schemas.item.parse(fields);
      if (!(
        item.category === 'MEDICATION' &&
        !item.ingredient.trim() &&
        value.category === item.category &&
        value.ingredient === item.ingredient
      ))
        validateItemIngredient(value);
      if (typeof active !== 'boolean' || version !== item.version)
        fail('Inventory item changed; refresh before saving.', 409);
      if (this.scoped('inventory', branch).some((i) => i.id !== item.id && i.sku === value.sku))
        fail('SKU already exists.', 409);
      const used =
        this.scoped('batches', branch).some((b) => b.itemId === item.id) ||
        this.scoped('encounters', branch).some((e) =>
          e.prescriptions.some((rx: Row) => rx.itemId === item.id),
        );
      if (
        used &&
        (value.category !== item.category ||
          value.unit !== item.unit ||
          value.ingredient !== item.ingredient)
      )
        fail(
          'Category, ingredient and unit cannot change after stock or prescribing history.',
          409,
        );
      Object.assign(item, value, { active, version: item.version + 1 });
      return item;
    }
    if (route === '/references/medications' || route === '/references/consumables') {
      if (!modules.some((m) => ['clinical', 'inventory'].includes(m)))
        fail('Medication selector access denied.', 403);
      return {
        data: this.inventory(branch)
          .filter(
            (i) =>
              [i.name, i.sku, i.ingredient]
                .join(' ')
                .toLowerCase()
                .includes((url.searchParams.get('search') || '').toLowerCase()) &&
              i.category === (route === '/references/consumables' ? 'CONSUMABLE' : 'MEDICATION') &&
              (i.active !== false || url.searchParams.get('includeInactive') === '1'),
          )
          .map(
            ({
              id,
              name,
              ingredient,
              unit,
              category,
              priceCents,
              active,
              onHandQuantity,
              reservedQuantity,
              stockQuantity,
            }) => ({
              active,
              id,
              name,
              ingredient,
              unit,
              category,
              priceCents,
              onHandQuantity,
              reservedQuantity,
              stockQuantity,
            }),
          ),
      };
    }
    if (route.startsWith('/references/postcodes/')) {
      if (!modules.includes('patients')) fail('Patient access denied.', 403);
      const postcode = route.split('/').at(-1)!;
      if (!/^\d{5}$/.test(postcode)) fail('Use a five-digit postcode.', 400);
      const table = postcodes as Record<string, string[][]>;
      return {
        data: (Object.hasOwn(table, postcode) ? table[postcode] : []).map(([city, state]) => ({
          postcode,
          city,
          state: stateLabels[state] || state,
        })),
      };
    }
    if (/^\/clinical\/patients\//.test(route)) {
      const p = this.record('patients', idSchema.parse(route.split('/').at(-1)), branch);
      return Object.fromEntries(
        [
          'id',
          'patientNumber',
          'name',
          'firstName',
          'lastName',
          'nationalId',
          'dateOfBirth',
          'sex',
          'bloodGroup',
          'allergies',
          'conditions',
        ].map((k) => [k, p[k]]),
      );
    }
    if (/^\/patients\/\d+\/encounters$/.test(route)) {
      this.record('patients', id!, branch);
      return {
        data: this.scoped('encounters', branch)
          .filter((e) => e.patientId === id && !e.deletedAt)
          .map((e) => this.enrich(e)),
        nextCursor: null,
      };
    }
    if (route === '/patients' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return {
        data: this.scoped('patients', branch)
          .slice()
          .sort((a, b) => a.id - b.id)
          .filter((p) =>
            [p.name, p.nationalId, p.phone].some((v) => v.toLowerCase().includes(search)),
          )
          .map((patient) => this.patientWithGroup(patient, branch)),
      };
    }
    if (/^\/patients\/\d+$/.test(route) && method === 'GET')
      return this.patientWithGroup(this.record('patients', id!, branch), branch);
    if (
      (route === '/patients' && method === 'POST') ||
      (/^\/patients\/\d+$/.test(route) && method === 'PUT')
    ) {
      const previous = id ? this.record('patients', id, branch) : undefined;
      const value = schemas.patient.parse({
        ...body,
        patientGroupId:
          body.patientGroupId === undefined
            ? (previous?.patientGroupId ?? null)
            : body.patientGroupId,
        countryCode:
          body.countryCode === undefined
            ? body.nationality === 'NON_MALAYSIAN' && previous?.countryCode === 'MY'
              ? null
              : previous?.countryCode
            : body.countryCode,
        countryName:
          body.countryCode === undefined && body.countryName === undefined
            ? previous?.countryName
            : body.countryName,
      });
      if (value.patientGroupId != null) {
        const group = this.scoped('catalogs', branch).find(
          (entry) => entry.id === value.patientGroupId && entry.kind === 'PATIENT_GROUP',
        );
        if (!group || (!group.active && value.patientGroupId !== previous?.patientGroupId))
          fail('Choose an active patient group from this branch.');
      }
      const choices = (postcodes as Record<string, string[][]>)[value.postcode] || [];
      if (choices.length === 1) {
        const [city, code] = choices[0],
          state = stateLabels[code] || code;
        if (
          (!value.city || value.city.toLowerCase() === city.toLowerCase()) &&
          (!value.state || value.state.toLowerCase() === state.toLowerCase())
        ) {
          value.city = value.city || city;
          value.state = value.state || state;
        }
      }
      if (
        this.scoped('patients', branch).some(
          (p) => p.nationalId === value.nationalId && p.id !== id,
        )
      )
        fail('National identifier already registered.', 409);
      if (id) {
        const p = this.record('patients', id, branch);
        if (p.version !== value.version) fail('Patient changed. Refresh before saving.', 409);
        if (value.countryCode === undefined)
          value.countryCode =
            value.nationality === 'NON_MALAYSIAN' && p.countryCode === 'MY' ? null : p.countryCode;
        Object.assign(p, value, { version: p.version + 1, updatedAt: now() });
        return this.patientWithGroup(p, branch);
      }
      const p = this.add(
        'patients',
        {
          ...value,
          countryCode: value.countryCode ?? null,
          countryName: value.countryName ?? null,
        },
        branch,
      );
      p.patientNumber = p.id;
      return this.patientWithGroup(p, branch);
    }
    if (/^\/encounters\/\d+$/.test(route) && method === 'GET')
      return this.enrich(this.record('encounters', id!, branch));
    if (/^\/encounters\/\d+$/.test(route) && method === 'DELETE') {
      if (user.role !== 'DOCTOR')
        fail('Only the attending GP can remove a draft consultation.', 403);
      const value = z.object({ version: z.number().int().positive() }).strict().parse(body);
      const encounter = this.record('encounters', id!, branch);
      if (encounter.practitionerId !== user.id)
        fail('Only the attending GP can remove this draft.', 403);
      if (encounter.status !== 'DRAFT') fail('Signed consultations cannot be removed.', 409);
      if (encounter.version !== value.version)
        fail('Consultation changed; refresh before removing.', 409);
      if (
        ['reservations', 'dispenses', 'documents', 'medicationDoses', 'packages', 'photos'].some(
          (table) =>
            (this.state.rows[table] || []).some(
              (row) =>
                row.tenantId === user.tenantId &&
                row.branchId === branch &&
                row.encounterId === encounter.id,
            ),
        )
      )
        fail('Draft has recorded clinical or stock history and cannot be removed.', 409);
      encounter.deletedAt = now();
      encounter.version++;
      this.add(
        'audit',
        {
          actorName: user.name,
          action: 'REMOVE',
          entityType: 'encounters',
          entityId: encounter.id,
          requestId: 'browser-demo',
        },
        branch,
      );
      return { id: encounter.id, deletedAt: encounter.deletedAt, version: encounter.version };
    }
    if (route === '/appointments' && method === 'POST') {
      const v = schemas.appointment.parse(body);
      this.record('patients', v.patientId, branch);
      this.doctor(v.practitionerId, branch);
      if (
        this.scoped('appointments', branch).some(
          (a) =>
            ['BOOKED', 'CHECKED_IN'].includes(a.status) &&
            a.practitionerId === v.practitionerId &&
            new Date(a.startsAt).getTime() < new Date(v.endsAt).getTime() &&
            new Date(a.endsAt).getTime() > new Date(v.startsAt).getTime(),
        )
      )
        fail('Appointment overlaps practitioner booking.', 409);
      const a = this.add('appointments', { ...v, roomId: null, status: 'BOOKED' }, branch);
      this.notice(this.record('patients', v.patientId, branch), 'BOOKING', branch);
      return this.enrich(a);
    }
    if (/^\/appointments\/\d+\/cancel$/.test(route)) {
      const a = this.record('appointments', id!, branch);
      if (a.deletedAt) fail('Appointment not found.', 404);
      if (a.version !== body.version || a.status !== 'BOOKED') fail('Appointment changed.', 409);
      a.status = 'CANCELLED';
      a.version++;
      return a;
    }
    if (/^\/appointments\/\d+$/.test(route) && method === 'DELETE') {
      const { version } = z.object({ version: z.number().int().positive() }).strict().parse(body);
      const a = this.record('appointments', id!, branch);
      if (a.deletedAt) fail('Appointment not found.', 404);
      if (a.version !== version || !['BOOKED', 'CANCELLED'].includes(a.status))
        fail('Appointment changed or has clinical attendance; it cannot be removed.', 409);
      a.status = 'CANCELLED';
      a.deletedAt = now();
      a.version++;
      return a;
    }
    if (route === '/queue' && method === 'POST') {
      const v = schemas.queue.parse(body);
      this.record('patients', v.patientId, branch);
      const appointment = v.appointmentId
        ? this.record('appointments', v.appointmentId, branch)
        : undefined;
      if (appointment) {
        if (
          appointment.deletedAt ||
          appointment.status !== 'BOOKED' ||
          appointment.version !== v.appointmentVersion ||
          appointment.patientId !== v.patientId
        )
          fail('Appointment changed. Refresh arrivals before checking in.', 409);
        if (
          today() !== todayFor(appointment.startsAt) ||
          new Date(appointment.startsAt).getTime() > Date.now()
        )
          fail('Appointment is not due today yet.', 409);
        this.doctor(appointment.practitionerId, branch);
      }
      if (this.scoped('queue', branch).some((q) => q.patientId === v.patientId && activeQueue(q)))
        fail(
          'Patient is already checked in with an active ticket. Use the existing ticket or wait until it expires after 12 hours or at clinic midnight.',
          409,
        );
      const q = this.add(
        'queue',
        {
          patientId: v.patientId,
          priority: v.priority,
          appointmentId: appointment?.id || null,
          practitionerId: appointment?.practitionerId || null,
          roomId: null,
          status: 'REGISTERED',
          serviceDate: today(),
          expiredAt: null,
        },
        branch,
      );
      q.ticketNumber = this.nextQueueNumber(branch);
      if (appointment) {
        appointment.status = 'CHECKED_IN';
        appointment.version++;
      }
      return this.enrich(q);
    }
    if (route === '/queue/appointment-arrivals' && method === 'GET') {
      return {
        data: this.scoped('appointments', branch)
          .filter(
            (a) =>
              !a.deletedAt &&
              a.status === 'BOOKED' &&
              todayFor(a.startsAt) === today() &&
              new Date(a.startsAt).getTime() <= Date.now() &&
              !this.scoped('queue', branch).some(
                (q) => q.patientId === a.patientId && activeQueue(q),
              ),
          )
          .sort(
            (a, b) =>
              new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.id - b.id,
          )
          .map((a) => ({
            id: a.id,
            patientId: a.patientId,
            patientName: this.record('patients', a.patientId, branch).name,
            practitionerId: a.practitionerId,
            practitionerName: this.state.rows.users.find((u) => u.id === a.practitionerId)?.name,
            startsAt: a.startsAt,
            reason: a.reason,
            version: a.version,
          })),
      };
    }
    if (/^\/queue\/\d+\/transition$/.test(route)) {
      const v = schemas.transition.parse(body),
        q = this.record('queue', id!, branch);
      if (q.expiredAt)
        fail(
          'Queue ticket expired after 12 hours or at clinic midnight. Check the patient in again.',
          409,
        );
      if (q.version !== v.version) fail('Ticket changed.', 409);
      if (user.role === 'DOCTOR' && q.practitionerId && q.practitionerId !== user.id)
        fail('GP can only manage own consultations.', 403);
      new QueueTicket(q.status as QueueStatus).transition(v.status);
      if (v.status === 'CALLED_TO_ROOM') {
        if (!v.roomId || !v.practitionerId) fail('Choose room and GP.');
        const room = this.record('rooms', v.roomId!, branch);
        if (!room.active) fail('Room archived.');
        this.doctor(v.practitionerId!, branch);
        if (user.role === 'DOCTOR' && v.practitionerId !== user.id)
          fail('GP can only call own patients.', 403);
        if (
          this.scoped('queue', branch).some(
            (t) =>
              t.id !== q.id &&
              activeQueue(t) &&
              t.roomId === v.roomId &&
              ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status),
          )
        )
          fail('Room is occupied.', 409);
        q.roomId = v.roomId;
        q.practitionerId = v.practitionerId;
        q.calledAt = now();
      }
      if (v.status === 'TRIAGE_WAITING') q.roomId = null;
      q.status = v.status;
      q.version++;
      return this.enrich(q);
    }
    if (route === '/queue/display')
      return {
        data: this.visibleQueue(branch)
          .filter(activeQueue)
          .map((q) => ({
            ticketNumber: q.ticketNumber,
            status: q.status,
            roomName: this.state.rows.rooms.find((r) => r.id === q.roomId)?.name,
          })),
      };
    if (route === '/queue/estimate')
      return {
        visitsToday: this.visibleQueue(branch).length,
        sampleCount: 0,
        practitionerCount: this.state.rows.users.filter(
          (u) => u.role === 'DOCTOR' && u.active && u.branchIds.includes(branch),
        ).length,
        waiting: this.scoped('queue', branch).filter(activeQueue).length,
        estimatedMinutes: null,
        basis: 'Demo has no measured consultation history.',
      };
    if (route === '/clinical/queue-suggestions' && method === 'GET') {
      if (user.role !== 'DOCTOR') fail('Only GP can view assigned consultation suggestions.', 403);
      return {
        data: this.scoped('queue', branch)
          .filter(
            (ticket) =>
              activeQueue(ticket) &&
              ticket.practitionerId === user.id &&
              ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(ticket.status),
          )
          .sort((left, right) => left.id - right.id)
          .map((ticket) => ({
            queueTicketId: ticket.id,
            patientId: ticket.patientId,
            patientNumber: ticket.patientId,
            patientName: this.record('patients', ticket.patientId, branch).name,
            ticketNumber: ticket.ticketNumber,
            roomId: ticket.roomId,
            roomName: this.record('rooms', ticket.roomId, branch).name,
            status: ticket.status,
            version: ticket.version,
            createdAt: ticket.createdAt,
            calledAt: ticket.calledAt || null,
            expiresAt: new Date(queueExpiryTime(ticket)).toISOString(),
            encounterId:
              this.scoped('encounters', branch).find(
                (encounter) => !encounter.deletedAt && encounter.queueTicketId === ticket.id,
              )?.id || null,
          })),
      };
    }
    if (
      (route === '/encounters' && method === 'POST') ||
      (/^\/encounters\/\d+$/.test(route) && method === 'PUT')
    ) {
      if (user.role !== 'DOCTOR') fail('Only GP can save or sign consultations.', 403);
      const v = encounterWriteSchema.parse(body),
        p = this.record('patients', v.patientId, branch);
      const existing = id ? this.record('encounters', id, branch) : undefined;
      if (existing && v.queueTicketId === undefined) v.queueTicketId = existing.queueTicketId;
      if (existing && (v.queueTicketId || null) !== (existing.queueTicketId || null))
        fail('The consultation queue ticket cannot change.', 409);
      const ticket =
        !id && v.queueTicketId
          ? this.consultationTicket(v.queueTicketId, v.patientId, user.id, branch)
          : undefined;
      if (
        !id &&
        ticket &&
        this.scoped('encounters', branch).some(
          (encounter) => !encounter.deletedAt && encounter.queueTicketId === ticket.id,
        )
      )
        fail(
          'A consultation already exists for this queue ticket. Open the existing consultation.',
          409,
        );
      this.checkPrescription(v.prescriptions, p, branch);
      for (const supply of v.consumables) {
        const item = this.record('inventory', supply.itemId, branch);
        if (item.active === false || item.category !== 'CONSUMABLE')
          fail('Choose an active consumable supply.');
      }
      const priorPrescriptions = id ? this.record('encounters', id, branch).prescriptions : [];
      v.prescriptions = v.prescriptions.map((rx) => {
        const old = priorPrescriptions.find(
          (previous: Row) =>
            previous.itemId === rx.itemId &&
            previous.quantity === rx.quantity &&
            previous.dosage === rx.dosage &&
            previous.durationDays === rx.durationDays,
        );
        const item = this.record('inventory', rx.itemId, branch);
        return {
          ...rx,
          itemName: old?.itemName || item.name,
          ingredient: old?.ingredient ?? item.ingredient,
          unit: old?.unit || item.unit,
          unitPriceCents: rx.unitPriceCents ?? old?.unitPriceCents ?? item.priceCents,
        };
      });
      const previousRx = id ? this.record('encounters', id, branch).prescriptions : [];
      for (const rx of v.prescriptions)
        if (
          this.record('inventory', rx.itemId, branch).active === false &&
          !previousRx.some(
            (old: Row) =>
              old.itemId === rx.itemId &&
              old.quantity === rx.quantity &&
              old.dosage === rx.dosage &&
              old.durationDays === rx.durationDays,
          )
        )
          fail('Archived medicine cannot be added to a new prescription.');
      if (id) {
        const e = this.record('encounters', id, branch);
        if (e.practitionerId !== user.id) fail('Only attending GP can edit.', 403);
        if (e.status === 'SIGNED' || e.version !== v.version)
          fail('Consultation is signed or changed.', 409);
        Object.assign(e, v, {
          version: e.version + 1,
          signedAt: v.status === 'SIGNED' ? now() : null,
        });
        if (v.status === 'SIGNED') {
          this.reserve(e, branch);
          this.advanceSignedConsultation(e, branch, user.name);
        }
        return this.enrich(e);
      }
      if (ticket?.status === 'CALLED_TO_ROOM') {
        ticket.status = 'IN_CONSULTATION';
        ticket.version++;
        this.add(
          'audit',
          {
            actorName: user.name,
            action: 'START_CONSULTATION',
            entityType: 'queue',
            entityId: ticket.id,
            requestId: 'browser-demo',
            from: 'CALLED_TO_ROOM',
            to: 'IN_CONSULTATION',
          },
          branch,
        );
      }
      const e = this.add(
        'encounters',
        {
          ...v,
          practitionerId: user.id,
          signedAt: v.status === 'SIGNED' ? now() : null,
          deletedAt: null,
        },
        branch,
      );
      if (v.status === 'SIGNED') {
        this.reserve(e, branch);
        this.advanceSignedConsultation(e, branch, user.name);
        this.notice(p, 'REFILL', branch);
      }
      return this.enrich(e);
    }
    if (route === '/inventory' && method === 'POST') {
      if (user.role !== 'ADMIN') fail('Only administrators can add inventory items.', 403);
      const v = schemas.item.parse(body);
      validateItemIngredient(v);
      if (this.scoped('inventory', branch).some((i) => i.sku === v.sku))
        fail('SKU already exists.', 409);
      this.validateCatalogChoice('INVENTORY_UNIT', v.unit, branch);
      return this.add('inventory', { ...v, active: true }, branch);
    }
    if (route === '/inventory/batches' && method === 'POST') {
      const v = schemas.batch.parse(body);
      const item = this.record('inventory', v.itemId, branch);
      if (
        v.priceCents !== undefined &&
        v.itemVersion !== undefined &&
        v.itemVersion !== item.version
      )
        fail('Inventory item changed; refresh before receiving stock.', 409);
      if (v.expiresOn && v.expiresOn <= today()) fail('Receive only stock expiring after today.');
      if (this.record('inventory', v.itemId, branch).category === 'MEDICATION' && !v.expiresOn)
        fail('Medication batches require an expiry date.');
      if (
        v.batchNumber !== null &&
        this.scoped('batches', branch).some(
          (b) => b.itemId === v.itemId && b.batchNumber === v.batchNumber,
        )
      )
        fail('Batch already exists.', 409);
      const batch = this.add('batches', v, branch);
      if (v.priceCents !== undefined) {
        const item = this.record('inventory', v.itemId, branch);
        item.priceCents = v.priceCents;
        item.version++;
      }
      return {
        ...batch,
        stockQuantity: this.inventory(branch).find((i) => i.id === v.itemId)!.stockQuantity,
      };
    }
    if (route === '/inventory/usage' && method === 'POST') {
      const v = schemas.inventoryUsage.parse(body),
        prior = this.scoped('usages', branch).find((u) => u.idempotencyKey === v.idempotencyKey);
      if (prior) {
        if (prior.itemId !== v.itemId || prior.quantity !== v.quantity || prior.reason !== v.reason)
          fail('Usage key has different details.', 409);
        return prior;
      }
      if (this.record('inventory', v.itemId, branch).category === 'MEDICATION')
        fail('Medication requires signed prescription dispensing.');
      for (const a of FefoAllocator.allocate(
        this.availableBatches(v.itemId, branch),
        v.quantity,
        today(),
        true,
      ))
        this.record('batches', a.batchId, branch).quantity -= a.quantity;
      return this.add('usages', { ...v, actorId: user.id }, branch);
    }
    if (route === '/dispensary/encounters')
      return {
        data: this.scoped('encounters', branch)
          .filter(
            (e) =>
              !e.deletedAt &&
              e.status === 'SIGNED' &&
              e.prescriptions.length &&
              [
                this.record('patients', e.patientId, branch).name,
                this.record('patients', e.patientId, branch).nationalId,
                String(e.patientId),
                String(e.id),
                this.state.rows.users.find((u) => u.id === e.practitionerId)?.name,
                ...e.prescriptions.map(
                  (rx: Row) => this.record('inventory', rx.itemId, branch).name,
                ),
              ]
                .join(' ')
                .toLowerCase()
                .includes((url.searchParams.get('search') || '').toLowerCase()) &&
              !this.scoped('dispenses', branch).some((d) => d.encounterId === e.id),
          )
          .map((e) => {
            const p = this.record('patients', e.patientId, branch);
            return {
              id: e.id,
              patientId: p.id,
              patientNumber: p.id,
              patientName: p.name,
              nationalId: p.nationalId,
              allergies: p.allergies,
              practitionerId: e.practitionerId,
              practitionerName: this.state.rows.users.find((u) => u.id === e.practitionerId)?.name,
              createdAt: e.createdAt,
              prescriptions: e.prescriptions.map((rx: Row) => ({
                ...rx,
                itemName: rx.itemName || this.record('inventory', rx.itemId, branch).name,
              })),
            };
          }),
      };
    if (/^\/encounters\/\d+\/medication-doses$/.test(route)) {
      const encounter = this.record('encounters', id!, branch);
      if (method === 'GET')
        return {
          encounterId: encounter.id,
          patientId: encounter.patientId,
          patientName: this.record('patients', encounter.patientId, branch).name,
          entries: this.scoped('medicationDoses', branch)
            .filter((d) => d.encounterId === encounter.id)
            .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
            .map(({ requestHash, ...dose }) => dose),
        };
      if (method === 'POST') {
        if (!['DOCTOR', 'NURSE'].includes(user.role))
          fail('Only GPs and nurses with clinical access can record medication doses.', 403);
        const value = schemas.medicationDose.parse(body);
        if (encounter.status !== 'SIGNED')
          fail('Sign the medicine prescription before recording doses.', 409);
        if (!encounter.prescriptions.some((rx: Row) => rx.itemId === value.itemId))
          fail('Choose a medicine prescribed in this consultation.');
        const prior = this.scoped('medicationDoses', branch).find(
          (d) => d.idempotencyKey === value.idempotencyKey,
        );
        if (prior) {
          if (prior.encounterId !== encounter.id || JSON.stringify(value) !== prior.requestHash)
            fail('Dose key belongs to different input.', 409);
          const { requestHash, ...safe } = prior;
          return safe;
        }
        const medicine = this.record('inventory', value.itemId, branch);
        const row = this.add(
          'medicationDoses',
          {
            ...value,
            encounterId: encounter.id,
            patientId: encounter.patientId,
            medicineName:
              encounter.prescriptions.find((rx: Row) => rx.itemId === value.itemId)?.itemName ||
              medicine.name,
            unit:
              encounter.prescriptions.find((rx: Row) => rx.itemId === value.itemId)?.unit ||
              medicine.unit,
            actorId: user.id,
            actorName: user.name,
            requestHash: JSON.stringify(value),
          },
          branch,
        );
        const { requestHash, ...safe } = row;
        return safe;
      }
    }
    if (route === '/dispensary/history' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return {
        data: this.scoped('encounters', branch)
          .filter((e) => !e.deletedAt && e.status === 'SIGNED' && e.prescriptions.length)
          .map((e) => ({
            id: e.id,
            patientId: e.patientId,
            patientName: this.record('patients', e.patientId, branch).name,
            practitionerName:
              this.state.rows.users.find((u) => u.id === e.practitionerId)?.name || '',
            createdAt: e.createdAt,
            status: e.status,
            dispensed: this.scoped('dispenses', branch).some((d) => d.encounterId === e.id),
          }))
          .filter((e) =>
            (e.patientName + ' ' + e.patientId + ' ' + e.id + ' ' + e.practitionerName)
              .toLowerCase()
              .includes(search),
          )
          .slice(0, 200),
      };
    }
    if (/^\/encounters\/\d+\/medicine-labels$/.test(route) && method === 'GET') {
      const encounter = this.record('encounters', id!, branch);
      const dispense =
        this.scoped('dispenses', branch).find((d) => d.encounterId === encounter.id) ||
        fail('Dispensed prescription not found.', 404);
      if (encounter.status !== 'SIGNED') fail('Dispensed prescription not found.', 404);
      return {
        ...(dispense.labelSnapshot ?? this.printBranding(branch)),
        id: encounter.id,
        patientId: encounter.patientId,
        patientName: this.record('patients', encounter.patientId, branch).name,
        practitionerName:
          this.state.rows.users.find((u) => u.id === encounter.practitionerId)?.name || '',
        dispensedAt: dispense.createdAt || null,
        prescriptions: encounter.prescriptions.map((rx: Row) => ({
          itemId: rx.itemId,
          itemName:
            rx.itemName ||
            this.scoped('inventory', branch).find((item) => item.id === rx.itemId)?.name ||
            `Medication ID ${rx.itemId}`,
          unit:
            rx.unit || this.scoped('inventory', branch).find((item) => item.id === rx.itemId)?.unit,
          quantity: rx.quantity,
          quantityPerDose: rx.quantityPerDose,
          form: rx.form,
          instructions: rx.instructions,
          indication: rx.indication,
          dosage: rx.dosage,
          durationDays: rx.durationDays,
          frequencyPerDay: rx.frequencyPerDay || 1,
          mealTiming: rx.mealTiming || 'ANY_TIME',
        })),
      };
    }
    if (/^\/encounters\/\d+\/prescription-log$/.test(route) && method === 'GET') {
      const e = this.record('encounters', id!, branch);
      const events: PrescriptionLogEvent[] = [];
      const actorName = (actorId: number) =>
        this.state.rows.users.find((u) => u.id === actorId)?.name || 'Recorded staff';
      const addEvent = (
        type: PrescriptionLogEvent['type'],
        rx: Row,
        quantity: number,
        at: string,
        actorId: number,
        batchId?: number,
      ) =>
        events.push({
          type,
          itemId: rx.itemId,
          itemName: rx.itemName || this.record('inventory', rx.itemId, branch).name,
          quantity,
          at,
          actorName: actorName(actorId),
          batchId,
          batchNumber: batchId ? this.record('batches', batchId, branch).batchNumber : undefined,
          frequencyPerDay: rx.frequencyPerDay || 1,
          mealTiming: rx.mealTiming || 'ANY_TIME',
          dosage: rx.dosage,
          quantityPerDose: rx.quantityPerDose,
          indication: rx.indication,
          form: rx.form,
          instructions: rx.instructions,
          durationDays: rx.durationDays,
        });
      if (e.status === 'SIGNED')
        for (const rx of e.prescriptions || [])
          addEvent('PRESCRIBED', rx, rx.quantity, e.signedAt || e.createdAt, e.practitionerId);
      for (const hold of this.scoped('reservations', branch).filter(
        (r) => r.encounterId === e.id,
      )) {
        const rx = e.prescriptions.find((r: Row) => r.itemId === hold.itemId);
        if (!rx) continue;
        addEvent('RESERVED', rx, hold.quantity, hold.createdAt, e.practitionerId, hold.batchId);
        if (hold.status === 'RELEASED' && hold.consumedAt)
          addEvent(
            'RELEASED',
            rx,
            hold.quantity,
            hold.consumedAt,
            this.scoped('dispenses', branch).find((d) => d.encounterId === e.id)?.actorId ||
              e.practitionerId,
            hold.batchId,
          );
      }
      for (const dispense of this.scoped('dispenses', branch).filter(
        (d) => d.encounterId === e.id,
      )) {
        for (const allocation of dispense.allocations || e.prescriptions) {
          const rx = e.prescriptions.find((r: Row) => r.itemId === allocation.itemId);
          if (rx)
            addEvent(
              'DISPENSED',
              rx,
              allocation.quantity,
              dispense.createdAt,
              dispense.actorId,
              allocation.batchId,
            );
        }
      }
      events.sort((a, b) => a.at.localeCompare(b.at));
      return {
        encounterId: e.id,
        patientId: e.patientId,
        patientName: this.record('patients', e.patientId, branch).name,
        events,
      };
    }
    if (/^\/documents\/\d+$/.test(route) && method === 'GET') {
      const document = this.record('documents', id!, branch);
      const patient = this.record('patients', document.patientId, branch);
      const encounter = this.record('encounters', document.encounterId, branch);
      const practitioner = this.state.rows.users.find((u) => u.id === document.practitionerId);
      const clinic = this.state.rows.branches.find((b) => b.id === branch);
      const defaults = {
        patientName: patient.name,
        nationalId: patient.nationalId,
        branchName: clinic?.name,
        branchAddress: clinic?.address,
        practitionerName: practitioner?.name,
        licenseNumber: practitioner?.licenseNumber,
        assessment: encounter.assessment,
        allergies: patient.allergies,
        conditions: patient.conditions,
      };
      document.payload ||= {};
      for (const [key, value] of Object.entries(defaults))
        if (!(key in document.payload)) document.payload[key] = value;
      return buildDocumentView(document as any);
    }
    if (route === '/dispenses' && method === 'POST') {
      const v = schemas.dispense.parse(body),
        prior = this.scoped('dispenses', branch).find((d) => d.idempotencyKey === v.idempotencyKey);
      this.record('encounters', v.encounterId, branch);
      if (prior) {
        if (prior.encounterId !== v.encounterId) fail('Key belongs to another prescription.', 409);
        return prior;
      }
      const e = this.record('encounters', v.encounterId, branch);
      if (e.status !== 'SIGNED' || !e.prescriptions.length)
        fail('Sign a prescription before dispensing.');
      if (this.scoped('dispenses', branch).some((d) => d.encounterId === e.id))
        fail('Already dispensed.', 409);
      this.checkPrescription(e.prescriptions, this.record('patients', e.patientId, branch), branch);
      const holds = this.scoped('reservations', branch).filter(
        (r) => r.encounterId === e.id && !r.consumedAt,
      );
      for (const hold of holds) {
        hold.consumedAt = now();
        hold.status = 'RELEASED';
      }
      const usedAllocations: Row[] = [];
      for (const rx of e.prescriptions) {
        const allocations = FefoAllocator.allocate(
          this.availableBatches(rx.itemId, branch),
          rx.quantity,
          today(),
        );
        for (const allocation of allocations) {
          usedAllocations.push({ ...allocation, itemId: rx.itemId });
          this.record('batches', allocation.batchId, branch).quantity -= allocation.quantity;
          const original = holds.find(
            (h) => h.batchId === allocation.batchId && h.quantity === allocation.quantity,
          );
          if (original) original.status = 'FULFILLED';
        }
      }
      const dispense = this.add(
        'dispenses',
        {
          ...v,
          patientId: e.patientId,
          actorId: user.id,
          allocations: usedAllocations,
          labelSnapshot: this.printBranding(branch),
        },
        branch,
      );
      this.advanceVisit(e, branch, user.name, 'DISPENSARY_WAITING', 'PAYMENT_WAITING', 'DISPENSE');
      return dispense;
    }
    if (route === '/billing/suggestions' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return {
        data: this.scoped('encounters', branch)
          .filter(
            (e) =>
              !e.deletedAt &&
              e.status === 'SIGNED' &&
              (!e.prescriptions.length ||
                this.scoped('dispenses', branch).some((d) => d.encounterId === e.id)) &&
              !this.scoped('invoices', branch).some((i) => i.encounterId === e.id),
          )
          .map((e) => {
            const patient = this.record('patients', e.patientId, branch);
            const dispense = this.scoped('dispenses', branch).find((d) => d.encounterId === e.id);
            return {
              id: e.id,
              encounterId: e.id,
              patientId: e.patientId,
              patientNumber: e.patientId,
              patientName: patient.name,
              patientGroupId: patient.patientGroupId ?? null,
              patientGroupLabel: this.patientWithGroup(patient, branch).patientGroupLabel || null,
              practitionerId: e.practitionerId,
              practitionerName: this.state.rows.users.find((u) => u.id === e.practitionerId)?.name,
              queueTicketId: e.queueTicketId || null,
              signedAt: e.signedAt,
              dispensedAt: dispense?.createdAt || null,
              consultationFeeCents: e.consultationFeeCents ?? null,
              procedureFeeCents: e.procedureFeeCents ?? null,
              prescriptions: e.prescriptions.map((rx: Row) => ({
                ...rx,
                itemName: rx.itemName || this.record('inventory', rx.itemId, branch).name,
                unitPriceCents:
                  rx.unitPriceCents ?? this.record('inventory', rx.itemId, branch).priceCents,
              })),
            };
          })
          .filter((e) =>
            `${e.patientId} ${e.patientName} ${e.encounterId} ${e.practitionerName}`
              .toLowerCase()
              .includes(search),
          ),
      };
    }
    if (/^\/invoices\/\d+\/receipt-view$/.test(route) && method === 'GET') {
      const invoice = this.record('invoices', id!, branch),
        patient = this.record('patients', invoice.patientId, branch),
        clinicBranch = this.state.rows.branches.find((b) => b.id === branch)!;
      const snapshot = invoice.receiptSnapshot;
      const legacy =
        !snapshot || ['logoDataUrl', 'header', 'footer'].some((key) => !(key in snapshot));
      const branding = this.printBranding(branch);
      return buildReceiptView({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        createdAt: invoice.createdAt,
        clinicName: this.state.rows.tenants[0].name,
        branchName: clinicBranch.name,
        clinicAddress: clinicBranch.address,
        ...(legacy ? branding : {}),
        patientName: patient.name,
        nationalId: patient.nationalId,
        receivedBy: '',
        receiptSnapshot: snapshot && legacy ? { ...branding, ...snapshot } : snapshot,
        lines: invoice.lines,
        totalCents: invoice.totalCents,
        payments: invoice.payments,
        simulated: true,
      });
    }
    if (route === '/invoices' && method === 'POST') {
      const v = schemas.invoice.parse(body),
        hash = JSON.stringify(v),
        prior = this.scoped('invoices', branch).find((i) => i.idempotencyKey === v.idempotencyKey);
      if (prior) {
        if (prior.requestHash !== hash) fail('Payment key has different details.', 409);
        return this.enrich(prior);
      }
      for (const line of v.lines)
        this.validateCatalogChoice('BILLING_CATEGORY', line.category, branch);
      const patient = this.record('patients', v.patientId, branch),
        clinicBranch = this.state.rows.branches.find((b) => b.id === branch)!;
      const patientGroupId =
        v.patientGroupId === undefined ? (patient.patientGroupId ?? null) : v.patientGroupId;
      let patientGroupLabel =
        this.patientWithGroup(patient, branch).patientGroupLabel || 'No group assigned';
      if (patientGroupId !== null && v.patientGroupId !== undefined) {
        const group = this.scoped('catalogs', branch).find(
          (entry) => entry.id === patientGroupId && entry.kind === 'PATIENT_GROUP',
        );
        if (!group || (!group.active && patientGroupId !== patient.patientGroupId))
          fail('Choose an active patient group.');
        patientGroupLabel = group!.label;
      }
      if (patientGroupId === null) patientGroupLabel = 'No group assigned';
      this.doctor(v.practitionerId, branch);
      const encounter = v.encounterId
        ? this.record('encounters', v.encounterId, branch)
        : undefined;
      if (encounter) {
        if (
          encounter.status !== 'SIGNED' ||
          encounter.patientId !== v.patientId ||
          encounter.practitionerId !== v.practitionerId
        )
          fail('Choose a signed consultation for this patient and GP.', 409);
        if (
          encounter.prescriptions.length &&
          !this.scoped('dispenses', branch).some((d) => d.encounterId === encounter.id)
        )
          fail('Dispense prescribed medicines before checkout.', 409);
        if (this.scoped('invoices', branch).some((i) => i.encounterId === encounter.id))
          fail('Consultation already checked out.', 409);
        const catalogs = this.scoped('catalogs', branch);
        const expected = encounterBillingLines(encounter as any, {
          service:
            catalogs.find((entry) => entry.active && entry.billingDefault === 'SERVICE')?.label ||
            'SERVICE',
          product:
            catalogs.find((entry) => entry.active && entry.billingDefault === 'PRODUCT')?.label ||
            'PRODUCT',
        });
        if (
          expected &&
          (expected.length !== v.lines.length ||
            expected.some((line, index) => {
              const actual = v.lines[index];
              return (
                line.description !== actual.description ||
                line.quantity !== actual.quantity ||
                line.unitPriceCents !== actual.unitPriceCents ||
                line.category !== actual.category
              );
            }))
        )
          fail('Checkout must use the GP approved itemized charges.', 409);
      }
      const total = v.lines.reduce(
        (sum, l) => sum + new Money(l.unitPriceCents).multiply(l.quantity).cents,
        0,
      );
      new Money(total);
      if (
        (!total &&
          (!encounter ||
            encounter.consultationFeeCents == null ||
            encounter.procedureFeeCents == null)) ||
        v.payments.reduce((sum, p) => sum + p.amountCents, 0) !== total
      )
        fail('Payment total must equal invoice total.');
      const invoice = this.add(
        'invoices',
        {
          ...v,
          requestHash: hash,
          totalCents: total,
          status: 'PAID',
          receiptSnapshot: {
            ...this.letterheadSnapshot(),
            clinicName: this.state.rows.tenants[0].name,
            branchName: clinicBranch.name,
            clinicAddress: this.state.rows.tenants[0].letterhead?.address || clinicBranch.address,
            patientName: patient.name,
            nationalId: patient.nationalId,
            patientGroupId,
            patientGroupLabel,
            receivedBy: user.name,
          },
        },
        branch,
      );
      invoice.invoiceNumber = 'DEMO-INV-' + invoice.id;
      if (encounter)
        this.advanceVisit(encounter, branch, user.name, 'PAYMENT_WAITING', 'COMPLETED', 'CHECKOUT');
      return this.enrich(invoice);
    }
    if (route === '/documents' && method === 'POST') {
      if (user.role !== 'DOCTOR') fail('Only GP can simulate a document.', 403);
      const v = schemas.document.parse(body),
        e = this.record('encounters', v.encounterId, branch);
      if (e.status !== 'SIGNED' || e.practitionerId !== user.id)
        fail('Attending GP must sign first.');
      let endDate: string | null = null;
      if (v.kind === 'MC') {
        if (!v.startDate || !v.days) fail('Start date and number of days required.');
        const end = new Date(v.startDate! + 'T00:00:00Z');
        end.setUTCDate(end.getUTCDate() + v.days! - 1);
        endDate = end.toISOString().slice(0, 10);
        if (
          this.state.rows.documents.some(
            (d) =>
              d.patientId === e.patientId &&
              d.kind === 'MC' &&
              !d.revokedAt &&
              d.startDate <= endDate! &&
              d.endDate >= v.startDate!,
          )
        )
          fail('Sick leave dates overlap an existing active certificate.', 409);
      }
      if (v.kind === 'REFERRAL' && v.target)
        this.validateCatalogChoice('REFERRAL_DESTINATION', v.target, branch);
      if (v.kind === 'LAB') {
        for (const label of v.panels || []) this.validateCatalogChoice('LAB_PANEL', label, branch);
        this.validateCatalogChoice('SPECIMEN_TYPE', v.specimenType, branch);
      }
      if (v.kind === 'REFERRAL' && (!v.target || !v.reason))
        fail('Target and referral reason required.');
      if (v.kind === 'LAB' && !v.panels?.length) fail('Select at least one investigation panel.');
      const d = this.add(
        'documents',
        {
          ...v,
          patientId: e.patientId,
          practitionerId: user.id,
          diagnosisRedacted: v.diagnosisRedacted,
          endDate,
          documentNumber: 'DEMO-UNSIGNED-' + (this.state.counters.documents + 1),
          verificationUrl: '/demo-unavailable',
          payload: {
            ...this.letterheadSnapshot(),
            ...v,
            endDate,
            demo: true,
            employer: v.employer,
            clinicName: this.state.rows.tenants[0].name,
            branchName: this.state.rows.branches.find((b) => b.id === branch)?.name,
            branchAddress:
              this.state.rows.tenants[0].letterhead?.address ||
              this.state.rows.branches.find((b) => b.id === branch)?.address,
            patientName: this.record('patients', e.patientId, branch).name,
            nationalId: this.record('patients', e.patientId, branch).nationalId,
            practitionerName: user.name,
            licenseNumber: user.licenseNumber,
            assessment: e.assessment,
            allergies: [...this.record('patients', e.patientId, branch).allergies],
            conditions: [...this.record('patients', e.patientId, branch).conditions],
          },
        },
        branch,
      );
      return this.enrich(d);
    }
    if (/^\/documents\/\d+\/revoke$/.test(route)) {
      if (user.role !== 'DOCTOR') fail('Only GP can revoke.', 403);
      const d = this.record('documents', id!, branch);
      if (d.practitionerId !== user.id) fail('Only attending GP can revoke.', 403);
      d.revokedAt = now();
      return d;
    }
    if (route === '/admin/letterhead' && method === 'GET') {
      const clinic = this.state.rows.tenants[0];
      return { ...emptyLetterhead, ...clinic.letterhead, version: clinic.letterheadVersion || 1 };
    }
    if (route === '/admin/letterhead' && method === 'PUT') {
      const input = z
        .object({
          version: z.number().int().positive(),
          logoDataUrl: z
            .string()
            .max(220000)
            .refine(
              (value) =>
                !value || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value),
            ),
          header: z.string().trim().max(500),
          address: z.string().trim().max(1000),
          footer: z.string().trim().max(500),
        })
        .strict()
        .parse(body);
      const clinic = this.state.rows.tenants[0];
      if ((clinic.letterheadVersion || 1) !== input.version)
        fail('Letterhead changed. Refresh before saving.', 409);
      const { version, ...letterhead } = input;
      clinic.letterhead = letterhead;
      clinic.letterheadVersion = version + 1;
      return { ...letterhead, version: version + 1 };
    }
    if (route === '/admin/clinic' && method === 'GET') {
      const clinic = this.state.rows.tenants[0];
      return { id: clinic.id, name: clinic.name };
    }
    if (route === '/admin/clinic' && method === 'PUT') {
      const input = z
        .object({
          name: z.string().trim().min(1).max(200),
          expectedName: z.string().min(1).max(200),
        })
        .strict()
        .parse(body);
      const clinic = this.state.rows.tenants[0];
      if (clinic.name !== input.expectedName)
        fail('Clinic name changed. Refresh before saving.', 409);
      clinic.name = input.name;
      return { id: clinic.id, name: clinic.name };
    }
    if (route === '/admin/custom-roles' && method === 'GET')
      return { data: this.state.rows.customRoles };
    if (
      (route === '/admin/custom-roles' && method === 'POST') ||
      (/^\/admin\/custom-roles\/\d+$/.test(route) && method === 'PUT')
    ) {
      const input = (
        method === 'POST'
          ? customRoleInput
          : customRoleInput.extend({ version: z.number().int().positive() })
      ).parse(body);
      const id = method === 'PUT' ? Number(route.split('/').at(-1)) : 0;
      if (
        this.state.rows.customRoles.some(
          (row) => row.id !== id && row.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        fail('A custom role already uses this name.', 409);
      const values = {
        name: input.name,
        modules: moduleIds.filter((module) => input.modules.includes(module)),
      };
      const target =
        method === 'POST'
          ? this.add('customRoles', values, 0)
          : this.state.rows.customRoles.find((row) => row.id === id);
      if (!target || (method === 'PUT' && target.version !== body.version))
        fail('Custom role changed. Refresh before saving.', 409);
      if (method === 'PUT') Object.assign(target!, values, { version: target!.version + 1 });
      return target;
    }
    if (route === '/admin/role-modules' && method === 'GET')
      return {
        roles: roleIds.map((role) => ({
          role,
          modules:
            role === 'ADMIN' ? [...moduleIds] : this.state.grants[role] || defaultRoleModules[role],
          editable: role !== 'ADMIN',
        })),
        moduleDefinitions,
      };
    if (route === '/admin/role-modules' && method === 'PUT') {
      if (
        !roleIds.includes(body.role) ||
        body.role === 'ADMIN' ||
        !Array.isArray(body.modules) ||
        body.modules.some((m: string) => !moduleIds.includes(m as any))
      )
        fail('Choose an editable role and known modules.');
      this.state.grants[body.role] = moduleIds.filter((m) => body.modules.includes(m));
      return { role: body.role, modules: this.state.grants[body.role] };
    }
    if (route === '/admin/users' && method === 'POST') {
      if (Object.hasOwn(body || {}, 'isSuperAdmin'))
        fail('SuperAdmin privilege cannot be granted through account management.', 403);
      if (
        !roleIds.includes(body.role) ||
        typeof body.password !== 'string' ||
        body.password.length < 14
      )
        fail('Choose role and password of at least 14 characters.');
      if (body.role === 'DOCTOR' && !body.licenseNumber) fail('GP registration number required.');
      this.validateCustomRole(
        body.role,
        body.customRoleId == null ? null : idSchema.parse(body.customRoleId),
      );
      if (
        !this.state.rows.branches.some(
          (b) =>
            b.id === idSchema.parse(body.branchId) && b.active && user.branchIds.includes(b.id),
        )
      )
        fail('Choose an accessible branch.');
      if (
        this.state.rows.users.some(
          (u) => u.email.toLowerCase() === String(body.email).toLowerCase(),
        )
      )
        fail('Email already registered.', 409);
      const u = this.add(
        'users',
        { ...body, branchIds: [body.branchId], active: true, isSuperAdmin: false },
        body.branchId,
      );
      return this.publicUser(u);
    }
    if (/^\/admin\/users\/\d+$/.test(route) && method === 'PUT') {
      const input = z
        .object({
          name: z.string().trim().min(1).max(150).optional(),
          active: z.boolean().optional(),
          customRoleId: idSchema.nullable().optional(),
        })
        .strict()
        .refine(
          (v) => v.name !== undefined || v.active !== undefined || v.customRoleId !== undefined,
          'Provide name or active status.',
        )
        .parse(body);
      const target =
        this.state.rows.users.find((u) => u.id === Number(route.split('/').at(-1))) ||
        fail('User not found.', 404);
      if (target.id === user.id && input.active === false)
        fail('Cannot deactivate your own demo account.', 409);
      this.validateCustomRole(
        target.role,
        input.customRoleId === undefined ? target.customRoleId : input.customRoleId,
      );
      if (
        input.active === false &&
        target.role === 'ADMIN' &&
        this.state.rows.users.filter((u) => u.role === 'ADMIN' && u.active).length <= 1
      )
        fail('Keep at least one active administrator.', 409);
      if (
        input.active === true &&
        !this.state.rows.branches.some((b) => b.id === target.branchId && b.active)
      )
        fail('Restore the home branch before activating staff.', 409);
      Object.assign(target, input);
      return { id: target.id, name: target.name, active: target.active };
    }
    if (route === '/admin/branches' && method === 'POST') {
      const input = z
        .object({ name: z.string().trim().min(1).max(150), address: z.string().trim().max(1000) })
        .strict()
        .parse(body);
      const b = this.add('branches', { ...input, active: true }, 0);
      b.branchId = b.id;
      b.branchNumber = b.id;
      this.ensureBillingCategories(b.id);
      this.ensurePatientGroups(b.id);
      user.branchIds.push(b.id);
      return b;
    }
    if (/^\/admin\/branches\/\d+$/.test(route) && method === 'PUT') {
      const input = z
        .object({
          name: z.string().trim().min(1).max(150),
          address: z.string().trim().max(1000),
          active: z.boolean(),
          version: z.number().int().positive(),
        })
        .strict()
        .parse(body);
      const target =
        this.state.rows.branches.find((b) => b.id === id && b.tenantId === user.tenantId) ||
        fail('Branch not found.', 404);
      if (target.version !== input.version) fail('Branch changed. Reload before saving.', 409);
      if (!input.active) {
        if (target.id === branch) fail('Switch to another branch before archiving this one.', 409);
        if (this.state.rows.branches.filter((b) => b.active).length <= 1)
          fail('Keep at least one active branch.', 409);
        if (this.state.rows.users.some((u) => u.active && u.branchId === target.id))
          fail('Move or deactivate staff assigned to this home branch first.', 409);
      }
      Object.assign(target, input, { version: target.version + 1, updatedAt: now() });
      return target;
    }
    if (route === '/admin/rooms' && method === 'POST') {
      const b = this.state.rows.branches.find((b) => b.id === idSchema.parse(body.branchId));
      if (!b || !b.active || !user.branchIds.includes(b.id))
        fail('Choose accessible active branch.');
      const input = z
        .object({ name: z.string().trim().min(1).max(100), branchId: idSchema })
        .strict()
        .parse(body);
      return this.add('rooms', { name: input.name, active: true }, b!.id);
    }
    if (/^\/admin\/rooms\/\d+$/.test(route) && ['PUT', 'DELETE'].includes(method)) {
      const room = this.record('rooms', idSchema.parse(route.split('/').at(-1)), branch);
      const input =
        method === 'PUT'
          ? z
              .object({
                name: z.string().trim().min(1).max(100).optional(),
                active: z.boolean().optional(),
              })
              .strict()
              .refine(
                (v) => v.name !== undefined || v.active !== undefined,
                'Provide name or active status.',
              )
              .parse(body)
          : { active: false };
      if (
        this.scoped('queue', branch).some(
          (q) =>
            activeQueue(q) &&
            q.roomId === room.id &&
            ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(q.status),
        )
      )
        fail('Room occupied.', 409);
      if (
        input.active === false &&
        this.scoped('appointments', branch).some(
          (a) => a.roomId === room.id && a.status === 'BOOKED' && a.endsAt > now(),
        )
      )
        fail('Room has upcoming bookings.', 409);
      if (method === 'DELETE') {
        const historical =
          this.scoped('queue', branch).some((q) => q.roomId === room.id) ||
          this.scoped('appointments', branch).some((a) => a.roomId === room.id);
        if (historical) room.active = false;
        else this.state.rows.rooms = this.state.rows.rooms.filter((r) => r.id !== room.id);
        return { id: room.id, removed: historical ? 'archived' : 'deleted' };
      }
      Object.assign(room, input);
      return room;
    }
    if (route === '/admin/users')
      return { data: this.state.rows.users.map((u) => this.publicUser(u)) };
    if (route === '/admin/branches')
      return { data: this.state.rows.branches.filter((b) => b.tenantId === user.tenantId) };
    if (route === '/admin/rooms')
      return {
        data: this.scoped('rooms', branch).map((r) => ({
          ...r,
          branchName: this.state.rows.branches.find((b) => b.id === branch)?.name,
        })),
      };
    if (route === '/admin/audit') return { data: this.scoped('audit', branch).slice().reverse() };
    if (/^\/notifications\/\d+\/retry$/.test(route)) {
      if (user.role !== 'ADMIN') fail('Administrator required.', 403);
      return this.record('notifications', id!, branch);
    }
    if (
      method === 'GET' &&
      [
        '/appointments',
        '/queue',
        '/encounters',
        '/invoices',
        '/documents',
        '/notifications',
      ].includes(route)
    )
      return {
        data: this.scoped(route.slice(1), branch)
          .filter((r) => route !== '/encounters' || !r.deletedAt)
          .filter(
            (r) =>
              route !== '/queue' || this.visibleQueue(branch).some((ticket) => ticket.id === r.id),
          )
          .filter((r) => route !== '/appointments' || !r.deletedAt)
          .map((r) => this.enrich(r))
          .filter(
            (r: Row) =>
              route !== '/encounters' ||
              [
                r.patientName,
                this.record('patients', r.patientId, branch).nationalId,
                r.patientId,
                r.id,
                r.assessment,
                r.practitionerName,
              ]
                .join(' ')
                .toLowerCase()
                .includes((url.searchParams.get('search') || '').toLowerCase()),
          ),
      };
    if (route === '/inventory' && method === 'GET')
      return {
        data: this.inventory(branch)
          .sort((a, b) => a.id - b.id)
          .filter(
            (r) =>
              (!url.searchParams.get('category') ||
                r.category === url.searchParams.get('category')) &&
              [r.name, r.sku, r.ingredient, r.category]
                .join(' ')
                .toLowerCase()
                .includes((url.searchParams.get('search') || '').toLowerCase()),
          ),
      };
    fail('This operation needs the real MySQL application.', 503);
  }
  private doctor(id: number, branch: number) {
    const doctor = this.state.rows.users.find(
      (u) => u.id === id && u.role === 'DOCTOR' && u.active && u.branchIds.includes(branch),
    );
    if (!doctor) fail('Choose an active GP in this branch.');
    return doctor!;
  }
  private registrationReceipt(row: Row) {
    const ticket =
      row.status === 'ACCEPTED'
        ? this.state.rows.queue.find(
            (q) =>
              q.id === row.queueTicketId &&
              q.tenantId === row.tenantId &&
              q.branchId === row.branchId &&
              q.patientId === row.patientId,
          )
        : undefined;
    const visitStatus = ticket
      ? !['COMPLETED', 'SKIPPED'].includes(ticket.status) &&
        (ticket.expiredAt || queueExpiryTime(ticket) <= Date.now() || ticket.serviceDate < today())
        ? 'EXPIRED'
        : ticket.status
      : null;
    const room =
      ticket && ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(visitStatus)
        ? this.state.rows.rooms.find(
            (room) =>
              room.id === ticket.roomId &&
              room.tenantId === row.tenantId &&
              room.branchId === row.branchId,
          )
        : undefined;
    return {
      reference: row.reference,
      ticketNumber: row.ticketNumber,
      status: row.status,
      expiresAt: row.expiresAt,
      branchName: this.state.rows.branches.find((b) => b.id === row.branchId)?.name,
      visitStatus,
      roomName: room?.name ?? null,
      simulated: true,
    };
  }
  private expireRegistrations() {
    let changed = false;
    for (const row of this.state.rows.registrations || [])
      if (row.status === 'PENDING' && Date.parse(row.expiresAt) <= Date.now()) {
        Object.assign(row, { status: 'EXPIRED', payload: null, version: row.version + 1 });
        changed = true;
      }
    return changed;
  }
  private nextQueueNumber(branch: number) {
    const rows = [...this.scoped('queue', branch), ...this.scoped('registrations', branch)].filter(
      (r) => r.serviceDate === today() && typeof r.ticketNumber === 'string',
    );
    return (
      'Q-' +
      String(Math.max(0, ...rows.map((r) => Number(r.ticketNumber.slice(2)))) + 1).padStart(3, '0')
    );
  }
  private ensurePatientGroups(branch: number) {
    if (this.scoped('catalogs', branch).some((entry) => entry.kind === 'PATIENT_GROUP')) return;
    for (const [sortOrder, label] of defaultPatientGroups.entries())
      this.add('catalogs', { kind: 'PATIENT_GROUP', label, active: true, sortOrder }, branch);
  }
  private patientWithGroup(patient: Row, branch: number) {
    const group = this.scoped('catalogs', branch).find(
      (entry) => entry.id === patient.patientGroupId && entry.kind === 'PATIENT_GROUP',
    );
    return {
      ...patient,
      patientGroupId: patient.patientGroupId ?? null,
      patientGroupLabel: group?.label ?? null,
    };
  }
  private ensureBillingCategories(branch: number) {
    if (this.scoped('catalogs', branch).some((entry) => entry.kind === 'BILLING_CATEGORY')) return;
    for (const [sortOrder, label] of defaultBillingCategories.entries())
      this.add(
        'catalogs',
        { kind: 'BILLING_CATEGORY', label, billingDefault: label, active: true, sortOrder },
        branch,
      );
  }
  private validateCatalogChoice(kind: string, label: string, branch: number) {
    const choices = this.scoped('catalogs', branch).filter((entry) => entry.kind === kind);
    if (choices.length && !choices.some((entry) => entry.active && entry.label === label))
      fail('Choose an active configured ' + kind.toLowerCase().replaceAll('_', ' ') + '.');
  }
  private checkPrescription(prescriptions: Row[], patient: Row, branch: number) {
    if (new Set(prescriptions.map((rx) => rx.itemId)).size !== prescriptions.length)
      fail('Medication cannot appear twice.');
    const items = prescriptions.map((rx) => this.record('inventory', rx.itemId, branch));
    if (items.some((i) => i.category !== 'MEDICATION'))
      fail('Prescriptions require medication items.');
    ClinicalEncounter.assertAllergySafety(
      patient.allergies,
      items as { name: string; ingredient: string }[],
    );
  }
}
