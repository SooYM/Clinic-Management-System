"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "../Modal";
import {
  DEFAULT_PORTAL_CONFIG,
  type ClinicPortalConfig,
} from "../../lib/data/clinic-store";
import { Building2, Check, RotateCcw, Sparkles } from "lucide-react";

interface PortalSettingsModalProps {
  onClose: () => void;
  config: ClinicPortalConfig;
  onSave: (updates: Partial<ClinicPortalConfig>) => void;
  onReset: () => void;
}


export function PortalSettingsModal({
  onClose,
  config,
  onSave,
  onReset,
}: PortalSettingsModalProps) {
  const [formData, setFormData] = useState<ClinicPortalConfig>({ ...config });
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.portalName.trim()) return;
    onSave({
      portalName: formData.portalName.trim(),
      portalTagline: formData.portalTagline.trim(),
      legalEntityName: formData.legalEntityName.trim(),
      branchName: formData.branchName.trim(),
      addressLine: formData.addressLine.trim(),
      customDuitNowQrImage: formData.customDuitNowQrImage,
    });
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 450);
  };


  const handleResetToDefault = () => {
    setFormData({ ...DEFAULT_PORTAL_CONFIG });
    onReset();
  };

  const brandInitial =
    formData.portalName.trim().charAt(0).toUpperCase() || "C";

  return (
    <Modal
      labelledBy="portal-settings-title"
      closeLabel="Close Portal Settings"
      onClose={onClose}
    >
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div className="pb-3 border-b border-[var(--line)]">
          <div>
            <span className="badge badge-blue mb-1">ADMIN SETTINGS</span>
          </div>
          <h2
            id="portal-settings-title"
            className="text-xl font-extrabold text-[var(--navy)]"
          >
            Portal & Clinic Branding
          </h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Admin can customize the clinic portal name, taglines, legal entity,
            and document headers in real time.
          </p>
        </div>

        {/* Live Preview Card */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 via-indigo-50/40 to-slate-50 border border-sky-100/80 shadow-sm space-y-2">
          <span className="text-[0.68rem] font-bold text-sky-800 uppercase tracking-wide flex items-center gap-1">
            <Sparkles size={12} className="text-sky-600" />
            Live Header & Document Preview
          </span>
          <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-[var(--line)] shadow-sm">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shrink-0">
              {brandInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-[var(--navy)] truncate tracking-tight">
                {formData.portalName || "PORTAL NAME"}
              </div>
              <div className="text-[0.68rem] font-semibold text-[var(--muted)] tracking-wider uppercase truncate">
                {formData.portalTagline || "CLINIC TAGLINE"}
              </div>
            </div>
            <div className="text-right shrink-0 border-l border-[var(--line)] pl-3">
              <div className="text-[0.65rem] font-bold text-[var(--blue-on-soft)] bg-[var(--blue-soft)] px-2 py-0.5 rounded">
                {formData.branchName || "Main Branch"}
              </div>
              <div className="text-[0.62rem] text-[var(--muted)] mt-0.5 truncate max-w-[120px]">
                {formData.legalEntityName || "Official Entity"}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Portal Name */}
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Portal / Clinic Display Name{" "}
                <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.portalName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    portalName: e.target.value,
                  }))
                }
                placeholder="e.g. KLINIK SENTRAL"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-bold text-[var(--navy)]"
              />
              <span className="text-[0.68rem] text-[var(--muted)] mt-1 block">
                Primary name displayed in topbar, navigation header, and browser
                title.
              </span>
            </div>

            {/* 2. Subtitle / Tagline */}
            <div>
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Specialty / Subtitle Tagline
              </label>
              <input
                type="text"
                value={formData.portalTagline}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    portalTagline: e.target.value,
                  }))
                }
                placeholder="e.g. Medical & Aesthetic Specialist"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-medium"
              />
            </div>

            {/* 3. Branch Name */}
            <div>
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Branch Display Name
              </label>
              <input
                type="text"
                value={formData.branchName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    branchName: e.target.value,
                  }))
                }
                placeholder="e.g. KL Sentral Branch"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-medium"
              />
            </div>

            {/* 4. Legal Entity Name */}
            <div>
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Official Registered Entity (Invoices & MCs)
              </label>
              <input
                type="text"
                value={formData.legalEntityName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    legalEntityName: e.target.value,
                  }))
                }
                placeholder="e.g. Klinik Sentral Sdn Bhd"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-medium"
              />
            </div>

            {/* 5. Address Lines */}
            <div>
              <label className="text-xs font-bold text-[var(--ink)] block mb-1">
                Clinic Location / Address
              </label>
              <input
                type="text"
                value={formData.addressLine}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    addressLine: e.target.value,
                  }))
                }
                placeholder="e.g. Kuala Lumpur, Malaysia"
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] focus:bg-[var(--surface)] focus:border-[var(--blue)] font-medium"
              />
            </div>

            {/* 6. Clinic DuitNow QR Upload */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[var(--navy)] block">
                    Clinic DuitNow QR Code (POS Payment)
                  </span>
                  <span className="text-[0.68rem] text-[var(--muted)]">
                    Upload your clinic's official DuitNow QR image to display at checkout.
                  </span>
                </div>
                {formData.customDuitNowQrImage && (
                  <span className="badge badge-mint text-[0.65rem]">Active Custom QR</span>
                )}
              </div>

              {formData.customDuitNowQrImage ? (
                <div className="flex items-center gap-4 bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--line)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.customDuitNowQrImage}
                    alt="Custom DuitNow QR"
                    className="w-16 h-16 object-contain rounded border border-[var(--line)] bg-white p-1"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-[var(--ink)] block truncate">
                      Custom DuitNow QR Image Loaded
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          customDuitNowQrImage: undefined,
                        }))
                      }
                      className="text-[0.68rem] font-bold text-[var(--danger)] hover:underline mt-1 cursor-pointer"
                    >
                      Remove & Use System QR
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const base64 = evt.target?.result as string;
                        if (base64) {
                          setFormData((prev) => ({
                            ...prev,
                            customDuitNowQrImage: base64,
                          }));
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-xs text-[var(--muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[var(--blue-soft)] file:text-[var(--blue)] hover:file:bg-[var(--blue)] hover:file:text-white file:cursor-pointer"
                  />
                  <span className="text-[0.65rem] text-[var(--muted)] mt-1 block">
                    Upload PNG, JPG, or SVG image of your clinic's DuitNow QR code.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="btn-secondary text-xs gap-1.5 text-[var(--muted)] hover:text-[var(--danger)]"
            >
              <RotateCcw size={14} />
              <span>Reset to Default</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary text-xs gap-1.5 px-4 font-bold"
              >
                {isSaved ? (
                  <>
                    <Check size={14} />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Building2 size={14} />
                    <span>Save Portal Details</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
