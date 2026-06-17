export const RESTAURANT_TIMEZONE =
  process.env.NEXT_PUBLIC_RESTAURANT_TIMEZONE || "Africa/Lagos";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RESTAURANT_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RESTAURANT_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RESTAURANT_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: RESTAURANT_TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Today's date as YYYY-MM-DD in restaurant timezone */
export function todayInRestaurantTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatRestaurantDate(date: string | Date): string {
  const d = typeof date === "string" ? parseDateOnly(date) : date;
  return dateFormatter.format(d);
}

export function formatRestaurantLongDate(date: string | Date): string {
  const d = typeof date === "string" ? parseDateOnly(date) : date;
  return longDateFormatter.format(d);
}

export function formatRestaurantTime(date: Date = new Date()): string {
  return timeFormatter.format(date);
}

export function formatRestaurantDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return dateTimeFormatter.format(d);
}

export function isTodayInRestaurantTz(date: string): boolean {
  return date === todayInRestaurantTz();
}

/** Parse YYYY-MM-DD as noon local to avoid UTC day-shift in formatters */
function parseDateOnly(date: string): Date {
  return new Date(`${date}T12:00:00`);
}
