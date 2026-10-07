import { catalogKinds } from '../shared/catalogs';
import { buildDocumentView, type PrescriptionLogEvent } from '../shared/document-view';
import { buildReceiptView } from '../shared/receipt-view';
import { schemas } from '../server/validation';
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
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
    email: `${['admin', 'gp', 'reception', 'nurse', 'therapist'][index]}@example.test`,
    name: ['Nur Farah Aziz', 'Dr. Aiman Hafiz', 'Aina Sofia', 'Nur Syafiqah', 'Kavitha Raman'][
      index
    ],
    role,
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
    tenants: [{ id: 1, tenantNumber: 1, name: 'Klinik Seri Harmoni' }],
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
        roomId: 2,
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
        status: 'TRIAGE_WAITING',
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
    deposits: [
      {
        id: 1,
        tenantId: 1,
        branchId: 1,
        patientId: 2,
        amountCents: 3000,
        reference: 'DEMO-NO-REAL-DEPOSIT',
        createdAt: timestamp,
        version: 1,
      },
    ],
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
    // Existing browser sessions retain historical prescriptions without adding retroactive holds.
    for (const table of ['reservations', 'usages', 'medicationDoses']) {
      this.state.rows[table] ||= [];
      this.state.counters[table] ??= Math.max(0, ...this.state.rows[table].map((r) => r.id));
    }
    if (!this.state.rows.catalogs) {
      this.state.rows.catalogs = sampleCatalogs();
      this.state.counters.catalogs = this.state.rows.catalogs.length;
    }
    for (const branch of this.state.rows.branches) {
      branch.active ??= true;
      branch.version ??= 1;
    }
    for (const item of this.state.rows.inventory) {
      item.active ??= true;
      item.version ??= 1;
    }
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
  }
  private add(table: string, body: Row, branchId: number): Row {
    const id = (this.state.counters[table] || 0) + 1;
    this.state.counters[table] = id;
    const row = { ...body, id, tenantId: 1, branchId, createdAt: now(), version: 1 };
    this.state.rows[table].push(row);
    return row;
  }
  private modules(user: Row) {
    return user.role === 'ADMIN'
      ? [...moduleIds]
      : this.state.grants[user.role] || [...defaultRoleModules[user.role as RoleId]];
  }
  private actor() {
    const user = this.state.rows.users.find((u) => u.id === this.state.userId && u.active);
    if (!user) fail('Choose a demo account to continue.', 401);
    return user!;
  }
  private publicUser(user: Row) {
    const { password, branchIds, ...safe } = user;
    return safe;
  }
  private scoped(table: string, branch: number) {
    return this.state.rows[table].filter((r) => r.tenantId === 1 && r.branchId === branch);
  }
  private record(table: string, id: number, branch: number) {
    return (
      this.scoped(table, branch).find((r) => r.id === id) ||
      fail('Record not found in this demo branch.', 404)
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
  private reserve(encounter: Row, branch: number) {
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
    const previous = structuredClone(this.state);
    try {
      const response = this.dispatch(path, method.toUpperCase(), body, branchId);
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
    if (/^\/(packages|commissions|photos)(\/|$)/.test(route)) fail('Feature retired.', 410);
    if (route.startsWith('/admin/') && user.role !== 'ADMIN')
      fail('Demo administration requires administrator role.', 403);
    const module = /^\/encounters\/\d+\/prescription-log$/.test(route)
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
                    : /^\/(invoices|deposits)(\/|$)/.test(route)
                      ? 'billing'
                      : /^\/(notifications|reports)(\/|$)/.test(route)
                        ? 'reports'
                        : undefined;
    if (module && !modules.includes(module as any))
      fail('This demo role has no access to that module.', 403);
    const foundId = route.match(/^\/(?:admin\/)?[^/]+\/(\d+)(?:\/|$)/),
      id = foundId ? idSchema.parse(foundId[1]) : undefined;
    if (method !== 'GET' && !route.startsWith('/auth/'))
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
    if (route === '/auth/me')
      return {
        user: this.publicUser(user),
        branchId: branch,
        csrfToken: 'demo-no-real-session',
        modules,
      };
    if (route === '/bootstrap')
      return {
        tenant: this.state.rows.tenants[0],
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
        waiting: this.scoped('queue', branch).filter(
          (q) => !['COMPLETED', 'SKIPPED'].includes(q.status),
        ).length,
        encountersToday: this.scoped('encounters', branch).length,
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
          .filter((p) =>
            [p.name, p.nationalId, p.phone].some((v) => v.toLowerCase().includes(search)),
          )
          .map((p) => ({
            id: p.id,
            patientNumber: p.id,
            name: p.name,
            nationalId: p.nationalId,
            phone: p.phone,
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
        !modules.includes(kind === 'INVENTORY_UNIT' ? 'inventory' : 'clinical')
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
    if (route === '/references/medications') {
      if (!modules.some((m) => ['clinical', 'inventory'].includes(m)))
        fail('Medication selector access denied.', 403);
      return {
        data: this.scoped('inventory', branch)
          .filter(
            (i) =>
              [i.name, i.sku, i.ingredient]
                .join(' ')
                .toLowerCase()
                .includes((url.searchParams.get('search') || '').toLowerCase()) &&
              i.category === 'MEDICATION' &&
              (i.active !== false || url.searchParams.get('includeInactive') === '1'),
          )
          .map(({ id, name, ingredient, unit, category, priceCents, active }) => ({
            active,
            id,
            name,
            ingredient,
            unit,
            category,
            priceCents,
          })),
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
    if (/^\/patients\/\d+\/deposit-balance$/.test(route)) {
      this.record('patients', id!, branch);
      return {
        balanceCents: this.scoped('deposits', branch)
          .filter((d) => d.patientId === id)
          .reduce((sum, d) => sum + d.amountCents, 0),
      };
    }
    if (/^\/patients\/\d+\/encounters$/.test(route)) {
      this.record('patients', id!, branch);
      return {
        data: this.scoped('encounters', branch)
          .filter((e) => e.patientId === id)
          .map((e) => this.enrich(e)),
        nextCursor: null,
      };
    }
    if (route === '/patients' && method === 'GET') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return {
        data: this.scoped('patients', branch).filter((p) =>
          [p.name, p.nationalId, p.phone].some((v) => v.toLowerCase().includes(search)),
        ),
      };
    }
    if (/^\/patients\/\d+$/.test(route) && method === 'GET')
      return this.record('patients', id!, branch);
    if (
      (route === '/patients' && method === 'POST') ||
      (/^\/patients\/\d+$/.test(route) && method === 'PUT')
    ) {
      const value = schemas.patient.parse(body);
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
        Object.assign(p, value, { version: p.version + 1, updatedAt: now() });
        return p;
      }
      const p = this.add('patients', value, branch);
      p.patientNumber = p.id;
      return p;
    }
    if (route === '/appointments' && method === 'POST') {
      const v = schemas.appointment.parse(body);
      this.record('patients', v.patientId, branch);
      this.doctor(v.practitionerId, branch);
      if (v.roomId && !this.record('rooms', v.roomId, branch).active) fail('Room is archived.');
      if (
        this.scoped('appointments', branch).some(
          (a) =>
            a.status === 'BOOKED' &&
            (a.practitionerId === v.practitionerId || (v.roomId && a.roomId === v.roomId)) &&
            a.startsAt < v.endsAt &&
            a.endsAt > v.startsAt,
        )
      )
        fail('Appointment overlaps practitioner or room booking.', 409);
      const a = this.add('appointments', { ...v, status: 'BOOKED' }, branch);
      this.notice(this.record('patients', v.patientId, branch), 'BOOKING', branch);
      return this.enrich(a);
    }
    if (/^\/appointments\/\d+\/cancel$/.test(route)) {
      const a = this.record('appointments', id!, branch);
      if (a.version !== body.version) fail('Appointment changed.', 409);
      a.status = 'CANCELLED';
      a.version++;
      return a;
    }
    if (route === '/queue' && method === 'POST') {
      const v = schemas.queue.parse(body);
      this.record('patients', v.patientId, branch);
      if (
        this.scoped('queue', branch).some(
          (q) => q.patientId === v.patientId && !['COMPLETED', 'SKIPPED'].includes(q.status),
        )
      )
        fail('Patient already has an active ticket.', 409);
      const q = this.add('queue', { ...v, status: 'TRIAGE_WAITING', serviceDate: today() }, branch);
      q.ticketNumber = 'Q-' + String(q.id).padStart(3, '0');
      return this.enrich(q);
    }
    if (/^\/queue\/\d+\/transition$/.test(route)) {
      const v = schemas.transition.parse(body),
        q = this.record('queue', id!, branch);
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
              t.roomId === v.roomId &&
              ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(t.status),
          )
        )
          fail('Room is occupied.', 409);
        q.roomId = v.roomId;
        q.practitionerId = v.practitionerId;
      }
      if (v.status === 'TRIAGE_WAITING') q.roomId = null;
      q.status = v.status;
      q.version++;
      return this.enrich(q);
    }
    if (route === '/queue/display')
      return {
        data: this.scoped('queue', branch).map((q) => ({
          ticketNumber: q.ticketNumber,
          status: q.status,
          roomName: this.state.rows.rooms.find((r) => r.id === q.roomId)?.name,
        })),
      };
    if (route === '/queue/estimate')
      return {
        sampleCount: 0,
        practitionerCount: this.state.rows.users.filter(
          (u) => u.role === 'DOCTOR' && u.active && u.branchIds.includes(branch),
        ).length,
        waiting: this.scoped('queue', branch).length,
        estimatedMinutes: null,
        basis: 'Demo has no measured consultation history.',
      };
    if (
      (route === '/encounters' && method === 'POST') ||
      (/^\/encounters\/\d+$/.test(route) && method === 'PUT')
    ) {
      if (user.role !== 'DOCTOR') fail('Only GP can save or sign consultations.', 403);
      const v = schemas.encounter.parse(body),
        p = this.record('patients', v.patientId, branch);
      this.checkPrescription(v.prescriptions, p, branch);
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
        if (v.status === 'SIGNED') this.reserve(e, branch);
        return this.enrich(e);
      }
      if (v.queueTicketId) this.record('queue', v.queueTicketId, branch);
      const e = this.add(
        'encounters',
        { ...v, practitionerId: user.id, signedAt: v.status === 'SIGNED' ? now() : null },
        branch,
      );
      if (v.status === 'SIGNED') {
        this.reserve(e, branch);
        this.notice(p, 'REFILL', branch);
      }
      return this.enrich(e);
    }
    if (route === '/inventory' && method === 'POST') {
      if (user.role !== 'ADMIN') fail('Only administrators can add inventory items.', 403);
      const v = schemas.item.parse(body);
      if (this.scoped('inventory', branch).some((i) => i.sku === v.sku))
        fail('SKU already exists.', 409);
      this.validateCatalogChoice('INVENTORY_UNIT', v.unit, branch);
      return this.add('inventory', { ...v, active: true }, branch);
    }
    if (route === '/inventory/batches' && method === 'POST') {
      const v = schemas.batch.parse(body);
      this.record('inventory', v.itemId, branch);
      if (v.expiresOn && v.expiresOn <= today()) fail('Receive only stock expiring after today.');
      if (this.record('inventory', v.itemId, branch).category === 'MEDICATION' && !v.expiresOn)
        fail('Medication batches require an expiry date.');
      if (
        this.scoped('batches', branch).some(
          (b) => b.itemId === v.itemId && b.batchNumber === v.batchNumber,
        )
      )
        fail('Batch already exists.', 409);
      const batch = this.add('batches', v, branch);
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
          .filter((e) => e.status === 'SIGNED' && e.prescriptions.length)
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
      return this.add(
        'dispenses',
        { ...v, patientId: e.patientId, actorId: user.id, allocations: usedAllocations },
        branch,
      );
    }
    if (route === '/deposits' && method === 'POST') {
      const v = schemas.deposit.parse(body);
      this.record('patients', v.patientId, branch);
      return this.add('deposits', v, branch);
    }
    if (/^\/invoices\/\d+\/receipt-view$/.test(route) && method === 'GET') {
      const invoice = this.record('invoices', id!, branch),
        patient = this.record('patients', invoice.patientId, branch),
        clinicBranch = this.state.rows.branches.find((b) => b.id === branch)!;
      return buildReceiptView({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        createdAt: invoice.createdAt,
        clinicName: this.state.rows.tenants[0].name,
        branchName: clinicBranch.name,
        clinicAddress: clinicBranch.address,
        patientName: patient.name,
        nationalId: patient.nationalId,
        receivedBy: '',
        receiptSnapshot: invoice.receiptSnapshot,
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
      const patient = this.record('patients', v.patientId, branch),
        clinicBranch = this.state.rows.branches.find((b) => b.id === branch)!;
      this.doctor(v.practitionerId, branch);
      const total = v.lines.reduce(
        (sum, l) => sum + new Money(l.unitPriceCents).multiply(l.quantity).cents,
        0,
      );
      new Money(total);
      if (!total || v.payments.reduce((sum, p) => sum + p.amountCents, 0) !== total)
        fail('Payment total must equal invoice total.');
      const used = v.payments
          .filter((p) => p.method === 'DEPOSIT')
          .reduce((sum, p) => sum + p.amountCents, 0),
        balance = this.scoped('deposits', branch)
          .filter((d) => d.patientId === v.patientId)
          .reduce((sum, d) => sum + d.amountCents, 0);
      if (used > balance) fail('Insufficient deposit.');
      const invoice = this.add(
        'invoices',
        {
          ...v,
          requestHash: hash,
          totalCents: total,
          status: 'PAID',
          receiptSnapshot: {
            clinicName: this.state.rows.tenants[0].name,
            branchName: clinicBranch.name,
            clinicAddress: clinicBranch.address,
            patientName: patient.name,
            nationalId: patient.nationalId,
            receivedBy: user.name,
          },
        },
        branch,
      );
      invoice.invoiceNumber = 'DEMO-INV-' + invoice.id;
      if (used)
        this.add(
          'deposits',
          { patientId: v.patientId, amountCents: -used, reference: invoice.invoiceNumber },
          branch,
        );
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
            ...v,
            endDate,
            demo: true,
            employer: v.employer,
            branchName: this.state.rows.branches.find((b) => b.id === branch)?.name,
            branchAddress: this.state.rows.branches.find((b) => b.id === branch)?.address,
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
      if (
        !roleIds.includes(body.role) ||
        typeof body.password !== 'string' ||
        body.password.length < 14
      )
        fail('Choose role and password of at least 14 characters.');
      if (body.role === 'DOCTOR' && !body.licenseNumber) fail('GP registration number required.');
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
        { ...body, branchIds: [body.branchId], active: true },
        body.branchId,
      );
      return this.publicUser(u);
    }
    if (/^\/admin\/users\/\d+$/.test(route) && method === 'PUT') {
      const input = z
        .object({
          name: z.string().trim().min(1).max(150).optional(),
          active: z.boolean().optional(),
        })
        .strict()
        .refine(
          (v) => v.name !== undefined || v.active !== undefined,
          'Provide name or active status.',
        )
        .parse(body);
      const target =
        this.state.rows.users.find((u) => u.id === Number(route.split('/').at(-1))) ||
        fail('User not found.', 404);
      if (target.id === user.id && input.active === false)
        fail('Cannot deactivate your own demo account.', 409);
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
        this.state.rows.branches.find((b) => b.id === id && b.tenantId === 1) ||
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
          (q) => q.roomId === room.id && ['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(q.status),
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
      return { data: this.state.rows.branches.filter((b) => b.tenantId === 1) };
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
        data: this.inventory(branch).filter(
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
