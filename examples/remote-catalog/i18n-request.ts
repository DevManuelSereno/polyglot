import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { createRemoteCatalog } from "./catalog";
import { fallbackText, onIntlError } from "./missing-keys";
import { routing } from "./routing";

/**
 * next-intl request config backed by the remote catalog.
 *
 * Point `i18n/request.ts` (or the path given to the next-intl plugin) here.
 * `base` keeps the local files under the remote ones while modules are being
 * moved; delete it once every module is published.
 */

const catalog = createRemoteCatalog({
	baseUrl: "https://cdn.example.com/my-app/i18n",
	fallbackLocale: "en",
	ttlMs: process.env.NODE_ENV === "development" ? 10_000 : 300_000,
	base: async (locale) => (await import(`../../messages/${locale}.json`)).default,
});

export default getRequestConfig(async ({ requestLocale }) => {
	const requested = await requestLocale;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

	return {
		locale,
		messages: await catalog.load(locale),
		onError: onIntlError,
		getMessageFallback: fallbackText,
	};
});
