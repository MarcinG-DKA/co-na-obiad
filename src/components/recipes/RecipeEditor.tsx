import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UnitSelect } from "@/components/ui/unit-select";
import { cn } from "@/lib/utils";
import { isUnit } from "@/lib/units";
import type { Recipe } from "@/lib/services/recipe";

interface Props {
  recipe?: Recipe;
}

interface IngredientDraft {
  key: string;
  name: string;
  quantity: string;
  unit: string;
}

interface StepDraft {
  key: string;
  text: string;
}

const fieldClass =
  "border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:border-purple-400 focus-visible:ring-purple-400/50";

const SAVED_TOAST_KEY = "recipe-saved";

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function draftsFromRecipe(recipe?: Recipe): { title: string; ingredients: IngredientDraft[]; steps: StepDraft[] } {
  if (!recipe) {
    return {
      title: "",
      ingredients: [{ key: newKey(), name: "", quantity: "", unit: "" }],
      steps: [],
    };
  }

  return {
    title: recipe.title,
    ingredients: recipe.ingredients.map((ingredient) => ({
      key: ingredient.id,
      name: ingredient.name,
      quantity: ingredient.quantity != null ? String(ingredient.quantity) : "",
      unit: isUnit(ingredient.unit) ? ingredient.unit : "",
    })),
    steps: recipe.steps.map((text) => ({ key: newKey(), text })),
  };
}

function parseQuantity(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return "invalid";
  }
  return value;
}

export default function RecipeEditor({ recipe }: Props) {
  const initial = draftsFromRecipe(recipe);
  const [title, setTitle] = useState(initial.title);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(initial.ingredients);
  const [steps, setSteps] = useState<StepDraft[]>(initial.steps);
  const [isSaving, setIsSaving] = useState(false);

  const isCreate = recipe === undefined;

  useEffect(() => {
    if (sessionStorage.getItem(SAVED_TOAST_KEY) !== "1") {
      return;
    }
    sessionStorage.removeItem(SAVED_TOAST_KEY);
    toast.success("Recipe saved");
  }, []);

  function updateIngredient(key: string, patch: Partial<Omit<IngredientDraft, "key">>) {
    setIngredients((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function buildPayload(): {
    title: string;
    steps: string[];
    ingredients: { name: string; quantity: number | null; unit: string | null }[];
  } | null {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return null;
    }

    const parsedIngredients: { name: string; quantity: number | null; unit: string | null }[] = [];
    for (const row of ingredients) {
      const name = row.name.trim();
      const quantity = parseQuantity(row.quantity);
      const unit = isUnit(row.unit) ? row.unit : null;
      if (!name && !row.quantity.trim() && !row.unit.trim()) {
        continue;
      }
      if (!name) {
        toast.error("Each ingredient needs a name");
        return null;
      }
      if (quantity === "invalid") {
        toast.error("Quantity must be a positive number");
        return null;
      }
      parsedIngredients.push({ name, quantity, unit });
    }

    if (parsedIngredients.length === 0) {
      toast.error("Add at least one ingredient");
      return null;
    }

    return {
      title: trimmedTitle,
      steps: steps.map((step) => step.text.trim()).filter((text) => text.length > 0),
      ingredients: parsedIngredients,
    };
  }

  async function handleSave(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(isCreate ? "/api/recipes" : `/api/recipes/${recipe.id}`, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { data?: Recipe; error?: string };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "Could not save recipe");
      }
      if (isCreate) {
        sessionStorage.setItem(SAVED_TOAST_KEY, "1");
        window.location.href = `/recipes/${json.data.id}`;
        return;
      }
      const saved = draftsFromRecipe(json.data);
      setTitle(saved.title);
      setIngredients(saved.ingredients);
      setSteps(saved.steps);
      toast.success("Recipe saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save recipe");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSave(event)} className="w-full max-w-lg space-y-6">
      <div className="space-y-2">
        <label className="text-sm text-blue-100/70" htmlFor="recipe-title">
          Title
        </label>
        <Input
          id="recipe-title"
          type="text"
          placeholder="Recipe title..."
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          className={fieldClass}
          disabled={isSaving}
          maxLength={200}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-blue-100/70">Ingredients</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isSaving}
            className="text-purple-300 hover:text-purple-100"
            onClick={() => {
              setIngredients((current) => [...current, { key: newKey(), name: "", quantity: "", unit: "" }]);
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        <ul className="space-y-2">
          {ingredients.map((row) => (
            <li key={row.key} className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <Input
                type="text"
                placeholder="Ingredient name..."
                value={row.name}
                onChange={(e) => {
                  updateIngredient(row.key, { name: e.target.value });
                }}
                className={fieldClass}
                disabled={isSaving}
                maxLength={200}
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) => {
                    updateIngredient(row.key, { quantity: e.target.value });
                  }}
                  min="1"
                  step="any"
                  className={cn(fieldClass, "w-24")}
                  disabled={isSaving}
                />
                <UnitSelect
                  value={row.unit}
                  onValueChange={(unit) => {
                    updateIngredient(row.key, { unit });
                  }}
                  className={cn(fieldClass, "flex-1")}
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isSaving || ingredients.length === 1}
                  className="text-white/60 hover:text-red-400"
                  onClick={() => {
                    setIngredients((current) => current.filter((item) => item.key !== row.key));
                  }}
                  aria-label="Remove ingredient"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-blue-100/70">Steps</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isSaving}
            className="text-purple-300 hover:text-purple-100"
            onClick={() => {
              setSteps((current) => [...current, { key: newKey(), text: "" }]);
            }}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {steps.length === 0 ? (
          <p className="text-sm text-blue-100/40">
            Optional. Add cooking steps if you want them saved with the recipe.
          </p>
        ) : (
          <ul className="space-y-2">
            {steps.map((step, index) => (
              <li key={step.key} className="flex gap-2">
                <span className="mt-2 w-6 text-sm text-blue-100/50">{index + 1}.</span>
                <Input
                  type="text"
                  placeholder="What to do..."
                  value={step.text}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSteps((current) =>
                      current.map((item) => (item.key === step.key ? { ...item, text: value } : item)),
                    );
                  }}
                  className={fieldClass}
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isSaving}
                  className="text-white/60 hover:text-red-400"
                  onClick={() => {
                    setSteps((current) => current.filter((item) => item.key !== step.key));
                  }}
                  aria-label={`Remove step ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button type="submit" disabled={isSaving} className="w-full bg-purple-600 text-white hover:bg-purple-500">
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
