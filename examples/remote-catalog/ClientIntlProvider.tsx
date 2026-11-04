"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { fallbackText, onIntlError } from "./missing-keys";

/**
 * Client side of the tolerant catalog: same missing-key handling as the
 * server config. Render it in the locale layout instead of
 * NextIntlClientProvider, passing `locale` and `messages` explicitly.
 */
export function ClientIntlProvider(props: ComponentProps<typeof NextIntlClientProvider>) {
	return <NextIntlClientProvider onError={onIntlError} getMessageFallback={fallbackText} {...props} />;
}
