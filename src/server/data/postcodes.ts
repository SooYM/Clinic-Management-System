import { readFileSync } from 'node:fs';
import type { PostcodeEntry } from '../../shared/postcode.js';
/** Offline table reused from Car Loan. Source: AsyrafHussin/malaysia-postcodes (MIT); see postcodes.LICENSE. */
const table: Record<string, [string, string][]> = JSON.parse(
  readFileSync(new URL('./postcodes.json', import.meta.url), 'utf8'),
);
const stateLabels: Record<string, string> = {
  JOHOR: 'Johor',
  KEDAH: 'Kedah',
  KELANTAN: 'Kelantan',
  MELAKA: 'Melaka',
  NEGERI_SEMBILAN: 'Negeri Sembilan',
  PAHANG: 'Pahang',
  PULAU_PINANG: 'Pulau Pinang',
  PERAK: 'Perak',
  PERLIS: 'Perlis',
  SABAH: 'Sabah',
  SARAWAK: 'Sarawak',
  SELANGOR: 'Selangor',
  TERENGGANU: 'Terengganu',
  WP_KUALA_LUMPUR: 'Wilayah Persekutuan Kuala Lumpur',
  WP_PUTRAJAYA: 'Wilayah Persekutuan Putrajaya',
  WP_LABUAN: 'Wilayah Persekutuan Labuan',
};
export function lookupPostcode(postcode: string): PostcodeEntry[] {
  return (Object.prototype.hasOwnProperty.call(table, postcode) ? table[postcode] : []).map(
    ([city, state]) => ({ postcode, city, state: stateLabels[state] || state }),
  );
}
