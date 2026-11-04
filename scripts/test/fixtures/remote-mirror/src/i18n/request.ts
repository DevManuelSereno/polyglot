import { getRequestConfig } from "next-intl/server";
import { listModules } from "./discovery";
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? "en-us";
  const modules = await listModules();
  return { locale, messages: { modules } };
});
