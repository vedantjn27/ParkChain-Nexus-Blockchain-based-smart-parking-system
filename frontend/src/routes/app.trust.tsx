import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { api, apiJson } from "@/lib/api";
import type { TrustResponse } from "@/lib/types";
import { useAuth } from "@/context/AuthProvider";
import { TxLink } from "@/components/TxLink";
import { fmtDateTime } from "@/lib/format";

interface ChainActionResponse {
  chain_status?: string | null;
  chain_error?: string | null;
}

export const Route = createFileRoute("/app/trust")({ component: TrustPage });

function TrustPage() {
  const { walletAddress } = useAuth();
  const [data, setData] = useState<TrustResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!walletAddress) return;
    api<TrustResponse>(`/trust/${walletAddress}`, { auth: false })
      .then(setData)
      .catch(() => setData(null));
  };
  useEffect(load, [walletAddress]);

  const mint = async () => {
    setBusy(true);
    try {
      const res = await apiJson<ChainActionResponse>("/trust/me/mint", {});
      notifyChainStatus("Trust SBT mint", res);
      toast.success("Trust SBT minted");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const adjust = async (delta: number) => {
    if (!walletAddress) return;
    setBusy(true);
    try {
      const res = await apiJson<ChainActionResponse>(`/trust/${walletAddress}/adjust`, {
        delta,
        reason_code: delta > 0 ? "clean-session" : "incident",
      });
      notifyChainStatus("Trust score adjustment", res);
      toast.success("Score adjusted");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const score = data?.score ?? 0;
  const pct = Math.min(100, (score / 1000) * 100);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trust Score</h1>
          <p className="text-sm text-muted-foreground">Your soulbound score on TrustScoreSBT.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-4 border-primary/30">
            <div className="text-center">
              <div className="text-2xl font-bold">{score}</div>
              <div className="text-[10px] uppercase text-muted-foreground">/ 1000</div>
            </div>
          </div>
          <div className="flex-1">
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={mint}
                disabled={busy}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <ShieldCheck className="mr-1 inline h-3 w-3" /> Mint / refresh SBT
              </button>
              <button
                onClick={() => adjust(5)}
                disabled={busy}
                className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent/10"
              >
                +5 clean session
              </button>
              <button
                onClick={() => adjust(-10)}
                disabled={busy}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive hover:bg-destructive/15"
              >
                -10 incident
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Delta</th>
              <th>Reason</th>
              <th>Tx</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data?.history ?? []).map((h, i) => (
              <tr key={i} className="text-xs">
                <td
                  className={`py-2 font-bold ${h.delta >= 0 ? "text-accent" : "text-destructive"}`}
                >
                  {h.delta > 0 ? `+${h.delta}` : h.delta}
                </td>
                <td>{h.reason_code}</td>
                <td>
                  <TxLink hash={h.tx_hash} />
                </td>
                <td className="text-muted-foreground">{fmtDateTime(h.created_at)}</td>
              </tr>
            ))}
            {!data?.history?.length && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  No history.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function notifyChainStatus(label: string, res: ChainActionResponse) {
  if (res.chain_status === "fallback") {
    toast.warning(`${label} used local fallback`, {
      description: res.chain_error ?? "The blockchain transaction failed, but the demo mirror continued.",
      duration: 9000,
    });
  }
}
