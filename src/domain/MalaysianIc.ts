/** Infer gender from a Malaysian 12-digit MyKad number. */
export function genderFromMalaysianIc(value: string): "Female" | "Male" | null {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{12}$/.test(digits)) return null;

  return Number(digits[11]) % 2 === 0 ? "Female" : "Male";
}

/** Store Malaysian MyKad numbers consistently so punctuation cannot bypass duplicate checks. */
export function normalizeMalaysianIc(value: string): string {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{12}$/.test(digits)
    ? `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
    : value.trim().toUpperCase();
}

/** Return a canonical Malaysian phone number, or null for an incomplete number. */
export function normalizeMalaysianPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");
  const international = compact.startsWith("+")
    ? compact
    : compact.startsWith("0")
      ? `+60${compact.slice(1)}`
      : null;
  if (!international || !/^\+60\d{8,10}$/.test(international)) return null;

  const national = international.slice(3);
  const validMobile = /^1\d{8,9}$/.test(national);
  const validLandline = /^3\d{8}$/.test(national) || /^[4-9]\d{7}$/.test(national);
  return validMobile || validLandline ? international : null;
}
