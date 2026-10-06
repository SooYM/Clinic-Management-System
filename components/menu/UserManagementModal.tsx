"use client";

import { useState } from "react";
import { Modal } from "../Modal";
import { type StaffUserRecord, type Role } from "../../lib/data/clinic-store";
import { notify } from "../toast";
import { Users, UserPlus, Stethoscope, ShieldCheck } from "lucide-react";

interface UserManagementModalProps {
  onClose: () => void;
  staffList: StaffUserRecord[];
  onRegisterStaff: (params: {
    fullName: string;
    email: string;
    role: Role;
    specialty?: string;
    licenseNumber?: string;
  }) => void;
}

export function UserManagementModal({
  onClose,
  staffList,
  onRegisterStaff,
}: UserManagementModalProps) {
  const [activeTab, setActiveTab] = useState<"roster" | "register">("roster");

  // Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("doctor");
  const [specialty, setSpecialty] = useState("General Practice & Family Medicine");
  const [licenseNumber, setLicenseNumber] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      notify("Please enter staff member's full name.", "error");
      return;
    }
    if (!email.trim()) {
      notify("Please provide a valid email address.", "error");
      return;
    }

    onRegisterStaff({
      fullName: fullName.trim(),
      email: email.trim(),
      role,
      specialty: role === "doctor" ? specialty.trim() : undefined,
      licenseNumber: role === "doctor" ? licenseNumber.trim() : undefined,
    });

    notify(`Successfully registered ${fullName.trim()} as ${role.toUpperCase()}!`, "success");

    // Reset and go back to roster
    setFullName("");
    setEmail("");
    setLicenseNumber("");
    setActiveTab("roster");
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
            Register clinic personnel, manage doctor credentials, and provision consultation rooms.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
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
                    <th className="pb-3">Full Name</th>
                    <th className="pb-3">System Role</th>
                    <th className="pb-3">Clinical Specialty</th>
                    <th className="pb-3">MMC / License No.</th>
                    <th className="pb-3">Work Email</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="py-3 font-extrabold text-[var(--ink)]">
                        {staff.fullName}
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
                      <td className="py-3 text-right">
                        <span className="badge badge-mint text-[0.65rem]">
                          ● Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-[var(--muted)] border-t border-[var(--line)]">
              <span>Attending doctors automatically receive room allocation & digital signing privileges.</span>
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
                  Email Address <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. kelvin.ong@clinic.com"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                />
              </div>

              {role === "doctor" ? (
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
              ) : (
                <div>
                  <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                    Department / Shift
                  </label>
                  <input
                    type="text"
                    defaultValue="Outpatient Department · Day Shift"
                    className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
                  />
                </div>
              )}
            </div>

            {role === "doctor" && (
              <div>
                <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
                  Doctor Specialty & Subspecialty
                </label>
                <input
                  type="text"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="e.g. General Practice, Pediatrics, Dermatology"
                  className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
                />
                <span className="text-[0.68rem] text-[var(--muted)] mt-1 block">
                  A consultation room will automatically be assigned to this doctor upon creation.
                </span>
              </div>
            )}

            <div className="pt-3 border-t border-[var(--line)] flex justify-between items-center">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setActiveTab("roster")}
              >
                Back to Roster
              </button>
              <button type="submit" className="btn-primary text-xs">
                Register & Activate User
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
