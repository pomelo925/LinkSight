import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Server, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HOVER_POP_GROUP } from "@/lib/interactive";
import { useHostStore } from "@/store/useHostStore";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import { HostEditor } from "@/features/hosts/HostEditor";
import {
  SshKeyInputPanel,
  authDraftFromRecord,
  EMPTY_KEY_DRAFT,
  type SshKeyDraft,
  type SshKeyPanelKind,
} from "@/features/hosts/SshAuthPanels";
import type { HostRecord } from "@/lib/types";

const EMPTY_HOST: HostRecord = {
  id: "",
  alias: "",
  hostname: null,
  username: "",
  ip: "",
  password: null,
  port: null,
  authMode: "ssh",
  sshPrivateKeyPath: null,
  sshPublicKey: null,
};

/** Fixed card width — only reflows to next row, never stretches. */
const HOST_CARD_W = "17.5rem";
const HOST_CARD_W_DRAG = "14.5rem";
const LONG_PRESS_MS = 250;
const FIXED_GAP_PX = 8;
const MOVE_CANCEL_PX = 10;

const drawerEase = [0.32, 0.72, 0, 1] as const;

function formatHostEndpoint(h: HostRecord): string {
  const port = h.port != null && h.port > 0 ? `:${h.port}` : "";
  return `${h.username}@${h.ip}${port}`;
}

type DragSession = {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  x: number;
  y: number;
};

function insertIndexForPoint(
  cards: { id: string; rect: DOMRect }[],
  dragId: string,
  x: number,
  y: number,
): number {
  const others = cards.filter((c) => c.id !== dragId);
  if (others.length === 0) return 0;

  let hit =
    others.find(
      (c) =>
        x >= c.rect.left &&
        x <= c.rect.right &&
        y >= c.rect.top &&
        y <= c.rect.bottom,
    ) ?? null;

  if (!hit) {
    let best = Number.POSITIVE_INFINITY;
    for (const c of others) {
      const cx = c.rect.left + c.rect.width / 2;
      const cy = c.rect.top + c.rect.height / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < best) {
        best = d;
        hit = c;
      }
    }
  }
  if (!hit) return 0;

  const midX = hit.rect.left + hit.rect.width / 2;
  const hitIndex = others.findIndex((c) => c.id === hit!.id);
  return x < midX ? hitIndex : hitIndex + 1;
}

function HostCardBody({
  host,
  compact,
  showDelete,
  onDelete,
}: {
  host: HostRecord;
  compact?: boolean;
  showDelete?: boolean;
  onDelete?: () => void;
}) {
  const { t } = useI18n();
  return (
    <CardContent
      className={cn(
        "flex items-center justify-between gap-3",
        compact ? "py-3" : "py-4",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-3", HOVER_POP_GROUP)}>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          <Server className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{host.alias}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatHostEndpoint(host)}
            {host.authMode === "password"
              ? ` · ${t("hosts.authMode.password")}`
              : ` · ${t("hosts.authMode.ssh")}`}
          </p>
        </div>
      </div>
      {showDelete && onDelete ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("hosts.actions.deleteHost", { alias: host.alias })}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      ) : null}
    </CardContent>
  );
}

