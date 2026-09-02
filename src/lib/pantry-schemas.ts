import { z } from "zod";

export const addPantryItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
});

export const updatePantryItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().positive().nullable().optional(),
    unit: z.string().trim().max(50).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });
