import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, MapPin, Zap, ShieldCheck, LineChart as LineIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, apiJson } from "@/lib/api";
import type { ActiveSessionDto, ForecastResponse, Lot, Slot, SessionDto } from "@/lib/types";
import { reserveSlotOnChain, parseSessionIdFromReceipt } from "@/lib/contracts";
import { useVisualizer } from "@/context/VisualizerProvider";
import { ensureAmoy } from "@/lib/wallet";

export const Route = createFileRoute("/app/map")({
  component: MapPage,
});

function MapPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSessionDto[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const { addPending, markConfirmed } = useVisualizer();
  const nav = useNavigate();

  const loadLots = () =>
    api<Lot[]>("/lots", { auth: false })
      .then(setLots)
      .catch((e) => toast.error((e as Error).message));

  const loadActiveSessions = () =>
    api<ActiveSessionDto[]>("/sessions/active/me")
      .then(setActiveSessions)
      .catch(() => setActiveSessions([]));

  useEffect(() => {
    loadLots();
    loadActiveSessions();
  }, []);

  useEffect(() => {
    if (!selectedLot) {
      setSlots([]);
      setForecast(null);
      return;
    }
    api<Slot[]>(`/lots/${selectedLot.lot_id}/slots`, { auth: false })
      .then(setSlots)
      .catch(() => {});
    api<ForecastResponse>(`/forecast/${selectedLot.lot_id}?historical_demand_factor=1.1`, {
      auth: false,
    })
      .then(setForecast)
      .catch(() => {});
  }, [selectedLot]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await apiJson("/demo/seed", {}, { auth: false });
      toast.success("Demo data seeded");
      await loadLots();
      await loadActiveSessions();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };

  const handleReserve = async (slot: Slot) => {
    if (!selectedLot) return;
    setBusy(true);
    try {
      await ensureAmoy();
      toast.info("Confirm in MetaMask…");
      const tx = await reserveSlotOnChain(selectedLot.lot_id, slot.slot_id);
      addPending(tx.hash, {
        eventType: "SlotReserved (pending)",
        payload: { lotId: selectedLot.lot_id, slotId: slot.slot_id },
      });
      toast.success("Submitted. Awaiting receipt…");
      const receipt = await tx.wait();
      const onChainId = parseSessionIdFromReceipt(receipt);
      markConfirmed(tx.hash, {
        eventType: "SlotReserved",
        blockNumber: receipt?.blockNumber ?? null,
        sessionId: onChainId,
      });
      if (!onChainId) throw new Error("Could not parse session id from receipt");

      const imported = await apiJson<SessionDto>("/sessions/import-on-chain", {
        on_chain_session_id: onChainId,
        lot_id: selectedLot.lot_id,
        slot_id: slot.slot_id,
        reserve_tx_hash: tx.hash,
        is_ev_charging: slot.is_ev,
      });
      api(`/chain/events/sync`, {
        method: "POST",
        auth: false,
        body: JSON.stringify({ from_block: receipt?.blockNumber ?? 0, to_block: "latest" }),
      }).catch(() => {});
      toast.success("Reserved on-chain");
      nav({ to: "/app/session/$id", params: { id: String(imported.session_id) } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLocalReserve = async (slot: Slot) => {
    if (!selectedLot) return;
    setBusy(true);
    try {
      const sess = await apiJson<SessionDto>("/sessions/reserve", {
        lot_id: selectedLot.lot_id,
        slot_id: slot.slot_id,
        is_ev_charging: slot.is_ev,
      });
      toast.success("Local-only session created");
      nav({ to: "/app/session/$id", params: { id: String(sess.session_id) } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeSessionBySlot = new Map(activeSessions.map((session) => [session.slot_id, session]));

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Parking Map</h1>
          <p className="text-sm text-muted-foreground">
            Pick a lot, reserve a slot — signed by your wallet, recorded on-chain.
          </p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-accent/10 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" /> {seeding ? "Seeding…" : "Seed demo data"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-3">
          {lots.map((lot) => {
            const active = selectedLot?.lot_id === lot.lot_id;
            return (
              <button
                key={lot.lot_id}
                onClick={() => setSelectedLot(lot)}
                className={`block w-full rounded-2xl border p-4 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      <MapPin className="h-4 w-4 text-primary" /> {lot.name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {lot.lat.toFixed(4)}, {lot.lng.toFixed(4)} · ${lot.base_price}/min base
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-semibold">{Math.round(lot.occupancy_pct)}% full</div>
                    <div className="text-muted-foreground">
                      {lot.occupied_slots}/{lot.total_slots}
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${Math.min(100, Math.round(lot.occupancy_pct))}%` }}
                  />
                </div>
              </button>
            );
          })}
          {lots.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No lots yet. Click <em>Seed demo data</em>.
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selectedLot ? (
            <>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Slots — {selectedLot.name}</h2>
                  <span className="text-xs text-muted-foreground">{slots.length} total</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {slots.map((s) => {
                    const avail = s.status === "available";
                    const activeSession = activeSessionBySlot.get(s.slot_id);
                    return (
                      <div
                        key={s.slot_id}
                        className={`rounded-xl border p-3 text-center text-xs ${
                          avail
                            ? "border-accent/40 bg-accent/5"
                            : "border-border bg-muted opacity-70"
                        }`}
                      >
                        <div className="font-mono text-sm font-semibold">{s.slot_number}</div>
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                          {s.is_ev && (
                            <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                              <Zap className="inline h-3 w-3" /> EV
                            </span>
                          )}
                          {s.is_premium && (
                            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                              Premium
                            </span>
                          )}
                          {s.min_trust_score > 0 && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                              <ShieldCheck className="inline h-3 w-3" /> {s.min_trust_score}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 text-[10px] capitalize text-muted-foreground">
                          {activeSession ? `your ${activeSession.state}` : s.status}
                        </div>
                        {activeSession ? (
                          <div className="mt-2">
                            <button
                              onClick={() =>
                                nav({
                                  to: "/app/session/$id",
                                  params: { id: String(activeSession.session_id) },
                                })
                              }
                              disabled={busy}
                              className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                              Open session
                            </button>
                          </div>
                        ) : avail ? (
                          <div className="mt-2 flex flex-col gap-1">
                            <button
                              onClick={() => handleReserve(s)}
                              disabled={busy}
                              className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                              Reserve on-chain
                            </button>
                            <button
                              onClick={() => handleLocalReserve(s)}
                              disabled={busy}
                              className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent/10 disabled:opacity-60"
                            >
                              Local only
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <LineIcon className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Occupancy forecast</h2>
                  {forecast && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      now {Math.round(forecast.current_occupancy_pct)}%
                    </span>
                  )}
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={
                        forecast
                          ? [
                              { t: "now", v: Math.round(forecast.current_occupancy_pct) },
                              ...forecast.points.map((p) => ({
                                t: `+${p.minutes_ahead}m`,
                                v: Math.round(p.predicted_occupancy_pct),
                              })),
                            ]
                          : []
                      }
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="t" stroke="var(--color-muted-foreground)" fontSize={12} />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={12}
                        domain={[0, 100]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="var(--color-primary)"
                        strokeWidth={2.5}
                        dot
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {forecast?.rationale && (
                  <p className="mt-2 text-xs text-muted-foreground">{forecast.rationale}</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              Select a lot to view slots and forecast.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
