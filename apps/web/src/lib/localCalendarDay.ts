// FILE: localCalendarDay.ts
// Purpose: Resolve an explicit local calendar date and its exact UTC boundary interval.
// Layer: Web date utility for local-day features.

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatLocalCalendarDate(date: Date): string {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join(
    "-",
  );
}

export function localCalendarDayRange(now: Date = new Date()): {
  readonly date: string;
  readonly startedAt: string;
  readonly endedAt: string;
} {
  const startedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    date: formatLocalCalendarDate(startedAt),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
  };
}
