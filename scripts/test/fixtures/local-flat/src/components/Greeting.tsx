import { useTranslations } from "next-intl";
export function Greeting() {
  const t = useTranslations("Home");
  return <h1>{t("title")}</h1>;
}
