"use client";

/*
 * Reusable Bullhorn-style card grid: per-user layout saved on the server (and
 * cached in the browser), drag to reorder, card library, configure dialog.
 * Used by the main dashboard and by the List / Dashboard switch on the
 * Candidates, Job Openings, Clients and Contacts pages.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc/client";
import { BullhornCardBody, BULLHORN_TYPES } from "./bullhorn-cards";
import { CardFrame, CardLibrary, ConfigureDialog } from "./card-frame";
import {
  CARD_META,
  newCardId,
  type CardInstance,
  type CardMeta,
  type CardType
} from "./card-registry";

function readCache(key: string): CardInstance[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.filter(
      (c): c is CardInstance =>
        !!c &&
        typeof c === "object" &&
        typeof (c as CardInstance).id === "string" &&
        (c as CardInstance).type in CARD_META
    );
    return ok.length ? ok : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, cards: CardInstance[]) {
  try {
    localStorage.setItem(key, JSON.stringify(cards));
  } catch {
    // Storage unavailable; the server copy still persists the layout.
  }
}

export type CardRender = { body: ReactNode; extra?: ReactNode };

export function CardBoard({
  dashboardKey,
  defaults,
  categories,
  libraryOpen,
  onLibraryOpenChange,
  renderCard,
  onRefreshOther
}: {
  /** Server key for this layout; bump it when the default layout changes. */
  dashboardKey: string;
  defaults: CardInstance[];
  /** Library categories offered on this board (all when omitted). */
  categories?: CardMeta["category"][];
  libraryOpen: boolean;
  onLibraryOpenChange: (open: boolean) => void;
  /** Bodies for non-Bullhorn cards (the main dashboard's Emerge cards). */
  renderCard?: (card: CardInstance) => CardRender | null;
  /** Refresh for non-Bullhorn cards. */
  onRefreshOther?: () => void;
}) {
  const utils = trpc.useUtils();
  const cacheKey = `emerge.cards.${dashboardKey}`;
  const [layout, setLayout] = useState<CardInstance[]>(defaults);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const serverLayout = trpc.dashboardCards.layout.useQuery(
    { key: dashboardKey },
    { staleTime: Infinity, refetchOnWindowFocus: false }
  );
  const saveLayout = trpc.dashboardCards.saveLayout.useMutation();
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cached = readCache(cacheKey);
    if (cached) setLayout(cached);
  }, [cacheKey]);
  useEffect(() => {
    if (hydrated.current || serverLayout.isLoading) return;
    hydrated.current = true;
    const valid = (serverLayout.data ?? []).filter((c) => c.type in CARD_META) as CardInstance[];
    if (valid.length) {
      setLayout(valid);
      writeCache(cacheKey, valid);
    }
  }, [serverLayout.isLoading, serverLayout.data, cacheKey]);

  const persist = useCallback(
    (next: CardInstance[]) => {
      setLayout(next);
      writeCache(cacheKey, next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(
        () => saveLayout.mutate({ key: dashboardKey, cards: next }),
        600
      );
    },
    [saveLayout, cacheKey, dashboardKey]
  );
  const patchCard = (id: string, patch: Partial<CardInstance>) =>
    persist(layout.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCard = (id: string) => persist(layout.filter((c) => c.id !== id));
  const addCard = (type: CardType) => {
    persist([{ id: newCardId(), type, size: CARD_META[type].size }, ...layout]);
    onLibraryOpenChange(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** Live reorder while dragging: move the dragged card to the hovered slot. */
  const dragOver = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setLayout((cur) => {
      const from = cur.findIndex((c) => c.id === dragId);
      const to = cur.findIndex((c) => c.id === targetId);
      if (from < 0 || to < 0) return cur;
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  };
  const dragEnd = () => {
    setDragId(null);
    persist(layout);
  };
  const refreshCard = (type: CardType) => {
    if (BULLHORN_TYPES.includes(type)) {
      void utils.dashboardCards.invalidate();
      void utils.overviewReports.invalidate();
      void utils.recruiterReports.invalidate();
      void utils.amReports.invalidate();
    } else onRefreshOther?.();
  };
  const configuringCard = layout.find((c) => c.id === configuring) ?? null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {layout.map((card) => {
          const isBullhorn = BULLHORN_TYPES.includes(card.type);
          const other = isBullhorn ? null : (renderCard?.(card) ?? null);
          if (!isBullhorn && !other) return null;
          return (
            <CardFrame
              key={card.id}
              card={card}
              dragging={dragId === card.id}
              headerExtra={other?.extra}
              onDragStart={() => setDragId(card.id)}
              onDragEnter={() => dragOver(card.id)}
              onDragEnd={dragEnd}
              onPatch={(p) => patchCard(card.id, p)}
              onRemove={() => removeCard(card.id)}
              onConfigure={() => setConfiguring(card.id)}
              onRefresh={() => refreshCard(card.type)}
            >
              {isBullhorn ? (
                <BullhornCardBody card={card} onPatch={(p) => patchCard(card.id, p)} />
              ) : (
                other?.body
              )}
            </CardFrame>
          );
        })}
      </div>

      {layout.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          No cards here. Click Add card to pick some from the library.
        </div>
      ) : null}

      {libraryOpen ? (
        <CardLibrary
          layout={layout}
          categories={categories}
          isAvailable={(t) => BULLHORN_TYPES.includes(t) || !!renderCard}
          onAdd={addCard}
          onReset={() => {
            persist(defaults);
            onLibraryOpenChange(false);
          }}
          onClose={() => onLibraryOpenChange(false)}
        />
      ) : null}
      {configuringCard ? (
        <ConfigureDialog
          card={configuringCard}
          onApply={(p) => {
            patchCard(configuringCard.id, p);
            setConfiguring(null);
          }}
          onClose={() => setConfiguring(null)}
        />
      ) : null}
    </>
  );
}
