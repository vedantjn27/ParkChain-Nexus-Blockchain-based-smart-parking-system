import { Link } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NetworkBadge } from "@/components/NetworkBadge";
import { WalletPill } from "@/components/WalletPill";
import { useVisualizer } from "@/context/VisualizerProvider";
import { Radio } from "lucide-react";

export function AppHeader() {
  const { connected, events } = useVisualizer();
  const latest = events[0];
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur">
      <SidebarTrigger />
      <Link to="/" className="ml-1 flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-accent" />
        <span className="font-semibold tracking-tight">ParkChain Nexus</span>
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <span
          className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
            connected
              ? "border-accent/40 bg-accent/10 text-accent-foreground"
              : "border-border bg-muted text-muted-foreground"
          }`}
          title={latest ? `Latest: ${latest.eventType}` : "WS feed"}
        >
          <Radio className={`h-3 w-3 ${connected ? "animate-pulse text-accent" : ""}`} />
          {connected ? "Live feed" : "Feed offline"}
        </span>
        <NetworkBadge />
        <ThemeToggle />
        <WalletPill />
      </div>
    </header>
  );
}
