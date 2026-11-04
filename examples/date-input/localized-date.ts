/**
 * Date text fields that follow the user's locale.
 *
 * Everything is derived from `Intl.DateTimeFormat`, so adding a locale needs
 * no code — only the placeholder letters are translated:
 *
 *   dateFieldFormat("en-US")  → { order: ["month", "day", "year"], separator: "/", trailing: "" }
 *   dateFieldFormat("de-DE")  → { order: ["day", "month", "year"], separator: ".", trailing: "" }
 *   dateFieldFormat("ko-KR")  → { order: ["year", "month", "day"], separator: ". ", trailing: "." }
 *
 * Values are stored as `YYYY-MM-DD`, independent of the locale.
 */

type Unit = "day" | "month" | "year";

export type DateFieldFormat = { order: Unit[]; separator: string; trailing: string };

const WIDTH: Record<Unit, number> = { day: 2, month: 2, year: 4 };
const TOTAL_DIGITS = 8;
const DAY_MONTH_YEAR: DateFieldFormat = { order: ["day", "month", "year"], separator: "/", trailing: "" };
const BIDI_MARKS = /[؜‎‏]/g;

const formats = new Map<string, DateFieldFormat>();

/** Order, separator and trailing text of a numeric date in `locale`. */
export function dateFieldFormat(locale: string): DateFieldFormat {
	let format = formats.get(locale);
	if (format) return format;
	format = DAY_MONTH_YEAR;
	try {
		// Latin digits and the Gregorian calendar keep the field typeable in every locale.
		const tag = new Intl.Locale(locale, { numberingSystem: "latn", calendar: "gregory" });
		const parts = new Intl.DateTimeFormat(tag, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(2001, 10, 22));
		const units = parts.filter((p): p is Intl.DateTimeFormatPart & { type: Unit } => p.type === "day" || p.type === "month" || p.type === "year");
		if (units.length === 3) {
			const textAfter = (unit: Intl.DateTimeFormatPart) => {
				const next = parts[parts.indexOf(unit) + 1];
				return next?.type === "literal" ? next.value.replace(BIDI_MARKS, "") : "";
			};
			format = { order: units.map((u) => u.type), separator: textAfter(units[0]) || "/", trailing: textAfter(units[2]) };
		}
	} catch {
		// Not a valid locale tag: keep day/month/year.
	}
	formats.set(locale, format);
	return format;
}

/** A real calendar date, or null (no rolling 2024-02-30 into March). */
function calendarDate(year: number, month: number, day: number): Date | null {
	const date = new Date(year, month - 1, day);
	const same = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
	return same ? date : null;
}

/** `YYYY-MM-DD` → the field's text in `locale`. Read as a local date: no time-zone shift. */
export function toFieldText(stored: string, locale: string): string {
	const match = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return "";
	const values: Record<Unit, string> = { year: match[1], month: match[2], day: match[3] };
	const { order, separator, trailing } = dateFieldFormat(locale);
	return order.map((unit) => values[unit]).join(separator) + trailing;
}

/** Formats digits as they are typed: "1225" → "12/25" in en-US, "25.12" in de-DE. */
export function applyMask(typed: string, locale: string): string {
	const { order, separator, trailing } = dateFieldFormat(locale);
	let rest = typed.replace(/\D/g, "").slice(0, TOTAL_DIGITS);
	const chunks: string[] = [];
	for (const unit of order) {
		if (!rest) break;
		chunks.push(rest.slice(0, WIDTH[unit]));
		rest = rest.slice(WIDTH[unit]);
	}
	const complete = chunks.join("").length === TOTAL_DIGITS;
	return chunks.join(separator) + (complete ? trailing : "");
}

/** The field's text in `locale` → `YYYY-MM-DD`, or null if incomplete or not a real date. */
export function fromFieldText(text: string, locale: string): string | null {
	let digits = text.replace(/\D/g, "");
	if (digits.length !== TOTAL_DIGITS) return null;
	const values = {} as Record<Unit, number>;
	for (const unit of dateFieldFormat(locale).order) {
		values[unit] = Number(digits.slice(0, WIDTH[unit]));
		digits = digits.slice(WIDTH[unit]);
	}
	if (!calendarDate(values.year, values.month, values.day)) return null;
	const pad = (n: number, width: number) => String(n).padStart(width, "0");
	return `${pad(values.year, 4)}-${pad(values.month, 2)}-${pad(values.day, 2)}`;
}

/** Placeholder in the locale's order with translated letters, e.g. { day: "jj", month: "mm", year: "aaaa" }. */
export function fieldPlaceholder(locale: string, letters: Record<Unit, string>): string {
	const { order, separator, trailing } = dateFieldFormat(locale);
	return order.map((unit) => letters[unit]).join(separator) + trailing;
}

/**
 * Keys to try in a library's locale map, most specific first:
 * "pt-br" → ["pt-BR", "pt"], "zh-hant-tw" → ["zh-TW", "zh"], "fr" → ["fr"].
 */
export function localeLookupKeys(locale: string): string[] {
	try {
		const { language, region } = new Intl.Locale(locale);
		return [...new Set([region && `${language}-${region}`, language].filter(Boolean) as string[])];
	} catch {
		return [];
	}
}
