import { useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecipeListItem } from "@/lib/services/recipe";

interface Props {
  initialRecipes: RecipeListItem[];
}

export default function RecipeList({ initialRecipes }: Props) {
  const [recipes, setRecipes] = useState<RecipeListItem[]>(initialRecipes);

  async function handleRemove(recipe: RecipeListItem) {
    setRecipes((current) => current.filter((item) => item.id !== recipe.id));

    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not remove recipe");
      }
    } catch (err) {
      setRecipes((current) => (current.some((item) => item.id === recipe.id) ? current : [...current, recipe]));
      toast.error(err instanceof Error ? err.message : "Could not remove recipe");
    }
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="flex justify-center">
        <Button asChild className="bg-purple-600 text-white hover:bg-purple-500">
          <a href="/recipes/new">
            <Plus className="size-4" />
            New recipe
          </a>
        </Button>
      </div>

      {recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-blue-100/50">
          <BookOpen className="size-8" />
          <p className="text-sm">No recipes yet. Add one to start the household library.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {recipes.map((recipe) => (
            <li
              key={recipe.id}
              className={cn("flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3")}
            >
              <a href={`/recipes/${recipe.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="font-medium text-white">{recipe.title}</span>
                <span className="ml-2 text-sm text-blue-100/60">
                  {recipe.ingredient_count} {recipe.ingredient_count === 1 ? "ingredient" : "ingredients"}
                </span>
              </a>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove ${recipe.title}?`)) {
                    void handleRemove(recipe);
                  }
                }}
                className="text-white/40 transition-colors hover:text-red-400"
                aria-label={`Remove ${recipe.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
