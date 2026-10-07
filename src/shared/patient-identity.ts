export interface MalaysianIdentity {
  nationalId: string;
  dateOfBirth: string;
  sex: 'MALE' | 'FEMALE';
}
/** Progressive IC formatting for input fields. Validation belongs to parseMalaysianIc. */
export function formatMalaysianIc(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  return [digits.slice(0, 6), digits.slice(6, 8), digits.slice(8, 12)].filter(Boolean).join('-');
}
/** YY dates infer the latest nonfuture century. Registration may supply a matching older-century birth date. */
export function parseMalaysianIc(
  value: string,
  currentYear = new Date().getFullYear(),
): MalaysianIdentity {
  if (!/^\d{12}$|^\d{6}-\d{2}-\d{4}$/.test(value.trim()))
    throw new Error('Malaysian IC must contain 12 digits.');
  if (!Number.isInteger(currentYear) || currentYear < 1900 || currentYear > 9999)
    throw new Error('Current year is invalid.');
  const digits = value.trim().replace(/-/g, ''),
    yearSuffix = Number(digits.slice(0, 2));
  let year = Math.floor(currentYear / 100) * 100 + yearSuffix;
  if (year > currentYear) year -= 100;
  const month = Number(digits.slice(2, 4)),
    day = Number(digits.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error('Malaysian IC contains an invalid birth date.');
  return {
    nationalId: formatMalaysianIc(digits),
    dateOfBirth: date.toISOString().slice(0, 10),
    sex: Number(digits.at(-1)) % 2 ? 'MALE' : 'FEMALE',
  };
}
