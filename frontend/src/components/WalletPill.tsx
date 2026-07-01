import { useAuth } from "@/context/AuthProvider";
import { shortAddr } from "@/lib/wallet";
import { LogOut, Wallet } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export function WalletPill() {
  const { walletAddress, logout, isAuthenticated } = useAuth();
  const nav = useNavigate();
  if (!isAuthenticated) return null;
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1 py-1 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
        <Wallet className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono">{shortAddr(walletAddress)}</span>
      </span>
      <button
        type="button"
        title="Sign out"
        onClick={() => {
          logout();
          nav({ to: "/" });
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
