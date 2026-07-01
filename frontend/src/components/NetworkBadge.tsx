import { useAuth } from "@/context/AuthProvider";
import { AMOY_CHAIN_ID_HEX } from "@/config";
import { ensureAmoy } from "@/lib/wallet";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function NetworkBadge() {
  const { chainIdHex, metamaskAvailable } = useAuth();
  if (!metamaskAvailable) return null;
  const ok = chainIdHex?.toLowerCase() === AMOY_CHAIN_ID_HEX.toLowerCase();
  return (
    <button
      type="button"
      onClick={() => {
        if (ok) return;
        ensureAmoy().catch((e) => toast.error((e as Error).message));
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        ok
          ? "border-accent/40 bg-accent/10 text-accent-foreground"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {ok ? "Polygon Amoy" : "Switch to Amoy"}
    </button>
  );
}
