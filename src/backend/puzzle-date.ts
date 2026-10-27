/** Shared by the daily lookup and seed so the server's timezone never matters. */
export function centralDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Find actual Central midnight; the interval can be 23, 24 or 25 hours. */
export function centralMidnight(date: string): Date {
  let low = Date.parse(`${date}T00:00:00Z`) - 12 * 3600_000;
  let high = low + 48 * 3600_000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (centralDateString(new Date(mid)) < date) low = mid;
    else high = mid;
  }
  return new Date(high);
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}
export const nextDailyAt = (now: Date) => centralMidnight(shiftDate(centralDateString(now), 1));
