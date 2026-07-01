import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Map as MapIcon, Receipt, ShieldCheck, Leaf, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { ChainStatus, Lot, TrustResponse } from "@/lib/types";
import { useAuth } from "@/context/AuthProvider";
import { useVisualizer } from "@/context/VisualizerProvider";
import { ChainVisualizer } from "@/components/ChainVisualizer";
import { TxLink } from "@/components/TxLink";
import { fmtToken, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, walletAddress } = useAuth();
  const { events, connected } = useVisualizer();
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [trust, setTrust] = useState<TrustResponse | null>(null);
  const [green, setGreen] = useState<string | null>(null);

  useEffect(() => {
    api<ChainStatus>("/chain/status", { auth: false })
      .then(setChain)
      .catch(() => {});
    api<Lot[]>("/lots", { auth: false })
      .then(setLots)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!walletAddress) return;
    api<TrustResponse>(`/trust/${walletAddress}`, { auth: false })
      .then(setTrust)
      .catch(() => {});
    api<{ balance: number | string }>(`/green-credits/${walletAddress}`, { auth: false })
      .then((r) => setGreen(String(r.balance)))
      .catch(() => {});
  }, [walletAddress]);

  const totalSlots = lots.reduce((a, l) => a + l.total_slots, 0);
  const occupied = lots.reduce((a, l) => a + l.occupied_slots, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome{user?.display_name ? `, ${user.display_name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">Live ParkChain Nexus dashboard.</p>
        </div>
        <Link
          to="/app/map"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <MapIcon className="h-4 w-4" /> Find parking
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Trust score"
          value={trust ? `${trust.score} / 1000` : "—"}
          hint="SBT"
          icon={ShieldCheck}
        />
        <Stat label="Green credits" value={green ? `${fmtToken(green)} GREEN` : "—"} icon={Leaf} />
        <Stat
          label="Network occupancy"
          value={totalSlots ? `${Math.round((occupied / totalSlots) * 100)}%` : "—"}
          hint={`${occupied}/${totalSlots} slots`}
          icon={Activity}
        />
        <Stat
          label="Chain feed"
          value={connected ? "Live" : "Offline"}
          hint={chain?.network ?? "—"}
          icon={Receipt}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Live blockchain activity
            </h2>
            <Link to="/app/visualizer" className="text-xs text-primary hover:underline">
              Open visualizer →
            </Link>
          </div>
          <ChainVisualizer events={events} height={360} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Latest events
          </h2>
          <ul className="space-y-2 text-sm">
            {events.slice(0, 8).map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{ev.eventType ?? "tx"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDateTime(new Date(ev.createdAt).toISOString())}
                  </div>
                </div>
                <TxLink hash={ev.txHash} />
              </li>
            ))}
            {events.length === 0 && (
              <li className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                No events yet — reserve a slot to start.
              </li>
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Top lots
          </h2>
          <Link to="/app/map" className="text-xs text-primary hover:underline">
            View all <ArrowRight className="inline h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lots.slice(0, 6).map((lot) => (
            <div key={lot.lot_id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{lot.name}</div>
                <span className="text-xs text-muted-foreground">${lot.base_price}/min base</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: `${Math.min(100, Math.round(lot.occupancy_pct))}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {lot.occupied_slots}/{lot.total_slots} occupied · {Math.round(lot.occupancy_pct)}%
              </div>
            </div>
          ))}
          {lots.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No lots yet. Seed demo data from the Parking Map.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
