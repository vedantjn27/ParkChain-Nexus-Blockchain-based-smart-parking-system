import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet, ArrowRight, ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthProvider";
import { api } from "@/lib/api";
import type { ChainStatus } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NetworkBadge } from "@/components/NetworkBadge";
import heroImg from "@/assets/branding-hero.jpg";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — ParkChain Nexus" },
      {
        name: "description",
        content: "Sign in to ParkChain Nexus with your MetaMask wallet on Polygon Amoy.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { isAuthenticated, loginWithWallet, metamaskAvailable, walletAddress } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [displayName, setName] = useState("");
  const [health, setHealth] = useState<"unknown" | "ok" | "down">("unknown");
  const [chain, setChain] = useState<ChainStatus | null>(null);

  useEffect(() => {
    if (isAuthenticated) nav({ to: "/app" });
  }, [isAuthenticated, nav]);

  useEffect(() => {
    api<{ status?: string } | string>("/health", { auth: false })
      .then(() => setHealth("ok"))
      .catch(() => setHealth("down"));
    api<ChainStatus>("/chain/status", { auth: false })
      .then(setChain)
      .catch(() => setChain(null));
  }, []);

  const handleLogin = async () => {
    if (!metamaskAvailable) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    setLoading(true);
    try {
      await loginWithWallet(displayName.trim() || undefined);
      toast.success("Signed in");
      nav({ to: "/app" });
    } catch (e) {
      toast.error((e as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          backgroundImage: `url(${heroImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/70 via-background/85 to-background" />
      <div className="absolute inset-0 -z-10 grid-bg opacity-20" />

      <header className="flex items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-accent" />
          <span className="font-semibold tracking-tight">ParkChain Nexus</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <NetworkBadge />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col items-center px-4 pb-16 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="glass rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
            <h1 className="mt-5 text-center text-2xl font-bold tracking-tight">
              Sign in with wallet
            </h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Wallet signature on Polygon Amoy — no password.
            </p>

            <div className="mt-6 space-y-3">
              <label className="text-xs font-medium text-muted-foreground">
                Display name (optional)
              </label>
              <input
                value={displayName}
                onChange={(e) => setName(e.target.value)}
                placeholder="Driver Nexus"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                disabled={loading}
                onClick={handleLogin}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Signing…" : metamaskAvailable ? "Connect MetaMask" : "Install MetaMask"}
                <ArrowRight className="h-4 w-4" />
              </button>
              {!metamaskAvailable && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  MetaMask was not detected in this browser.
                </div>
              )}
              {walletAddress && (
                <div className="text-center text-xs text-muted-foreground">
                  Connected: <span className="font-mono">{walletAddress}</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <StatusCard
              label="Backend"
              ok={health === "ok"}
              text={health === "unknown" ? "Checking…" : health === "ok" ? "Online" : "Offline"}
            />
            <StatusCard
              label="Chain"
              ok={!!chain?.connected}
              text={chain ? `${chain.network}${chain.connected ? "" : " · down"}` : "Checking…"}
            />
          </div>
          {chain && (
            <div className="mt-3 rounded-xl border border-border bg-card p-3 text-xs">
              <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Contracts
              </div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {Object.entries(chain.contracts).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${v ? "bg-accent" : "bg-destructive"}`}
                    />
                    <span className="truncate">{k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

function StatusCard({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-accent" : "bg-muted-foreground"}`} />
        {text}
      </div>
    </div>
  );
}
