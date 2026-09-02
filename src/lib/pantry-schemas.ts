import { z } from "zod";
import { unitSchema } from "@/lib/units";

export const addPantryItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: unitSchema,
});

export const updatePantryItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().positive().nullable().optional(),
    unit: unitSchema,
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
