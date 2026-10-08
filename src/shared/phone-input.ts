// Calling codes: https://www.itu.int/oth/t0202 (national numbering plans).
// Other countries remain supported through the full international-number option.
export const phoneCountries = [
  ['+60', 'Malaysia'],
  ['+65', 'Singapore'],
  ['+673', 'Brunei'],
  ['+62', 'Indonesia'],
  ['+66', 'Thailand'],
  ['+63', 'Philippines'],
  ['+84', 'Vietnam'],
  ['+95', 'Myanmar'],
  ['+855', 'Cambodia'],
  ['+856', 'Laos'],
  ['+86', 'China'],
  ['+852', 'Hong Kong'],
  ['+853', 'Macao'],
  ['+886', 'Taiwan'],
  ['+81', 'Japan'],
  ['+82', 'South Korea'],
  ['+91', 'India'],
  ['+92', 'Pakistan'],
  ['+880', 'Bangladesh'],
  ['+94', 'Sri Lanka'],
  ['+977', 'Nepal'],
  ['+61', 'Australia'],
  ['+64', 'New Zealand'],
  ['+44', 'United Kingdom'],
  ['+1', 'United States / Canada'],
  ['+33', 'France'],
  ['+49', 'Germany'],
  ['+39', 'Italy'],
  ['+34', 'Spain'],
  ['+31', 'Netherlands'],
  ['+971', 'United Arab Emirates'],
  ['+966', 'Saudi Arabia'],
  ['+974', 'Qatar'],
  ['+90', 'Türkiye'],
  ['+20', 'Egypt'],
  ['+27', 'South Africa'],
] as const;

export function splitPhone(value = '') {
  if (!value.trim().startsWith('+')) return { code: '+60', number: value };
  const match = [...phoneCountries]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([code]) => value.trim().startsWith(code));
  return match
    ? { code: match[0], number: value.trim().slice(match[0].length).trimStart() }
    : { code: '', number: value };
}

export function joinPhone(code: string, number: string) {
  const value = number.trim();
  if (!value) return '';
  // Pasted international numbers already include their country code.
  if (value.startsWith('+') || !code) return value;
  // Malaysia's domestic trunk zero is not part of the international number.
  return `${code} ${code === '+60' ? value.replace(/^0/, '') : value}`;
}
