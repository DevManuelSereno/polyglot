import { z } from "zod";
export const createOrderSchema = (t: (key: "validation.quantity") => string) =>
  z.object({ quantity: z.number().max(99, t("validation.quantity")) });
export const NoteSchema = z.object({ note: z.string().max(200, "Note is too long") });
