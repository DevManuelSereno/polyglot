/**
 * Remote translation catalog — framework-agnostic.
 *
 * Layout on the server (bucket, CDN, any static host):
 *
 *   <baseUrl>/manifest.json            { "orders": ["en", "pt-br"], "common": ["en", "pt-br", "es"] }
 *   <baseUrl>/<module>/<locale>.json   { "OrdersPage": { "title": "Orders" } }
 *
 * The manifest says which modules exist and in which locales, so no bucket
 * listing API is needed. Publish it together with the module files.
 *
 * `load(locale)` returns the merged messages: every module in the requested
 * locale, or in `fallbackLocale` when the module lacks it, on top of `base`
 * (e.g. local files kept while modules move to the remote).
 */

export type Messages = { [key: string]: string | Messages };
type Manifest = Record<string, string[]>;

export type RemoteCatalogOptions = {
	baseUrl: string;
	fallbackLocale: string;
	/** How long a built catalog is reused, in milliseconds. */
	ttlMs: number;
	/** Messages under the remote ones (local files while migrating). */
	base?: (locale: string) => Promise<Messages>;
	/** Swap for tests or a custom client. */
	fetchJson?: (url: string) => Promise<unknown>;
};

const defaultFetchJson = async (url: string): Promise<unknown> => {
	// The timestamp defeats CDN caches, so a republished file is picked up within the TTL.
	const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
	if (!response.ok) throw new Error(`${response.status} ${url}`);
	return response.json();
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Normalizes a published file: `"a.b": "x"` becomes `{ a: { b: "x" } }`
 * (libraries reject dots in keys), and an empty `{}` placeholder is quoted so
 * the ICU parser treats it as text.
 */
export function normalize(input: Record<string, unknown>): Messages {
	const output: Messages = {};
	for (const [path, raw] of Object.entries(input)) {
		const value = isObject(raw) ? normalize(raw) : String(raw).replaceAll("{}", "'{}'");
		const segments = path.split(".");
		const leaf = segments.pop() as string;
		let node = output;
		for (const segment of segments) {
			if (!isObject(node[segment])) node[segment] = {};
			node = node[segment] as Messages;
		}
		node[leaf] = value;
	}
	return output;
}

/** Copies `from` into `into`, key by key: two modules may fill the same namespace. */
export function mergeInto(into: Messages, from: Messages): Messages {
	for (const [key, value] of Object.entries(from)) {
		if (isObject(value) && isObject(into[key])) mergeInto(into[key] as Messages, value);
		else into[key] = isObject(value) ? mergeInto({}, value) : value;
	}
	return into;
}

export function createRemoteCatalog(options: RemoteCatalogOptions) {
	const fetchJson = options.fetchJson ?? defaultFetchJson;
	const built = new Map<string, { messages: Messages; builtAt: number; complete: boolean }>();

	async function build(locale: string) {
		const messages = options.base ? mergeInto({}, await options.base(locale)) : {};
		let manifest: Manifest;
		try {
			manifest = (await fetchJson(`${options.baseUrl}/manifest.json`)) as Manifest;
		} catch {
			return { messages, complete: false };
		}

		const picks = Object.entries(manifest)
			.map(([module, locales]) => ({
				module,
				locale: locales.includes(locale) ? locale : locales.includes(options.fallbackLocale) ? options.fallbackLocale : null,
			}))
			.filter((pick): pick is { module: string; locale: string } => pick.locale !== null);

		const files = await Promise.allSettled(
			picks.map(async (pick) => ({ ...pick, data: normalize((await fetchJson(`${options.baseUrl}/${pick.module}/${pick.locale}.json`)) as Record<string, unknown>) })),
		);

		// Fallback-locale files first, so the requested locale wins where both define a key.
		const loaded = files.flatMap((file) => (file.status === "fulfilled" ? [file.value] : []));
		for (const file of loaded.filter((f) => f.locale !== locale)) mergeInto(messages, file.data);
		for (const file of loaded.filter((f) => f.locale === locale)) mergeInto(messages, file.data);

		return { messages, complete: loaded.length === picks.length };
	}

	return {
		async load(locale: string): Promise<Messages> {
			const previous = built.get(locale);
			if (previous && Date.now() - previous.builtAt < options.ttlMs) return previous.messages;

			const next = await build(locale);
			// A partial result never replaces a complete one: missing modules would show raw keys.
			if (!next.complete && previous?.complete) return previous.messages;
			built.set(locale, { ...next, builtAt: Date.now() });
			return next.messages;
		},
	};
}
