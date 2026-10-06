"use client";

import { useState } from "react";
import { Modal } from "../Modal";
import { type StaffUserRecord, type Role } from "../../lib/data/clinic-store";
import { notify } from "../toast";
import { Users, UserPlus, KeyRound, Copy, Wand2, ShieldOff, ShieldCheck, Check } from "lucide-react";

interface UserManagementModalProps {
  onClose: () => void;
  staffList: StaffUserRecord[];
  onRegisterStaff: (params: {
    username?: string;
    fullName: string;
    email: string;
    password?: string;
    role: Role;
    specialty?: string;
    licenseNumber?: string;
  }) => Promise<any> | void;
  onResetPassword?: (staffId: string, newPassword: string) => Promise<boolean>;
  onToggleStatus?: (staffId: string, active: boolean) => Promise<boolean>;
}

/** Readable temporary password: no ambiguous characters (0/O, 1/l/I), matching Car Loan architecture */
function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  window.crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < buf.length; i++) out += chars.charAt(buf[i] % chars.length);
  return out;
}

export function UserManagementModal({
  onClose,
  staffList,
  onRegisterStaff,
  onResetPassword,
  onToggleStatus,
}: UserManagementModalProps) {
  const [activeTab, setActiveTab] = useState<"roster" | "register">("roster");

  // Registration Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [role, setRole] = useState<Role>("doctor");
  const [specialty, setSpecialty] = useState("General Practice & Family Medicine");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [busy, setBusy] = useState(false);

  // Success alert state (matching Car Loan RegisterClerk)
  const [createdAccount, setCreatedAccount] = useState<{
    username: string;
    fullName: string;
    password: string;
  } | null>(null);

  // Reset Password Dialog State
  const [resettingUser, setResettingUser] = useState<StaffUserRecord | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (!username || username === email.split("@")[0]) {
      setUsername(val.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      notify("Please enter staff member's full name.", "error");
      return;
    }
    if (!email.trim()) {
      notify("Please provide a valid email address.", "error");
      return;
    }
    if (!password.trim() || password.length < 6) {
      notify("Temporary password must be at least 6 characters.", "error");
      return;
    }

    setBusy(true);
    try {
      const finalUsername = (username.trim() || email.split("@")[0]).toLowerCase();
      await onRegisterStaff({
        username: finalUsername,
        fullName: fullName.trim(),
        email: email.trim(),
        password: password.trim(),
        role,
        specialty: role === "doctor" ? specialty.trim() : undefined,
        licenseNumber: role === "doctor" ? licenseNumber.trim() : undefined,
      });

      setCreatedAccount({
        username: finalUsername,
        fullName: fullName.trim(),
        password: password.trim(),
      });

      // Reset form
      setFullName("");
      setEmail("");
      setUsername("");
      setPassword(generatePassword());
      setLicenseNumber("");
      setActiveTab("roster");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Registration failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenResetDialog = (staff: StaffUserRecord) => {
    setResettingUser(staff);
    setResetPasswordVal(generatePassword());
  };

  const handleConfirmResetPassword = async () => {
    if (!resettingUser || !onResetPassword) return;
    if (resetPasswordVal.length < 6) {
      notify("Password must be at least 6 characters.", "error");
      return;
    }
    setResetBusy(true);
    try {
      const success = await onResetPassword(resettingUser.id, resetPasswordVal);
      if (success) {
        setCreatedAccount({
          username: resettingUser.username || resettingUser.email,
          fullName: resettingUser.fullName,
          password: resetPasswordVal,
        });
        setResettingUser(null);
      }
    } finally {
      setResetBusy(false);
    }
  };

  const handleToggleStatus = async (staff: StaffUserRecord) => {
    if (!onToggleStatus) return;
    await onToggleStatus(staff.id, !staff.isActive);
  };

  return (
    <Modal
      labelledBy="user-mgmt-title"
      closeLabel="Close User Management Dialog"
      onClose={onClose}
    >
      <div className="space-y-5 max-w-4xl pr-2">
        {/* Header */}
        <div className="pb-3 border-b border-[var(--line)]">
          <span className="badge badge-blue mb-1">CLINIC ADMINISTRATION</span>
          <h2 id="user-mgmt-title" className="text-lg font-extrabold text-[var(--navy)]">
            Staff & Doctor Management
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Register clinic staff credentials, provision login access, and reset passwords.
          </p>
        </div>

        {/* Temporary Password Banner (shown after creation or reset, matching Car Loan) */}
        {createdAccount && (
          <div className="p-3.5 rounded-xl bg-[var(--mint-soft)] border border-[var(--mint)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--mint-dark)] flex items-center gap-1.5">
                <Check size={15} />
                <span>Temporary credentials issued for <b>{createdAccount.fullName}</b> ({createdAccount.username})</span>
              </span>
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                onClick={() => setCreatedAccount(null)}
              >
                ✕ Dismiss
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-sm font-mono font-bold bg-[var(--surface)] text-[var(--ink)] px-2.5 py-1 rounded border border-[var(--line)]">
                {createdAccount.password}
              </code>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 font-bold"
                onClick={() => {
                  navigator.clipboard.writeText(createdAccount.password);
                  notify("Temporary password copied to clipboard!", "success");
                }}
              >
                <Copy size={13} />
                <span>Copy Password</span>
              </button>
            </div>
            <p className="text-[0.68rem] text-[var(--muted)]">
              Write down or copy this password to give to the staff member. They can log in immediately with their username or email.
            </p>
          </div>
        )}

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === "roster"
                ? "bg-[var(--blue-soft)] text-[var(--blue-on-soft)] font-extrabold"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
            onClick={() => setActiveTab("roster")}
          >
            <Users size={14} />
            <span>Active Staff Directory ({staffList.length})</span>
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === "register"
                ? "bg-[var(--blue-soft)] text-[var(--blue-on-soft)] font-extrabold"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
            onClick={() => setActiveTab("register")}
          >
            <UserPlus size={14} />
            <span>➕ Register New Staff / Doctor</span>
          </button>
        </div>

        {/* TAB 1: ACTIVE STAFF ROSTER */}
        {activeTab === "roster" && (
          <div className="space-y-4">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[var(--muted)] font-bold">
                    <th className="pb-3">Staff Member</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Specialty</th>
                    <th className="pb-3">License No.</th>
                    <th className="pb-3">Email / Username</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="py-3 font-extrabold text-[var(--ink)]">
                        <div>{staff.fullName}</div>
                        {staff.username && (
                          <div className="text-[0.65rem] font-mono text-[var(--muted)]">@{staff.username}</div>
                        )}
                      </td>
                      <td className="py-3">
                        <span
                          className={`badge ${
                            staff.role === "doctor"
                              ? "badge-mint"
                              : staff.role === "manager"
                              ? "badge-blue"
                              : staff.role === "nurse"
                              ? "badge-amber"
                              : "badge-lavender"
                          }`}
                        >
                          {staff.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-[var(--muted)]">
                        {staff.specialty || "—"}
                      </td>
                      <td className="py-3 font-mono font-bold text-[var(--blue-on-soft)]">
                        {staff.licenseNumber || "—"}
                      </td>
                      <td className="py-3 text-[var(--muted)] font-mono">
                        {staff.email}
                      </td>
                      <td className="py-3">
                        <span
                          className={`badge text-[0.65rem] ${
                            staff.isActive !== false ? "badge-mint" : "badge-amber text-red-600"
                          }`}
                        >
                          {staff.isActive !== false ? "● Active" : "○ Revoked"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-secondary text-[0.7rem] py-1 px-2 flex items-center gap-1 font-bold"
                            onClick={() => handleOpenResetDialog(staff)}
                            title="Reset Staff Password"
                          >
                            <KeyRound size={12} />
                            <span>Reset Pwd</span>
                          </button>
                          {onToggleStatus && (
                            <button
                              type="button"
                              className={`btn-secondary text-[0.7rem] py-1 px-2 flex items-center gap-1 ${
                                staff.isActive !== false ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]" : "text-[var(--success)]"
                              }`}
                              onClick={() => handleToggleStatus(staff)}
                              title={staff.isActive !== false ? "Revoke Access" : "Restore Access"}
                            >
                              {staff.isActive !== false ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                              <span>{staff.isActive !== false ? "Revoke" : "Restore"}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-[var(--muted)] border-t border-[var(--line)]">
              <span>All registered staff members can log in using their username/email and assigned password.</span>
              <button
                type="button"
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                onClick={() => setActiveTab("register")}
              >
                <span>➕</span>
                <span>Add Doctor / Staff</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: REGISTER NEW USER / DOCTOR */}
        {activeTab === "register" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Full Name <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Kelvin Ong / Nurse Lee"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--ink)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  System Role <span className="text-[var(--danger)]">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--blue)]"
                >
                  <option value="doctor">Doctor / Attending Physician</option>
                  <option value="receptionist">Receptionist / Front Desk</option>
                  <option value="nurse">Clinical Nurse</option>
                  <option value="manager">Clinic Manager / Administrator</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Work Email <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="e.g. kelvin.ong@clinic.com"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Login Username <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                  placeholder="e.g. kelvin.ong"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>
            </div>

            {/* Password input with Car Loan style generator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Temporary Password <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary text-xs p-2.5 flex items-center gap-1 font-bold"
                  onClick={() => {
                    const p = generatePassword();
                    setPassword(p);
                    notify("Generated new secure password.", "info");
                  }}
                >
                  <Wand2 size={13} />
                  <span>Generate Random</span>
                </button>
              </div>
            </div>

            {role === "doctor" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                    MMC / Medical License Number <span className="text-[var(--danger)]">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. MMC-61029"
                    className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                    Doctor Specialty
                  </label>
                  <input
                    type="text"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="e.g. General Practice, Pediatrics, Dermatology"
                    className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                  />
                </div>
              </div>
            )}

            <div className="modal-footer justify-between">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setActiveTab("roster")}
              >
                Back to Roster
              </button>
              <button type="submit" disabled={busy} className="btn-primary text-xs">
                {busy ? "Registering..." : "Register & Activate Staff Account"}
              </button>
            </div>
          </form>
        )}

        {/* RESET PASSWORD DIALOG (matching Car Loan ResetPasswordDialog) */}
        {resettingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] p-6 shadow-xl border border-[var(--line)] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                <h3 className="text-base font-extrabold text-[var(--navy)] flex items-center gap-2">
                  <KeyRound size={16} />
                  <span>Reset Password: {resettingUser.fullName}</span>
                </h3>
                <button
                  type="button"
                  className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                  onClick={() => setResettingUser(null)}
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[var(--muted)]">
                Their old password will stop working immediately. Write down or copy the new temporary password and give it to them in person.
              </p>

              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  New Temporary Password
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={resetPasswordVal}
                    onChange={(e) => setResetPasswordVal(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold text-[var(--ink)]"
                  />
                  <button
                    type="button"
                    className="btn-secondary text-xs py-2 px-2.5 shrink-0 flex items-center gap-1 font-bold"
                    onClick={() => {
                      setResetPasswordVal(generatePassword());
                    }}
                    title="Generate another"
                  >
                    <Wand2 size={13} />
                    <span>Generate</span>
                  </button>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setResettingUser(null)}
                  disabled={resetBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger text-xs font-bold"
                  onClick={handleConfirmResetPassword}
                  disabled={resetBusy}
                >
                  {resetBusy ? "Updating..." : "Confirm Password Reset"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
