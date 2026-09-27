"use client";

import { useSyncExternalStore } from "react";
import { addFavorite, isFavorite, removeFavorite, subscribeFavorites } from "@/lib/favorites/store";
import type { FavoriteItem } from "@/lib/favorites/types";

function HeartIcon({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20.5s-7.5-4.6-10-9.3C.6 7.8 2.4 4.5 5.7 4c2-.3 3.9.6 5 2.2C11.8 4.6 13.7 3.7 15.7 4c3.3.5 5.1 3.8 3.7 7.2-2.5 4.7-10 9.3-10 9.3Z" />
    </svg>
  );
}

/**
 * The heart on a product card. Rendered as a SIBLING of the card's own anchor (see FamilyCard.tsx), never nested
 * inside it — a `<button>` inside an `<a>` is invalid HTML and would fire both the save AND the navigation on one
 * tap. `stopPropagation` + `preventDefault` keep the tap from being read as "open the product" even when a parent
 * element also listens for clicks.
 */
export function FavoriteButton({ item, className = "" }: { item: Omit<FavoriteItem, "addedAt">; className?: string }) {
  const saved = useSyncExternalStore(
    subscribeFavorites,
    () => isFavorite(item.inkProductId, item.commerceStoreKey),
    () => false,
  );

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remover ${item.title} de Meus Lugares` : `Salvar ${item.title} em Meus Lugares`}
      data-testid="favorite-button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (saved) removeFavorite(item.inkProductId, item.commerceStoreKey);
        else addFavorite(item);
      }}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm transition-colors hover:text-region-primary ${className}`}
    >
      <HeartIcon filled={saved} className="h-5 w-5" />
    </button>
  );
}
