export type BloodPressure = { systolic: number; diastolic: number; unusual: boolean };

/** Format validation only; monitor-range flags are not a diagnosis or healthy range. */
export function parseBloodPressure(value: unknown): BloodPressure | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('Enter blood pressure as SYS/DIA.');
  if (!value.trim()) return null;
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value.trim());
  if (!match) throw new Error('Enter blood pressure as positive whole numbers SYS/DIA.');
  const systolic = Number(match[1]),
    diastolic = Number(match[2]);
  if (
    !Number.isSafeInteger(systolic) ||
    !Number.isSafeInteger(diastolic) ||
    diastolic <= 0 ||
    systolic <= diastolic
  )
    throw new Error('Blood pressure requires positive whole numbers with SYS greater than DIA.');
  return {
    systolic,
    diastolic,
    unusual: systolic < 60 || systolic > 260 || diastolic < 40 || diastolic > 215,
  };
}
