import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  DoorOpen,
  Flag,
  Gavel,
  LogIn,
  RefreshCcw,
  Timer,
  Wallet as WalletIcon,
} from "lucide-react";
import { api, apiJson } from "@/lib/api";
import type { ChainAwareResponse, ParkCoinResponse, PriceResponse, SessionDto, TimelineEvent } from "@/lib/types";
import { TxLink } from "@/components/TxLink";
import { elapsedString, elapsedMinutes, fmtDateTime, fmtToken } from "@/lib/format";
import { useVisualizer } from "@/context/VisualizerProvider";
import { escrow, parkCoin } from "@/lib/contracts";
import { useAuth } from "@/context/AuthProvider";
import { CONTRACT_ADDRESSES } from "@/config";

export const Route = createFileRoute("/app/session/$id")({
  component: SessionPage,
});

const STATES: { key: string; label: string }[] = [
  { key: "Reserved", label: "Reserved" },
  { key: "EntryConfirmed", label: "Entry" },
  { key: "PriceCommitted", label: "Priced" },
  { key: "Active", label: "Active" },
  { key: "ExitConfirmed", label: "Exit" },
  { key: "Settled", label: "Settled" },
];

function SessionPage() {
  const { id } = Route.useParams();
  const sessionId = Number(id);
  const { walletAddress } = useAuth();
  const { addPending, markConfirmed } = useVisualizer();

  const [sess, setSess] = useState<SessionDto | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [price, setPrice] = useState<PriceResponse | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [escrowAmt, setEscrowAmt] = useState("1");
  const [parkBal, setParkBal] = useState<string | null>(null);
  const pollRef = useRef<number | undefined>(undefined);

  const loadParkBalance = useCallback(async () => {
    if (!walletAddress) return;
    const c = await parkCoin();
    const balance = await c.balanceOf(walletAddress);
    setParkBal(balance.toString());
  }, [walletAddress]);

  const reload = useCallback(async () => {
    const s = await api<SessionDto>(`/sessions/${sessionId}`);
    setSess(s);
    const t = await api<TimelineEvent[]>(`/sessions/${sessionId}/timeline`);
    setTimeline(t);
  }, [sessionId]);

  useEffect(() => {
    reload().catch((e) => toast.error((e as Error).message));
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    pollRef.current = window.setInterval(() => {
      reload().catch(() => {});
    }, 15000);
    return () => {
      window.clearInterval(i);
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [reload]);

  useEffect(() => {
    if (!walletAddress) return;
    loadParkBalance().catch(() => setParkBal(null));
  }, [walletAddress, sess?.state, loadParkBalance]);

  const stateIndex = useMemo(() => {
    if (!sess) return -1;
    const i = STATES.findIndex((s) => s.key === sess.state);
    return i >= 0 ? i : 0;
  }, [sess]);

  const runningCost = useMemo(() => {
    if (!sess?.entry_ts || !sess.final_price_per_min) return 0;
    return elapsedMinutes(sess.entry_ts, now, sess.exit_ts) * sess.final_price_per_min;
  }, [sess, now]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleEntry = () =>
    act("entry", async () => {
      const res = await apiJson<SessionDto>(`/sessions/${sessionId}/entry`, {
        geo_proof_hash: `qr-${sessionId}-${Date.now()}`,
      });
      if (res.tx_hash) markConfirmed(res.tx_hash, { eventType: "EntryConfirmed", sessionId });
      notifyChainStatus("Entry", res);
      toast.success("Entry confirmed");
    });

  const handlePrice = () =>
    act("price", async () => {
      const res = await apiJson<PriceResponse>(`/sessions/${sessionId}/price`, {
        historical_demand_factor: 1.2,
        weather_flag: "clear",
      });
      setPrice(res);
      notifyChainStatus("AI pricing", res);
      toast.success(`AI price set: ${res.price_per_minute}/min`);
    });

  const handleExit = () =>
    act("exit", async () => {
      const res = await api<SessionDto>(`/sessions/${sessionId}/exit`, {
        method: "POST",
      });
      if (res.tx_hash) markConfirmed(res.tx_hash, { eventType: "ExitConfirmed", sessionId });
      notifyChainStatus("Exit", res);
      toast.success("Exit confirmed");
    });

  const handleDispute = (reason: string) =>
    act("dispute", async () => {
      const res = await apiJson<SessionDto>(`/sessions/${sessionId}/dispute`, { reason });
      notifyChainStatus("Dispute", res);
      toast.success("Dispute raised");
    });

  const handleResolve = (refund: boolean) =>
    act("resolve", async () => {
      const res = await apiJson<SessionDto>(`/sessions/${sessionId}/resolve-dispute`, { refund_driver: refund });
      notifyChainStatus("Dispute resolution", res);
      toast.success("Dispute resolved");
    });

  const handleApprove = () =>
    act("approve", async () => {
      const c = await parkCoin();
      const amt = BigInt(Math.floor(Number(escrowAmt) * 1e18));
      const tx = await c.approve(CONTRACT_ADDRESSES.ESCROW_SETTLEMENT, amt);
      addPending(tx.hash, { eventType: "Approve (pending)", sessionId });
      const r = await tx.wait();
      markConfirmed(tx.hash, {
        eventType: "Approve",
        blockNumber: r?.blockNumber ?? null,
        sessionId,
      });
      toast.success("Approved");
    });

  const handleParkFaucet = () =>
    act("park-faucet", async () => {
      const res = await api<ParkCoinResponse>("/parkcoin/me/faucet", { method: "POST" });
      notifyChainStatus("ParkCoin faucet", res);
      setParkBal(String(res.balance));
      if (res.tx_hash) markConfirmed(res.tx_hash, { eventType: "ParkCoinMinted", sessionId });
      toast.success("Demo PARK added");
      await loadParkBalance().catch(() => {});
    });

  const handleDeposit = () =>
    act("deposit", async () => {
      if (!sess) return;
      if (!walletAddress) throw new Error("Connect MetaMask before depositing escrow");
      const amt = BigInt(Math.floor(Number(escrowAmt) * 1e18));
      const token = await parkCoin();
      const balance = BigInt((await token.balanceOf(walletAddress)).toString());
      if (balance < amt) {
        throw new Error(`Not enough PARK. Balance: ${fmtToken(balance.toString())} PARK`);
      }
      const allowance = BigInt(
        (await token.allowance(walletAddress, CONTRACT_ADDRESSES.ESCROW_SETTLEMENT)).toString(),
      );
      if (allowance < amt) {
        throw new Error("Allowance too low. Click Approve first, wait for confirmation, then deposit escrow.");
      }
      const c = await escrow();
      const lots = await api<{ lot_id: number; owner_wallet: string }[]>("/lots", { auth: false });
      const lot = lots.find((l) => l.lot_id === sess.lot_id);
      if (!lot) throw new Error("Lot owner unknown");
      const tx = await c.depositEscrow(
        sess.on_chain_session_id ?? sess.session_id,
        lot.owner_wallet,
        amt,
      );
      addPending(tx.hash, { eventType: "EscrowDeposited (pending)", sessionId });
      const r = await tx.wait();
      markConfirmed(tx.hash, {
        eventType: "EscrowDeposited",
        blockNumber: r?.blockNumber ?? null,
        sessionId,
      });
      toast.success("Escrow deposited");
    });

  const handleRelease = () =>
    act("release", async () => {
      if (!sess) return;
      const c = await escrow();
      const tx = await c.releaseEscrow(sess.on_chain_session_id ?? sess.session_id);
      addPending(tx.hash, { eventType: "EscrowReleased (pending)", sessionId });
      const r = await tx.wait();
      markConfirmed(tx.hash, {
        eventType: "EscrowReleased",
        blockNumber: r?.blockNumber ?? null,
        sessionId,
      });
      toast.success("Escrow released");
    });

  if (!sess) {
    return <div className="text-sm text-muted-foreground">Loading session…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Session #{sess.session_id}
          </div>
          <h1 className="mt-1 text-2xl font-bold">
            Lot {sess.lot_id} · Slot {sess.slot_id}
          </h1>
          <div className="mt-1 text-xs text-muted-foreground">
            On-chain id: {sess.on_chain_session_id ?? "—"} · Driver{" "}
            <span className="font-mono">{sess.driver_wallet.slice(0, 8)}…</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {sess.state}
          </span>
          {sess.tx_hash && <TxLink hash={sess.tx_hash} />}
          <button
            onClick={() => reload()}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent/10"
          >
            <RefreshCcw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </header>

      <Stepper
        currentIndex={stateIndex}
        disputed={sess.state === "Disputed" || sess.state === "Resolved"}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Live timer + actions */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric
                icon={Timer}
                label={sess.exit_ts ? "Parked time" : "Elapsed"}
                value={elapsedString(sess.entry_ts, now, sess.exit_ts)}
              />
              <Metric
                icon={Cpu}
                label="Price/min"
                value={sess.final_price_per_min ? `$${sess.final_price_per_min.toFixed(2)}` : "—"}
              />
              <Metric
                icon={Activity}
                label="Running cost"
                value={sess.final_price_per_min ? `$${runningCost.toFixed(2)}` : "—"}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActBtn
                icon={LogIn}
                label="Confirm entry"
                busy={busy === "entry"}
                disabled={sess.state !== "Reserved"}
                onClick={handleEntry}
              />
              <ActBtn
                icon={Cpu}
                label="Run AI pricing"
                busy={busy === "price"}
                disabled={!["EntryConfirmed", "PriceCommitted", "Active"].includes(sess.state)}
                onClick={handlePrice}
              />
              <ActBtn
                icon={DoorOpen}
                label="Confirm exit"
                busy={busy === "exit"}
                disabled={!["EntryConfirmed", "PriceCommitted", "Active"].includes(sess.state)}
                onClick={handleExit}
              />
              <ActBtn
                icon={Flag}
                label="Raise dispute"
                busy={busy === "dispute"}
                disabled={!["ExitConfirmed", "Settled"].includes(sess.state)}
                variant="destructive"
                onClick={() => {
                  const r = prompt("Reason for dispute?");
                  if (r) void handleDispute(r);
                }}
              />
              {sess.state === "Disputed" && (
                <>
                  <ActBtn
                    icon={Gavel}
                    label="Resolve (keep)"
                    busy={busy === "resolve"}
                    onClick={() => handleResolve(false)}
                  />
                  <ActBtn
                    icon={Gavel}
                    label="Resolve (refund)"
                    busy={busy === "resolve"}
                    variant="destructive"
                    onClick={() => handleResolve(true)}
                  />
                </>
              )}
            </div>

            {sess.total_amount != null && (
              <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Final amount
                </div>
                <div className="text-xl font-bold text-foreground">
                  ${sess.total_amount.toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* AI pricing card */}
          {price && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Verifiable AI pricing</h3>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${
                    price.verified
                      ? "bg-accent/15 text-accent"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {price.verified ? "verified" : "unverified"}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">
                  {price.source}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  icon={Cpu}
                  label="Price/min"
                  value={`$${price.price_per_minute.toFixed(2)}`}
                />
                <Metric
                  icon={Activity}
                  label="Surge"
                  value={`×${price.surge_multiplier.toFixed(2)}`}
                />
                <div className="rounded-xl border border-border p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Commit hash
                  </div>
                  <div className="mt-1 font-mono text-xs break-all">{price.commit_hash}</div>
                </div>
              </div>
              {price.rationale && (
                <p className="mt-3 text-sm text-muted-foreground">{price.rationale}</p>
              )}
              {price.source !== "mistral" && (
                <div className="mt-3 inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Fallback pricing source
                </div>
              )}
            </div>
          )}

          {/* Escrow */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <WalletIcon className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">ParkCoin escrow</h3>
              {parkBal != null && (
                <span className="ml-auto text-xs text-muted-foreground">
                  Balance: {fmtToken(parkBal)} PARK
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs">
                <div className="mb-1 text-muted-foreground">Amount (PARK)</div>
                <input
                  value={escrowAmt}
                  onChange={(e) => setEscrowAmt(e.target.value)}
                  className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <ActBtn label="Approve" busy={busy === "approve"} onClick={handleApprove} />
              <ActBtn
                label="Get demo PARK"
                busy={busy === "park-faucet"}
                onClick={handleParkFaucet}
                variant="secondary"
              />
              <ActBtn label="Deposit escrow" busy={busy === "deposit"} onClick={handleDeposit} />
              <ActBtn
                label="Release escrow"
                busy={busy === "release"}
                onClick={handleRelease}
                variant="secondary"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Direct MetaMask calls to ParkCoin + EscrowSettlement on Polygon Amoy.
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Immutable timeline
          </h3>
          <ol className="relative space-y-4 border-l border-border pl-4">
            {timeline.map((ev, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.05rem] top-1 inline-flex h-2 w-2 rounded-full bg-primary" />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{ev.event_type}</div>
                  <TxLink hash={ev.tx_hash} />
                </div>
                <TimelineSummary event={ev} />
                <div className="text-[11px] text-muted-foreground">
                  {fmtDateTime(ev.indexed_at)}{" "}
                  {ev.block_number ? `· block #${ev.block_number}` : ""}
                </div>
                {ev.payload && (
                  <pre className="hidden">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                )}
              </li>
            ))}
            {timeline.length === 0 && (
              <li className="text-xs text-muted-foreground">No events yet.</li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

function notifyChainStatus(label: string, res: ChainAwareResponse) {
  if (res.chain_status === "fallback") {
    toast.warning(`${label} used local fallback`, {
      description: res.chain_error ?? "The blockchain transaction failed, but the demo mirror continued.",
      duration: 9000,
    });
  }
}

function TimelineSummary({ event }: { event: TimelineEvent }) {
  const facts = eventFacts(event);
  return (
    <div className="mt-2 rounded-lg border border-border bg-background/50 p-2">
      <p className="text-xs text-muted-foreground">{eventDescription(event)}</p>
      {facts.length > 0 && (
        <div className="mt-2 grid gap-1">
          {facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-center justify-between gap-3 rounded-md bg-card px-2 py-1 text-[11px]"
            >
              <span className="text-muted-foreground">{fact.label}</span>
              <span className="text-right font-medium">{fact.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function eventDescription(event: TimelineEvent): string {
  switch (event.event_type) {
    case "SlotReserved":
      return "The driver reserved this slot. The session is now protected from double booking.";
    case "EntryConfirmed":
      return "The driver entered the parking lot and the live parking timer started.";
    case "PricingCommitted":
      return "The backend saved a pricing proof before revealing the final AI-calculated price.";
    case "PricingRevealed":
      return "The AI price was revealed with its explanation and can be compared with the commit proof.";
    case "ExitConfirmed":
      return "The driver exited the lot and the final payable amount was calculated.";
    case "EscrowExitMarked":
      return "The escrow contract was told that parking has ended, enabling release after the dispute window.";
    case "DisputeRaised":
      return "A dispute was opened for this session and settlement can be paused or reviewed.";
    case "DisputeResolved":
      return "The dispute was resolved and the final decision was recorded.";
    default:
      return "A session event was recorded in the audit timeline.";
  }
}

function eventFacts(event: TimelineEvent): Array<{ label: string; value: string }> {
  const payload = event.payload ?? {};
  const facts: Array<{ label: string; value: string }> = [];
  addFact(facts, "Session", payload.session_id ?? payload.sessionId ?? event.payload?.session_id);
  addFact(facts, "On-chain session", payload.on_chain_session_id ?? payload.sessionId);
  addFact(facts, "Lot", payload.lot_id ?? payload.lotId);
  addFact(facts, "Slot", payload.slot_id ?? payload.slotId);
  addFact(facts, "Price/min", formatMoney(payload.price_per_minute));
  addFact(facts, "Final amount", formatMoney(payload.total_amount));
  addFact(facts, "Reason", payload.reason);
  addFact(facts, "Refunded", typeof payload.refunded === "boolean" ? (payload.refunded ? "Yes" : "No") : undefined);
  addFact(facts, "Commit proof", shorten(payload.commit_hash ?? payload.commitHash));
  addFact(facts, "Geo proof", payload.geo_proof_hash);
  addFact(facts, "Chain error", payload.chain_error);
  return facts;
}

function addFact(
  facts: Array<{ label: string; value: string }>,
  label: string,
  value: unknown,
) {
  if (value === undefined || value === null || value === "") return;
  facts.push({ label, value: String(value) });
}

function formatMoney(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(value);
}

function shorten(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length <= 18) return value ? String(value) : undefined;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function Stepper({ currentIndex, disputed }: { currentIndex: number; disputed: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {STATES.map((s, i) => {
          const done = i < currentIndex || (i === currentIndex && i === STATES.length - 1);
          const active = i === currentIndex;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-2">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  done
                    ? "border-accent bg-accent/15 text-accent"
                    : active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {i < STATES.length - 1 && (
                <div
                  className={`mx-1 h-px flex-1 ${i < currentIndex ? "bg-accent" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
        {disputed && (
          <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            <Flag className="h-3 w-3" /> Disputed
          </span>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function ActBtn({
  icon: Icon,
  label,
  onClick,
  busy,
  disabled,
  variant = "primary",
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "destructive";
}) {
  const cls =
    variant === "destructive"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : variant === "secondary"
        ? "border border-border bg-card hover:bg-accent/10"
        : "bg-primary text-primary-foreground hover:bg-primary/90";
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {busy ? "…" : label}
    </button>
  );
}
