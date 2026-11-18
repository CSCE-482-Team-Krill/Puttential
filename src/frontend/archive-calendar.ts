export const FIRST_ARCHIVE_MONTH = '2026-10';

export type ArchiveMonthRange = Readonly<{ min: string; max: string }>;

export function monthParts(value: string) {
  const [year, month] = value.split('-').map(Number);
  return { year: year!, monthIndex: month! - 1 };
}

export function monthValue(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
}

export function shiftMonth(value: string, amount: number) {
  const { year, monthIndex } = monthParts(value);
  return monthValue(year, monthIndex + amount);
}

export function archiveMonthRange(today?: string): ArchiveMonthRange {
  const currentMonth = today?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const futureLimit = shiftMonth(currentMonth, 2);
  return {
    min: FIRST_ARCHIVE_MONTH,
    max: futureLimit < FIRST_ARCHIVE_MONTH ? FIRST_ARCHIVE_MONTH : futureLimit,
  };
}

export function monthInRange(value: string, range: ArchiveMonthRange) {
  return value >= range.min && value <= range.max;
}

export function clampMonth(value: string, range: ArchiveMonthRange) {
  if (value < range.min) return range.min;
  if (value > range.max) return range.max;
  return value;
}

export function canShiftMonth(value: string, amount: number, range: ArchiveMonthRange) {
  return monthInRange(shiftMonth(value, amount), range);
}

export function canShiftYear(value: string, amount: number, range: ArchiveMonthRange) {
  const targetYear = monthParts(value).year + amount;
  return targetYear >= monthParts(range.min).year && targetYear <= monthParts(range.max).year;
}

export function shiftYear(value: string, amount: number, range: ArchiveMonthRange) {
  const { year, monthIndex } = monthParts(value);
  return clampMonth(monthValue(year + amount, monthIndex), range);
}

export function archiveYears(range: ArchiveMonthRange) {
  const first = monthParts(range.min).year;
  const last = monthParts(range.max).year;
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
