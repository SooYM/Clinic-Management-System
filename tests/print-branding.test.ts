import { describe, expect, it, vi } from 'vitest';
import { readPrintBranding } from '../src/server/letterhead';
import { ClinicService } from '../src/server/service';
import { buildDocumentView } from '../src/shared/document-view';

const logo =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC9sAAAAASUVORK5CYII=';
const settings = {
  logoDataUrl: logo,
  header: 'Clinic contact',
  address: 'Letterhead address',
  footer: 'Clinic footer',
};
const identity = {
  clinic_name: 'Fictional Clinic',
  branch_name: 'Fictional Branch',
  clinic_address: 'Branch address',
};
const context: any = { actor: { tenantId: 3 }, branchId: 4 };
describe('printed clinic branding', () => {
  it('uses saved clinic identity on new clinical documents and retains legacy branch-name fallback', () => {
    const input = {
      id: 1,
      kind: 'MC' as const,
      documentNumber: 'QA-PRINT',
      createdAt: '2026-10-27T00:00:00Z',
      diagnosisRedacted: true,
      payload: {
        clinicName: 'Saved clinic',
        branchName: 'Saved branch',
        branchAddress: 'Saved address',
        ...settings,
      },
    };
    expect(buildDocumentView(input)).toMatchObject({
      clinicName: 'Saved clinic',
      clinicAddress: 'Saved address',
      logoDataUrl: logo,
      header: settings.header,
      footer: settings.footer,
    });
    const { clinicName, ...legacy } = input.payload;
    expect(buildDocumentView({ ...input, payload: legacy }).clinicName).toBe('Saved branch');
  });
  it('uses only the requested tenant/branch and resolves the configured letterhead address', async () => {
    const query = vi.fn(async (sql: string, values: any[]): Promise<any> => {
      if (sql.includes('FROM tenants t')) {
        expect(values).toEqual([3, 4]);
        return { rows: [identity], rowCount: 1 };
      }
      expect(values).toEqual([3]);
      return { rows: [{ letterhead: settings }], rowCount: 1 };
    });
    expect(await readPrintBranding({ query }, 3, 4)).toEqual({
      ...settings,
      clinicName: identity.clinic_name,
      branchName: identity.branch_name,
      clinicAddress: settings.address,
    });
  });
  it('uses the branch address when no custom address is configured and rejects foreign branches', async () => {
    const query = async (sql: string): Promise<any> => ({
      rows: sql.includes('FROM tenants t')
        ? [identity]
        : [{ letterhead: { ...settings, address: '' } }],
      rowCount: 1,
    });
    expect((await readPrintBranding({ query }, 3, 4)).clinicAddress).toBe(identity.clinic_address);
    await expect(
      readPrintBranding({ query: async () => ({ rows: [], rowCount: 0 }) }, 3, 99),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('retains dispense-time branding without reading current settings when reprinting saved stickers', async () => {
    const snapshot = {
      ...settings,
      clinicName: 'Original clinic',
      branchName: 'Original branch',
      clinicAddress: 'Original address',
    };
    const query = vi.fn(async (): Promise<any> => ({
      rows: [
        {
          id: 1,
          patient_id: 2,
          patient_name: 'Fictional Patient',
          practitioner_name: 'Fictional GP',
          dispensed_at: '2026-10-27 00:00:00',
          label_snapshot: snapshot,
          prescriptions: [
            {
              itemId: 1,
              itemName: 'Saved medicine',
              unit: 'tablet',
              quantity: 3,
              dosage: 'Saved directions',
              durationDays: 3,
            },
          ],
        },
      ],
      rowCount: 1,
    }));
    const labels = await new ClinicService({ query }).medicineLabels(context, 1);
    expect(labels).toMatchObject(snapshot);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('reads current scoped branding for historical dispenses without writing a snapshot', async () => {
    const query = vi.fn(async (sql: string, values?: any[]): Promise<any> => {
      expect(sql).toMatch(/^SELECT/);
      if (sql.includes('FROM encounters e')) {
        expect(values).toEqual([1, 3, 4]);
        return {
          rows: [
            {
              id: 1,
              patient_id: 2,
              patient_name: 'Fictional Patient',
              practitioner_name: 'Fictional GP',
              dispensed_at: '2026-10-27 00:00:00',
              label_snapshot: null,
              prescriptions: [
                {
                  itemId: 1,
                  itemName: 'Saved medicine',
                  unit: 'tablet',
                  quantity: 3,
                  dosage: 'Saved directions',
                  durationDays: 3,
                },
              ],
            },
          ],
          rowCount: 1,
        };
      }
      return {
        rows: sql.includes('FROM tenants t') ? [identity] : [{ letterhead: settings }],
        rowCount: 1,
      };
    });
    expect(await new ClinicService({ query }).medicineLabels(context, 1)).toMatchObject({
      ...settings,
      clinicName: identity.clinic_name,
      clinicAddress: settings.address,
    });
  });
});
