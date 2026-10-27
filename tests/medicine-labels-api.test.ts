import { describe, expect, it, vi } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';

class Storage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('demo saved medicine labels', () => {
  it('snapshots sticker branding and applies scoped current branding only to legacy print records', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const current = await clinic.request('/admin/letterhead');
    const branding = {
      logoDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=',
      header: 'Fictional clinic contact',
      address: 'Fictional printed address',
      footer: 'Fictional clinic footer',
    };
    await clinic.request('/admin/letterhead', 'PUT', { ...branding, version: current.version });
    const encounter = (await clinic.request('/dispensary/encounters')).data[0];
    const dispense = await clinic.request('/dispenses', 'POST', {
      encounterId: encounter.id,
      idempotencyKey: 'BRANDED-LABEL-TEST',
    });
    const path = `/encounters/${encounter.id}/medicine-labels`;
    expect(await clinic.request(path)).toMatchObject({
      ...branding,
      clinicAddress: branding.address,
    });
    expect(await clinic.request('/invoices/1/receipt-view')).toMatchObject({
      logoDataUrl: branding.logoDataUrl,
      header: branding.header,
      footer: branding.footer,
      clinicAddress: branding.address,
    });
    const saved = await clinic.request('/admin/letterhead');
    await clinic.request('/admin/letterhead', 'PUT', {
      ...branding,
      header: 'Changed clinic contact',
      address: 'Changed printed address',
      version: saved.version,
    });
    expect(await new DemoClinic(storage).request(path)).toMatchObject({
      ...branding,
      clinicAddress: branding.address,
    });
    expect(await clinic.request('/invoices/1/receipt-view')).toMatchObject({
      header: 'Changed clinic contact',
      clinicAddress: 'Changed printed address',
    });
    const state = JSON.parse(storage.getItem('clinic-session-demo-v1')!);
    state.rows.dispenses.find((row: any) => row.id === dispense.id).labelSnapshot = null;
    storage.setItem('clinic-session-demo-v1', JSON.stringify(state));
    expect(await new DemoClinic(storage).request(path)).toMatchObject({
      logoDataUrl: branding.logoDataUrl,
      header: 'Changed clinic contact',
      clinicAddress: 'Changed printed address',
    });
  });
  it('fills only missing historical snapshots from the scoped catalog, including archived medicine', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const e = (await clinic.request('/dispensary/encounters')).data[0];
    await clinic.request('/dispenses', 'POST', {
      encounterId: e.id,
      idempotencyKey: 'LEGACY-LABEL-REPRINT-KEY',
    });
    const state = JSON.parse(storage.getItem('clinic-session-demo-v1')!);
    const legacyRx = state.rows.encounters.find((row: any) => row.id === e.id).prescriptions[0];
    const item = state.rows.inventory.find((row: any) => row.id === legacyRx.itemId);
    const savedName = legacyRx.itemName;
    item.name = 'Renamed catalog medicine';
    item.unit = 'tablet';
    item.active = false;
    delete legacyRx.unit;
    storage.setItem('clinic-session-demo-v1', JSON.stringify(state));
    const path = `/encounters/${e.id}/medicine-labels`;
    expect((await new DemoClinic(storage).request(path)).prescriptions[0]).toMatchObject({
      itemName: savedName,
      unit: 'tablet',
    });
    delete legacyRx.itemName;
    storage.setItem('clinic-session-demo-v1', JSON.stringify(state));
    expect((await new DemoClinic(storage).request(path)).prescriptions[0]).toMatchObject({
      itemName: 'Renamed catalog medicine',
      unit: 'tablet',
    });
    item.branchId = 2;
    storage.setItem('clinic-session-demo-v1', JSON.stringify(state));
    expect((await new DemoClinic(storage).request(path)).prescriptions[0].itemName).toBe(
      `Medication ID ${legacyRx.itemId}`,
    );
  });
  it('reprints original dispensing data across reload without stock or invoice writes', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const e = (await clinic.request('/dispensary/encounters')).data[0];
    const path = `/encounters/${e.id}/medicine-labels`;
    await expect(clinic.request(path)).rejects.toMatchObject({ status: 404 });
    const dispense = await clinic.request('/dispenses', 'POST', {
      encounterId: e.id,
      idempotencyKey: 'SAVED-LABEL-REPRINT-KEY',
    });
    const stock = await clinic.request('/inventory'),
      invoices = await clinic.request('/invoices');
    const first = await clinic.request(path);
    expect(first).toMatchObject({
      id: e.id,
      patientName: e.patientName,
      practitionerName: e.practitionerName,
      dispensedAt: dispense.createdAt,
      prescriptions: [
        expect.objectContaining({
          itemName: e.prescriptions[0].itemName,
          quantity: e.prescriptions[0].quantity,
        }),
      ],
    });
    const restored = new DemoClinic(storage);
    await restored.request('/auth/login', 'POST', {
      email: 'admin@example.test',
      password: 'demo',
    });
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 2 * 86400000));
      expect(await restored.request(path)).toEqual(first);
      expect(await restored.request('/inventory')).toEqual(stock);
      expect(await restored.request('/invoices')).toEqual(invoices);
    } finally {
      vi.useRealTimers();
    }
    await expect(restored.request(path, 'GET', undefined, 2)).rejects.toMatchObject({
      status: 404,
    });
    await restored.request('/auth/login', 'POST', {
      email: 'cashier@example.test',
      password: 'demo',
    });
    await expect(restored.request(path)).rejects.toMatchObject({ status: 403 });
  });
});
