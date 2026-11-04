import { useTranslations } from "next-intl";
import { getOrderColumns } from "./orders-columns";
export function OrdersTable({ status }: { status: string }) {
  const t = useTranslations("OrdersPage");
  const tColumns = useTranslations("OrdersPage.Table.Columns");
  const columns = getOrderColumns({ tColumns });
  return <section title={t("title")}>{t(`status.${status}`)}{columns.length}</section>;
}
