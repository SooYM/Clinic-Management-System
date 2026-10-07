/** Clinic civil date, independent of browser/server timezone. */
export function malaysiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (name: string) => parts.find((part) => part.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
/** Presentation default only; practitioners can choose a different leave start. */
export function defaultMcStartDate(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  const date = malaysiaDate(now);
  if (hour < 17) return date;
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
