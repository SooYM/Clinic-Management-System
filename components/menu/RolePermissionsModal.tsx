import { Modal } from "../Modal";
import {
  MENU,
  type RoleType,
} from "./modules";
import { type ModuleKey, type Role } from "../../lib/data/clinic-store";

interface RolePermissionsModalProps {
  onClose: () => void;
  rolePermissions: Record<Role, ModuleKey[]>;
  onTogglePermission: (role: Role, moduleKey: ModuleKey) => void;
  onGrantAll: (role: Role) => void;
  onResetDefaults: () => void;
}

const ROLES_TO_CUSTOMIZE: Array<{ id: Role; label: string; badgeClass: string }> = [
  { id: "receptionist", label: "Front Desk", badgeClass: "badge-blue" },
  { id: "doctor", label: "Doctor", badgeClass: "badge-mint" },
  { id: "nurse", label: "Nurse", badgeClass: "badge-amber" },
];

export function RolePermissionsModal({
  onClose,
  rolePermissions,
  onTogglePermission,
  onGrantAll,
  onResetDefaults,
}: RolePermissionsModalProps) {
  // Filter out the permissions and portal settings management tiles from customization (admin-only)
  const customizableModules = MENU.filter(
    (m) => m.key !== "permissions" && m.key !== "portal_settings"
  );

  return (
    <Modal
      labelledBy="role-permissions-title"
      closeLabel="Close Permissions Dialog"
      onClose={onClose}
    >
      <div className="space-y-5 max-w-4xl">
        {/* Header */}
        <div className="pb-3 border-b border-[var(--line)]">
          <div className="flex items-center justify-between">
            <span className="badge badge-blue mb-1">ADMIN ACCESS CONTROL</span>
            <span className="text-[0.68rem] text-[var(--muted)] font-mono">RBAC Engine v2.4</span>
          </div>
          <h2 id="role-permissions-title" className="text-xl font-extrabold text-[var(--navy)]">
            Role Access Control & Module Permissions
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Admin can grant or revoke access to any module for Front Desk, Doctors, and Nurses in real time.
          </p>
        </div>

        {/* Quick Batch Preset Buttons */}
        <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] space-y-2">
          <span className="text-[0.68rem] font-bold text-[var(--muted)] uppercase block">
            Quick Permission Presets:
          </span>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              className="btn-secondary text-xs py-1 px-2.5"
              onClick={onResetDefaults}
            >
              ↺ Reset to Clinical Defaults
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-1 px-2.5"
              onClick={() => onGrantAll("receptionist")}
            >
              + Grant All to Front Desk
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-1 px-2.5"
              onClick={() => onGrantAll("doctor")}
            >
              + Grant All to Doctor
            </button>
            <button
              type="button"
              className="btn-secondary text-xs py-1 px-2.5"
              onClick={() => onGrantAll("nurse")}
            >
              + Grant All to Nurse
            </button>
          </div>
        </div>

        {/* Permission Matrix Table */}
        <div className="max-h-[50vh] overflow-y-auto border border-[var(--line)] rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[var(--surface)] border-b border-[var(--line)] shadow-xs">
              <tr className="text-[var(--muted)] font-bold">
                <th className="py-2.5 px-3">Module Name & Capability</th>
                <th className="py-2.5 px-2 text-center w-28">
                  <span className="badge badge-blue">Front Desk</span>
                </th>
                <th className="py-2.5 px-2 text-center w-24">
                  <span className="badge badge-mint">Doctor</span>
                </th>
                <th className="py-2.5 px-2 text-center w-24">
                  <span className="badge badge-amber">Nurse</span>
                </th>
                <th className="py-2.5 px-2 text-center w-24">
                  <span className="badge badge-slate">Admin</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-[var(--surface)]">
              {customizableModules.map((module) => {
                const Icon = module.icon;
                return (
                  <tr key={module.key} className="hover:bg-[var(--surface-2)] transition-colors">
                    {/* Module Info */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-[var(--blue-soft)] text-[var(--blue)]">
                          <Icon size={16} strokeWidth={2} />
                        </div>
                        <div>
                          <div className="font-extrabold text-[var(--navy)]">
                            {module.label}
                            <span className="ml-1.5 text-[0.65rem] font-mono font-bold text-[var(--muted)]">
                              [Key {module.shortcut}]
                            </span>
                          </div>
                          <div className="text-[0.68rem] text-[var(--muted)]">
                            {module.description}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Front Desk Checkbox */}
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={rolePermissions.receptionist?.includes(module.key as ModuleKey)}
                        onChange={() => onTogglePermission("receptionist", module.key as ModuleKey)}
                        className="w-4 h-4 accent-[var(--blue)] cursor-pointer"
                        title={`Toggle ${module.label} for Front Desk`}
                      />
                    </td>

                    {/* Doctor Checkbox */}
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={rolePermissions.doctor?.includes(module.key as ModuleKey)}
                        onChange={() => onTogglePermission("doctor", module.key as ModuleKey)}
                        className="w-4 h-4 accent-[var(--mint-dark)] cursor-pointer"
                        title={`Toggle ${module.label} for Doctor`}
                      />
                    </td>

                    {/* Nurse Checkbox */}
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={rolePermissions.nurse?.includes(module.key as ModuleKey)}
                        onChange={() => onTogglePermission("nurse", module.key as ModuleKey)}
                        className="w-4 h-4 accent-[var(--warning)] cursor-pointer"
                        title={`Toggle ${module.label} for Nurse`}
                      />
                    </td>

                    {/* Admin (Always Full Access) */}
                    <td className="py-2.5 px-2 text-center">
                      <span className="badge badge-mint text-[0.65rem]">✓ Full</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between">
          <span className="text-[0.7rem] text-[var(--muted)]">
            * Changes take effect immediately. Assigned tiles will lock or unlock reactively.
          </span>
          <button type="button" className="btn-primary text-xs" onClick={onClose}>
            Done & Save Settings
          </button>
        </div>
      </div>
    </Modal>
  );
}
