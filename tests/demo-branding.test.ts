import { describe, expect, it } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
import { demoBranding } from '../src/client/demo-branding';
import { validLogo } from '../src/server/letterhead';

class Storage {
  entries = new Map<string, string>();
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
}
const login = (clinic: DemoClinic) =>
  clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
const replacementLogo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=';

describe('browser demo clinic branding', () => {
  it('provides the requested name and bounded embedded logo on fresh login and authenticated bootstrap', async () => {
    const clinic = new DemoClinic(new Storage());
    expect(await clinic.request('/public/branding')).toEqual(demoBranding);
    expect(demoBranding.name).toBe('CARE FOR U FAMILY CLINIC');
    expect(validLogo(demoBranding.logoDataUrl)).toBe(true);
    await expect(clinic.request('/admin/letterhead')).rejects.toMatchObject({ status: 401 });
    await login(clinic);
    expect((await clinic.request('/bootstrap')).tenant).toMatchObject(demoBranding);
  });

  it('reflects saved, removed and renamed branding after refresh without resetting records', async () => {
    const storage = new Storage();
    let clinic = new DemoClinic(storage);
    await login(clinic);
    const before = (await clinic.request('/patients')).data.length;
    const settings = await clinic.request('/admin/letterhead');
    await clinic.request('/admin/letterhead', 'PUT', { ...settings, logoDataUrl: replacementLogo });
    expect((await clinic.request('/bootstrap')).tenant.logoDataUrl).toBe(replacementLogo);
    await clinic.request('/admin/clinic', 'PUT', {
      name: 'Custom demo clinic',
      expectedName: demoBranding.name,
    });
    clinic = new DemoClinic(storage);
    expect(await clinic.request('/public/branding')).toEqual({
      name: 'Custom demo clinic',
      logoDataUrl: replacementLogo,
    });
    expect((await clinic.request('/patients')).data).toHaveLength(before);
    const updated = await clinic.request('/admin/letterhead');
    await clinic.request('/admin/letterhead', 'PUT', { ...updated, logoDataUrl: '' });
    expect((await new DemoClinic(storage).request('/bootstrap')).tenant).toMatchObject({
      name: 'Custom demo clinic',
      logoDataUrl: '',
    });
    clinic.reset();
    expect(await clinic.request('/public/branding')).toEqual(demoBranding);
  });

  it('upgrades only the old default name and missing logo settings in existing sessions', async () => {
    for (const name of ['Klinik Seri Harmoni', 'User clinic']) {
      const storage = new Storage();
      const clinic = new DemoClinic(storage);
      await login(clinic);
      const [key, serialized] = [...storage.entries][0];
      const state = JSON.parse(serialized);
      state.rows.tenants[0].name = name;
      delete state.rows.tenants[0].demoBrandingVersion;
      state.rows.tenants[0].letterhead = {
        logoDataUrl: '',
        header: 'User header',
        address: '',
        footer: '',
      };
      storage.setItem(key, JSON.stringify(state));
      const upgraded = new DemoClinic(storage);
      expect(await upgraded.request('/public/branding')).toEqual({
        name: name === 'Klinik Seri Harmoni' ? demoBranding.name : name,
        logoDataUrl: '',
      });
      expect((await upgraded.request('/admin/letterhead')).header).toBe('User header');
    }
  });
});
