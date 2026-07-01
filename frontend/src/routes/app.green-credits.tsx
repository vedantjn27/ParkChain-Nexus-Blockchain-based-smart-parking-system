import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Leaf } from "lucide-react";
import { api, apiJson } from "@/lib/api";
import type { GreenCreditResponse } from "@/lib/types";
import { useAuth } from "@/context/AuthProvider";
import { TxLink } from "@/components/TxLink";
import { fmtToken } from "@/lib/format";

interface ChainActionResponse {
  chain_status?: string | null;
  chain_error?: string | null;
}

export const Route = createFileRoute("/app/green-credits")({ component: GreenPage });

function GreenPage() {
  const { walletAddress } = useAuth();
  const [data, setData] = useState<GreenCreditResponse | null>(null);
  const [amount, setAmount] = useState("0.1");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!walletAddress) return;
    api<GreenCreditResponse>(`/green-credits/${walletAddress}`, { auth: false })
      .then(setData)
      .catch(() => {});
  };
  useEffect(load, [walletAddress]);

  const toRaw = () => BigInt(Math.floor(Number(amount) * 1e18)).toString();

  const mint = async () => {
    if (!walletAddress) return;
    setBusy(true);
    try {
      const res = await apiJson<GreenCreditResponse>(`/green-credits/${walletAddress}/mint`, {
        amount: toRaw(),
        reason_code: "ev-session",
      });
      notifyChainStatus("Green credit mint", res);
      toast.success("Minted");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const redeem = async () => {
    setBusy(true);
    try {
      const res = await apiJson<GreenCreditResponse>("/green-credits/me/redeem", {
        amount: toRaw(),
        reason_code: "parking-discount",
      });
      notifyChainStatus("Green credit redeem", res);
      toast.success("Redeemed");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Green Credits</h1>
        <p className="text-sm text-muted-foreground">ERC-20 GreenCreditToken (18 decimals).</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Leaf className="h-7 w-7" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Balance</div>
            <div className="text-3xl font-bold">
              {data ? fmtToken(data.balance) : "—"}{" "}
              <span className="text-base font-normal text-muted-foreground">GREEN</span>
            </div>
            {data?.tx_hash && (
              <div className="mt-1 text-xs">
                Last tx: <TxLink hash={data.tx_hash} />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <div className="mb-1 text-muted-foreground">Amount (GREEN)</div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={mint}
            disabled={busy}
            className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Mint
          </button>
          <button
            onClick={redeem}
            disabled={busy}
            className="rounded-md border border-border bg-card px-3 py-2 text-xs hover:bg-accent/10 disabled:opacity-60"
          >
            Redeem
          </button>
        </div>
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
