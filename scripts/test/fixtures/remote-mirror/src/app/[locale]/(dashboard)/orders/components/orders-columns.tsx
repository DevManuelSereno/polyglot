import type { useTranslations } from "next-intl";
type TFunction = ReturnType<typeof useTranslations>;
export const getOrderColumns = ({ tColumns }: { tColumns: TFunction }) => [
  { header: tColumns("number") },
  { header: tColumns("total") },
];
