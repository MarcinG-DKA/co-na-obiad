import { useEffect, useRef, useState } from "react";
import { evaluatePantryFreshness, formatPantryLastUpdated, resolvePantryFreshnessView } from "@/lib/pantry-freshness";

interface Props {
  initialLastUpdatedAt: string | null;
  loadError?: boolean;
}

interface FreshnessPayload {
  lastUpdatedAt: string | null;
}

export default function PantryFreshness({ initialLastUpdatedAt, loadError = false }: Props) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState(initialLastUpdatedAt);
  const [hasLoadError, setHasLoadError] = useState(loadError);
  const inFlight = useRef(false);
  const pendingRefresh = useRef(false);

  async function refreshFreshness() {
    if (inFlight.current) {
      pendingRefresh.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const res = await fetch("/api/pantry/freshness");
      const json = (await res.json()) as { data?: FreshnessPayload; error?: string };
      if (!res.ok || json.data === undefined) {
        throw new Error(json.error ?? "Could not load pantry status");
      }
      setLastUpdatedAt(json.data.lastUpdatedAt);
      setHasLoadError(false);
    } catch {
      // Keep the last good SSR/refetch value. Do not flip a successful line into a load error.
    } finally {
      inFlight.current = false;
      if (pendingRefresh.current) {
        pendingRefresh.current = false;
        void refreshFreshness();
      }
    }
  }

  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void refreshFreshness();
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshFreshness();
      }
    }

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const now = new Date();
  const view = resolvePantryFreshnessView(lastUpdatedAt, hasLoadError, now);

  if (view.kind === "error") {
    return <p className="text-center text-sm text-red-300">Could not load pantry status.</p>;
  }

  const freshness = evaluatePantryFreshness(lastUpdatedAt, now);

  return (
    <div className="space-y-2">
      <p className="text-center text-sm text-blue-100/60">{formatPantryLastUpdated(freshness, now)}</p>
      {view.showNudge ? (
        <p
          className="rounded-lg border border-orange-300/30 bg-orange-300/10 px-3 py-2 text-center text-sm text-orange-300"
          role="status"
        >
          Recipe matches may be inaccurate.{" "}
          <a href="/pantry" className="font-semibold underline hover:text-orange-200">
            Review pantry
          </a>
        </p>
      ) : null}
    </div>
  );
}
