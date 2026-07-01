import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ChainStatus } from "@/lib/types";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeProvider";
import { CONTRACT_ADDRESSES, POLYGONSCAN_ADDR, API_BASE_URL, WS_URL } from "@/config";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { walletAddress, user, chainIdHex, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [chain, setChain] = useState<ChainStatus | null>(null);

  useEffect(() => {
    api<ChainStatus>("/chain/status", { auth: false })
      .then(setChain)
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Wallet, network and theme.</p>
      </div>

      <Section title="Theme">
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-md border px-3 py-1.5 text-xs capitalize ${theme === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Account">
        <Row k="Display name" v={user?.display_name ?? "—"} />
        <Row k="Wallet" v={walletAddress ?? "—"} mono />
        <Row k="Chain id" v={chainIdHex ?? "—"} mono />
        <button
          onClick={logout}
          className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive"
        >
          Sign out
        </button>
      </Section>

      <Section title="Backend">
        <Row k="API" v={API_BASE_URL} mono />
        <Row k="WS" v={WS_URL} mono />
        <Row k="Relayer" v={chain?.relayer_address ?? "—"} mono />
        <Row k="Network" v={chain?.network ?? "—"} />
      </Section>

      <Section title="Contracts (Polygon Amoy)">
        <ul className="space-y-1 text-sm">
          {Object.entries(CONTRACT_ADDRESSES).map(([k, v]) => (
            <li
              key={k}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{k}</span>
              <a
                href={POLYGONSCAN_ADDR(v)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs hover:underline"
              >
                {v}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}
function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? "font-mono text-xs" : "text-sm"}>{v}</span>
    </div>
  );
}
