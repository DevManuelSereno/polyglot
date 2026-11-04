import { IntlErrorCode, type IntlError } from "next-intl";

/**
 * What to do when a key is not in the catalog (next-intl).
 *
 * By default next-intl throws, and a throw during render takes the page down.
 * With a remote catalog a key can be missing for a while (published later,
 * or a module failed to load), so the page shows `Namespace.key` instead and
 * development logs it once.
 *
 * Imported by both the server config and the client provider: functions
 * cannot be serialized from server to client, so each side imports them.
 */

const reported = new Set<string>();

export function onIntlError(error: IntlError) {
	if (error.code !== IntlErrorCode.MISSING_MESSAGE) {
		console.error(error);
		return;
	}
	if (process.env.NODE_ENV === "development" && !reported.has(error.message)) {
		reported.add(error.message);
		console.warn(`[i18n] ${error.message}`);
	}
}

export function fallbackText({ namespace, key }: { namespace?: string; key: string }) {
	return [namespace, key].filter(Boolean).join(".");
}
