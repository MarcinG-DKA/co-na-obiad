import { useEffect, useRef, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecipeMatch } from "@/lib/services/matching";

interface Props {
  initialMatches: RecipeMatch[];
  loadError?: boolean;
}

export default function MatchList({ initialMatches, loadError = false }: Props) {
  const [matches, setMatches] = useState(initialMatches);
  const [hasLoadError, setHasLoadError] = useState(loadError);
  const inFlight = useRef(false);
  const skipFirstVisible = useRef(true);

  async function refreshMatches() {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const res = await fetch("/api/matches");
      const json = (await res.json()) as { data?: RecipeMatch[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not load matches");
      }
      setMatches(json.data ?? []);
      setHasLoadError(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load matches");
    } finally {
      inFlight.current = false;
    }
  }

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void refreshMatches();
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (skipFirstVisible.current) {
        skipFirstVisible.current = false;
        return;
      }
      void refreshMatches();
    }

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (hasLoadError && matches.length === 0) {
    return <p className="text-center text-sm text-red-300">Could not load matches.</p>;
  }

  if (matches.length === 0) {
    return (
      <div className="w-full space-y-6">
        <div className="flex justify-center">
          <Button asChild className="bg-purple-600 text-white hover:bg-purple-500">
            <a href="/recipes/new">
              <Plus className="size-4" />
              New recipe
            </a>
          </Button>
        </div>
        <div className="flex flex-col items-center gap-2 py-8 text-blue-100/50">
          <BookOpen className="size-8" />
          <p className="text-sm">No recipes yet. Add one to start the household library.</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="w-full space-y-2">
      {matches.map((match) => (
        <li key={match.recipeId} className={cn("rounded-lg border border-white/10 bg-white/5 px-4 py-3")}>
          <a
            href={`/recipes/${match.recipeId}`}
            className="flex min-w-0 items-baseline justify-between gap-3 hover:underline"
          >
            <span className="font-medium text-white">{match.title}</span>
            <span className="shrink-0 text-sm text-blue-100/60">{Math.round(match.score * 100)}%</span>
          </a>
          {match.missingNames.length > 0 ? (
            <p className="mt-1 text-sm text-blue-100/50">Missing: {match.missingNames.join(", ")}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
