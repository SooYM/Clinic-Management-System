-- Application permissions and signed encounter prices authorize no-charge receipts.
ALTER TABLE invoices
  DROP CHECK invoices_chk_1,
  ADD CONSTRAINT invoices_chk_1 CHECK (total_cents >= 0);
