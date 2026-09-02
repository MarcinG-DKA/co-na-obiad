import { z } from "zod";

export const UNITS = ["ml", "g", "pcs"] as const;

export type Unit = (typeof UNITS)[number];

export function isUnit(value: unknown): value is Unit {
  return typeof value === "string" && (UNITS as readonly string[]).includes(value);
}

export const unitSchema = z.preprocess(
  (value: unknown) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "" ? null : normalized;
  },
  z.enum(UNITS, { error: "Unit must be ml, g, or pcs" }).nullable().optional(),
);
