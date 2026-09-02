import { z } from "zod";
import { unitSchema } from "@/lib/units";

export const recipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: unitSchema,
});

export const saveRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  steps: z
    .array(z.string())
    .default([])
    .transform((steps) => steps.map((step) => step.trim()).filter((step) => step.length > 0)),
  ingredients: z.array(recipeIngredientSchema).min(1),
});
