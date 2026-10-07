/** Convert database column names and timestamp columns without rewriting clinical free text or JSON keys. */
const jsonColumns = new Set([
  'allergies',
  'conditions',
  'vitals',
  'prescriptions',
  'lines',
  'payload',
  'metadata',
  'receipt_snapshot',
]);
export function camel(row: any): any {
  if (Array.isArray(row)) return row.map(camel);
  if (row instanceof Date) return row.toISOString();
  if (Buffer.isBuffer(row)) return row;
  if (row && typeof row === 'object')
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const name = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        if (jsonColumns.has(key)) return [name, value];
        if (
          typeof value === 'string' &&
          /_at$/.test(key) &&
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
        )
          return [name, new Date(value.replace(' ', 'T') + 'Z').toISOString()];
        return [name, camel(value)];
      }),
    );
  return row;
}
