import { createHash } from 'node:crypto';

/** Git/OS newline conversion must not turn identical SQL into an edited migration. */
export function migrationChecksums(source: string, helper = '') {
  const variants = (text: string) => {
    const lf = text.replace(/\r\n/g, '\n');
    return [...new Set([lf, lf.replace(/\n/g, '\r\n'), text])];
  };
  const candidates = new Set<string>();
  for (const sql of variants(source))
    for (const implementation of variants(helper))
      candidates.add(createHash('sha256').update(sql).update(implementation).digest('hex'));
  return { canonical: [...candidates][0], candidates };
}
