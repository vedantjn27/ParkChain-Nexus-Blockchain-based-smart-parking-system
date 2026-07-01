import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { connectChainFeed } from "@/lib/ws";
import type { ChainEvent, VizTx, WsMessage } from "@/lib/types";
import { api } from "@/lib/api";

interface VizContextValue {
  events: VizTx[];
  connected: boolean;
  addPending: (
    txHash: string,
    opts?: { eventType?: string; sessionId?: number | null; payload?: unknown },
  ) => void;
  markConfirmed: (txHash: string, info?: Partial<VizTx>) => void;
  clear: () => void;
}

const Ctx = createContext<VizContextValue | null>(null);

const MAX_EVENTS = 80;

export function VisualizerProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<VizTx[]>([]);
  const [connected, setConnected] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  const upsert = useCallback((tx: VizTx) => {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.txHash === tx.txHash);
      let next: VizTx[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], ...tx };
      } else {
        next = [tx, ...prev];
      }
      return next.slice(0, MAX_EVENTS);
    });
  }, []);

  const addPending: VizContextValue["addPending"] = useCallback(
    (txHash, opts) => {
      upsert({
        id: txHash,
        status: "pending",
        txHash,
        eventType: opts?.eventType ?? "Pending",
        sessionId: opts?.sessionId ?? null,
        payload: opts?.payload,
        createdAt: Date.now(),
      });
    },
    [upsert],
  );

  const markConfirmed: VizContextValue["markConfirmed"] = useCallback(
    (txHash, info) => {
      upsert({
        id: txHash,
        status: "confirmed",
        txHash,
        eventType: info?.eventType ?? "Confirmed",
        blockNumber: info?.blockNumber ?? null,
        sessionId: info?.sessionId ?? null,
        payload: info?.payload,
        createdAt: Date.now(),
      });
    },
    [upsert],
  );

  // Load history once
  useEffect(() => {
    let cancelled = false;
    api<ChainEvent[]>("/chain/events?limit=50", { auth: false })
      .then((list) => {
        if (cancelled) return;
        const seeded: VizTx[] = list
          .filter((e) => !!e.tx_hash)
          .map((e) => ({
            id: e.tx_hash as string,
            status: "confirmed",
            txHash: e.tx_hash as string,
            blockNumber: e.block_number ?? null,
            eventType: e.event_type,
            sessionId: e.session_id ?? null,
            payload: e.payload,
            createdAt: Date.now(),
          }));
        seeded.forEach((s) => seenRef.current.add(s.txHash));
        setEvents(seeded.slice(0, MAX_EVENTS));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // WS
  useEffect(() => {
    const off = connectChainFeed((msg: WsMessage) => {
      if (msg.type === "feed_connected") {
        setConnected(true);
        return;
      }
      if (msg.type === "tx_confirmed" && msg.payload?.tx_hash) {
        markConfirmed(msg.payload.tx_hash, {
          eventType: msg.payload.event_type,
          blockNumber: msg.payload.block_number,
          sessionId: msg.payload.session_id ?? null,
          payload: msg.payload.payload,
        });
      }
    });
    return () => {
      setConnected(false);
      off();
    };
  }, [markConfirmed]);

  const value = useMemo<VizContextValue>(
    () => ({ events, connected, addPending, markConfirmed, clear: () => setEvents([]) }),
    [events, connected, addPending, markConfirmed],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVisualizer(): VizContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVisualizer must be inside VisualizerProvider");
  return v;
}
