"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 2000;

/**
 * The bar of a sync running in the background. The server page owns the numbers; while it runs this only asks the page to render again every
 * couple of seconds (`router.refresh()`), and stops by itself when the server stops rendering it (the job ended).
 */
export function SyncProgress({ percent, label }: { percent: number | null; label: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);
  return (
    <div className="mt-3" data-testid="sync-progress">
      <div className="flex justify-between text-[0.8125rem] font-bold">
        <span>{label}</span>
        <span>{percent === null ? "iniciando…" : `${percent}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="mt-1 h-2 w-full overflow-hidden border border-black/30 bg-white"
      >
        <div className="h-full bg-[#4d543d] transition-[width] duration-500" style={{ width: `${percent ?? 0}%` }} />
      </div>
    </div>
  );
}
