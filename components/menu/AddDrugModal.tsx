"use client";

import { useState } from "react";
import { Modal } from "../Modal";
import { type InventoryItemData } from "../../lib/data/clinic-store";
import { notify } from "../toast";
import { Pill, Plus } from "lucide-react";

interface AddDrugModalProps {
  onClose: () => void;
  onAdd: (item: InventoryItemData) => void;
}

export function AddDrugModal({ onClose, onAdd }: AddDrugModalProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState(`MED-${Math.floor(1000 + Math.random() * 9000)}`);
  const [category, setCategory] = useState<"MEDICATION" | "AESTHETIC_CONSUMABLE" | "SKINCARE_RETAIL">("MEDICATION");
  const [strength, setStrength] = useState("500mg");
  const [dosageForm, setDosageForm] = useState("Tablet");
  const [instructions, setInstructions] = useState("1 tablet twice daily after meals");
  const [sellingPrice, setSellingPrice] = useState(15.0);
  const [minimumParLevel, setMinimumParLevel] = useState(50);
  const [initialQuantity, setInitialQuantity] = useState(100);
  const [batchNumber, setBatchNumber] = useState(`LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`);
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      notify("Please provide a medication name.", "error");
      return;
    }
    if (!sku.trim()) {
      notify("Please provide an SKU code.", "error");
      return;
    }

    const newItem: InventoryItemData = {
      id: `inv-${Date.now()}`,
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      category,
      strength: strength.trim(),
      dosageForm: dosageForm.trim(),
      instructions: instructions.trim(),
      sellingPrice: Number(sellingPrice) || 0,
      minimumParLevel: Number(minimumParLevel) || 0,
      batches: [
        {
          batchNumber: batchNumber.trim().toUpperCase() || "BATCH-INITIAL",
          expiryDate: expiryDate || "2027-12-31",
          quantity: Number(initialQuantity) || 0,
        },
      ],
    };

    onAdd(newItem);
    notify(`Added ${newItem.name} to clinic formulary!`, "success");
    onClose();
  };

  return (
    <Modal
      labelledBy="add-drug-title"
      closeLabel="Close Add Drug Dialog"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl pr-2">
        <div className="pb-2 border-b border-[var(--line)]">
          <span className="badge badge-mint mb-1">CLINIC FORMULARY REGISTRATION</span>
          <h2 id="add-drug-title" className="text-lg font-extrabold text-[var(--navy)]">
            Add New Drug to Clinic Master Formulary
          </h2>
          <p className="text-xs text-[var(--muted)]">
            Register a medication or aesthetic consumable for prescribing, stock receipt, and POS billing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              Medicine / Generic Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ciprofloxacin 500mg"
              className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-bold text-[var(--ink)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              SKU Code <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              required
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="e.g. MED-CIPRO-500"
              className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              Strength
            </label>
            <input
              type="text"
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              placeholder="e.g. 500mg, 10ml"
              className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              Dosage Form
            </label>
            <input
              type="text"
              value={dosageForm}
              onChange={(e) => setDosageForm(e.target.value)}
              placeholder="e.g. Tablet, Capsule"
              className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full text-xs p-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-medium"
            >
              <option value="MEDICATION">Medication (Rx)</option>
              <option value="AESTHETIC_CONSUMABLE">Aesthetic Consumable</option>
              <option value="SKINCARE_RETAIL">Skincare Retail</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
            Default Dosing / Dispensing Instructions
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="e.g. 1 tablet twice daily after meals"
            className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              Retail Selling Price (RM) <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(parseFloat(e.target.value) || 0)}
              className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--muted)] uppercase block mb-1">
              Min Par Level (Restock Warning) <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              required
              type="number"
              min="0"
              value={minimumParLevel}
              onChange={(e) => setMinimumParLevel(parseInt(e.target.value) || 0)}
              className="w-full text-xs p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] font-mono font-bold"
            />
          </div>
        </div>

        {/* Initial Stock Batch Entry */}
        <div className="p-3 bg-[var(--blue-soft)] border border-[var(--blue)]/20 rounded-xl space-y-2">
          <span className="text-xs font-extrabold text-[var(--blue-on-soft)] block">
            Initial Stock Batch Details (FEFO Engine)
          </span>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Batch Number</span>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
                className="w-full text-xs p-1.5 rounded border border-[var(--line)] bg-[var(--surface)] font-mono"
              />
            </div>
            <div>
              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Expiry Date</span>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full text-xs p-1.5 rounded border border-[var(--line)] bg-[var(--surface)]"
              />
            </div>
            <div>
              <span className="text-[0.65rem] font-bold text-[var(--muted)] uppercase block">Opening Units</span>
              <input
                type="number"
                min="0"
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(parseInt(e.target.value) || 0)}
                className="w-full text-xs p-1.5 rounded border border-[var(--line)] bg-[var(--surface)] font-mono"
              />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--line)] flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary text-xs">
            Save & Add Drug to Formulary
          </button>
        </div>
      </form>
    </Modal>
  );
}