export function Hosts() {
  const { t } = useI18n();
  const hosts = useHostStore((s) => s.hosts);
  const loaded = useHostStore((s) => s.loaded);
  const load = useHostStore((s) => s.load);
  const save = useHostStore((s) => s.save);
  const remove = useHostStore((s) => s.remove);
  const applyOrder = useHostStore((s) => s.applyOrder);
  const persistOrder = useHostStore((s) => s.persistOrder);

  const [editing, setEditing] = useState<HostRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyPanel, setKeyPanel] = useState<SshKeyPanelKind | null>(null);
  const [privateKeyDraft, setPrivateKeyDraft] = useState<SshKeyDraft>(EMPTY_KEY_DRAFT);
  const [publicKeyDraft, setPublicKeyDraft] = useState<SshKeyDraft>(EMPTY_KEY_DRAFT);
  const [firstTimeDeploy, setFirstTimeDeploy] = useState(false);

  const [drag, setDrag] = useState<DragSession | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    pointerId: number;
    cardEl: HTMLElement;
  } | null>(null);
  const suppressClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const orderDirty = useRef(false);

  useEffect(() => {
    load().catch((err) =>
      setLoadError(err instanceof Error ? err.message : String(err)),
    );
  }, [load]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const reorderFromPoint = useCallback(
    (dragId: string, clientX: number, clientY: number) => {
      const root = gridRef.current;
      if (!root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>("[data-host-id]"),
      );
      const cards = nodes.map((node) => ({
        id: node.dataset.hostId!,
        rect: node.getBoundingClientRect(),
      }));
      const insertAt = insertIndexForPoint(cards, dragId, clientX, clientY);
      const current = useHostStore.getState().hosts;
      const without = current.filter((h) => h.id !== dragId);
      const dragged = current.find((h) => h.id === dragId);
      if (!dragged) return;
      const next = [
        ...without.slice(0, insertAt),
        dragged,
        ...without.slice(insertAt),
      ];
      const same =
        next.length === current.length &&
        next.every((h, i) => h.id === current[i]?.id);
      if (same) return;
      applyOrder(next.map((h) => h.id));
      orderDirty.current = true;
    },
    [applyOrder],
  );

  const endDrag = useCallback(async () => {
    const wasDragging = dragRef.current != null;
    dragRef.current = null;
    setDrag(null);
    pressOrigin.current = null;
    if (wasDragging && orderDirty.current) {
      orderDirty.current = false;
      try {
        await persistOrder();
      } catch {
        /* keep optimistic order */
      }
    }
  }, [persistOrder]);

  // Global pointer tracking while a drag session is active.
  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const next: DragSession = {
        ...session,
        x: e.clientX - session.offsetX,
        y: e.clientY - session.offsetY,
      };
      dragRef.current = next;
      setDrag(next);
      reorderFromPoint(session.id, e.clientX, e.clientY);
    };

    const onUp = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      void endDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, endDrag, reorderFromPoint]);

  const beginDrag = useCallback(
    (hostId: string, pointerId: number, clientX: number, clientY: number) => {
      const cardEl = pressOrigin.current?.cardEl;
      const rect = cardEl?.getBoundingClientRect();
      const width = (rect?.width ?? 232) * 0.92;
      const height = (rect?.height ?? 72) * 0.92;
      const session: DragSession = {
        id: hostId,
        pointerId,
        width,
        height,
        offsetX: width / 2,
        offsetY: height / 2,
        x: clientX - width / 2,
        y: clientY - height / 2,
      };
      dragRef.current = session;
      setDrag(session);
      suppressClick.current = true;
      orderDirty.current = false;
      clearLongPress();
    },
    [clearLongPress],
  );

  const openEditor = (host: HostRecord) => {
    const draft = authDraftFromRecord(host);
    setEditing({ ...host, authMode: draft.authMode });
    setPrivateKeyDraft(draft.privateDraft);
    setPublicKeyDraft(draft.publicDraft);
    setFirstTimeDeploy(draft.firstTimeDeploy);
    setKeyPanel(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setKeyPanel(null);
  };

  const handleSave = async (host: HostRecord) => {
    await save(host);
    closeEditor();
  };

  const handleKeyConfirm = (kind: SshKeyPanelKind, draft: SshKeyDraft) => {
    if (kind === "private") setPrivateKeyDraft(draft);
    else setPublicKeyDraft(draft);
    setKeyPanel(null);
  };

  const dragging = drag != null;
  const draggedHost = drag ? hosts.find((h) => h.id === drag.id) : null;

  return (
    <>
      <div className="-mx-8 relative flex h-[calc(100vh-4rem)]">
        <div
          className={cn(
            "min-w-0 flex-1 space-y-4 overflow-y-auto px-8 pb-4",
            editing && "pr-80",
          )}
        >
          <PageHeader title={t("hosts.title")} description={t("hosts.description")} />

          <Button onClick={() => openEditor({ ...EMPTY_HOST })}>
            <Plus className="h-4 w-4" />
            {t("hosts.actions.newHost")}
          </Button>

          {loadError && (
            <Card>
              <CardContent className="py-4 text-sm text-destructive">
                {loadError}
              </CardContent>
            </Card>
          )}

          {loaded && hosts.length === 0 && !loadError ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("hosts.empty")}
              </CardContent>
            </Card>
          ) : (
            <div
              ref={gridRef}
              className="flex flex-wrap content-start"
              style={{ gap: FIXED_GAP_PX }}
            >
              {hosts.map((h) => {
                const isSource = drag?.id === h.id;
                return (
                  <Card
                    key={h.id}
                    data-host-id={h.id}
                    className={cn(
                      "group shrink-0 touch-none select-none transition-[width,transform,opacity,box-shadow] duration-150 hover:border-primary/60",
                      dragging ? "cursor-grabbing" : "cursor-pointer",
                      isSource && "opacity-30",
                      dragging && !isSource && "scale-[0.92]",
                    )}
                    style={{
                      width: dragging ? HOST_CARD_W_DRAG : HOST_CARD_W,
                    }}
                    onPointerDown={(e) => {
                      if (editing || e.button !== 0 || dragging) return;
                      if ((e.target as HTMLElement).closest("button")) return;
                      pressOrigin.current = {
                        id: h.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        x: e.clientX,
                        y: e.clientY,
                        pointerId: e.pointerId,
                        cardEl: e.currentTarget,
                      };
                      clearLongPress();
                      longPressTimer.current = window.setTimeout(() => {
                        const origin = pressOrigin.current;
                        if (!origin || origin.id !== h.id) return;
                        beginDrag(
                          h.id,
                          origin.pointerId,
                          origin.x,
                          origin.y,
                        );
                      }, LONG_PRESS_MS);
                    }}
                    onPointerMove={(e) => {
                      const origin = pressOrigin.current;
                      if (!origin || dragRef.current) return;
                      if (origin.id !== h.id) return;
                      origin.x = e.clientX;
                      origin.y = e.clientY;
                      const dx = e.clientX - origin.startX;
                      const dy = e.clientY - origin.startY;
                      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
                        clearLongPress();
                        pressOrigin.current = null;
                      }
                    }}
                    onPointerUp={() => {
                      if (!dragRef.current) {
                        clearLongPress();
                        pressOrigin.current = null;
                      }
                    }}
                    onPointerCancel={() => {
                      if (!dragRef.current) {
                        clearLongPress();
                        pressOrigin.current = null;
                      }
                    }}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      if (dragging) return;
                      openEditor(h);
                    }}
                  >
                    <HostCardBody
                      host={h}
                      compact={dragging}
                      showDelete={!dragging}
                      onDelete={() => {
                        void remove(h.id);
                        if (editing?.id === h.id) closeEditor();
                      }}
                    />
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <AnimatePresence initial={false}>
          {editing && (
            <motion.aside
              key="host-editor-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.18, ease: drawerEase }}
              className="absolute inset-y-0 right-0 z-10 w-80 overflow-hidden rounded-l-lg border-y border-l border-border bg-card shadow-lg"
              style={{ willChange: "transform" }}
            >
              <div className="h-full w-80">
                <HostEditor
                  key={editing.id || "new"}
                  host={editing}
                  onSave={handleSave}
                  onClose={closeEditor}
                  keyPanel={keyPanel}
                  onKeyPanelChange={setKeyPanel}
                  privateKeyDraft={privateKeyDraft}
                  publicKeyDraft={publicKeyDraft}
                  firstTimeDeploy={firstTimeDeploy}
                  onFirstTimeDeployChange={setFirstTimeDeploy}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {drag && draggedHost
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999]"
              style={{
                left: drag.x,
                top: drag.y,
                width: drag.width,
              }}
            >
              <Card className="border-primary/70 shadow-xl">
                <HostCardBody host={draggedHost} compact />
              </Card>
            </div>,
            document.body,
          )
        : null}

      {keyPanel && editing && (
        <SshKeyInputPanel
          kind={keyPanel}
          draft={keyPanel === "private" ? privateKeyDraft : publicKeyDraft}
          onConfirm={(d) => handleKeyConfirm(keyPanel, d)}
          onClose={() => setKeyPanel(null)}
        />
      )}
    </>
  );
}
