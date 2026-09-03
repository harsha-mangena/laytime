import { format, isValid, parseISO } from "date-fns";
import { AS_OF } from "./as-of";

export function money(n: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

export function parseDay(value: string | null | undefined) {
  if (!value) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (day) {
    const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12, 0, 0);
    return isValid(d) ? d : null;
  }
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export function shortDate(value: string | null | undefined) {
  const d = parseDay(value);
  if (!d) return "\u2014";
  return format(d, "d MMM yyyy");
}

export function shortDateTime(value: string | null | undefined) {
  if (!value) return "\u2014";
  const day = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (day) {
    const d = new Date(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
      Number(day[4]),
      Number(day[5]),
      0,
    );
    return format(d, "d MMM yyyy HH:mm");
  }
  const d = parseISO(value);
  if (!isValid(d)) return "\u2014";
  return format(d, "d MMM yyyy HH:mm");
}

export function isoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function asOfLabel() {
  return format(AS_OF, "d MMMM yyyy");
}

export function containerPretty(num: string) {
  const compact = num.replace(/\s+/g, "").toUpperCase();
  if (compact.length >= 11) {
    return `${compact.slice(0, 4)} ${compact.slice(4, 10)} ${compact.slice(10)}`;
  }
  if (compact.length >= 10) {
    return `${compact.slice(0, 4)} ${compact.slice(4)}`;
  }
  return compact;
}

export function daysLabel(n: number | null) {
  if (n === null) return "\u2014";
  if (n < 0) return `${Math.abs(n)}d past`;
  if (n === 0) return "today";
  return `${n}d`;
}
