import { POLYGONSCAN_TX } from "@/config";
import { isOnChainHash } from "@/lib/format";
import { ExternalLink } from "lucide-react";

export function TxLink({
  hash,
  className,
}: {
  hash: string | null | undefined;
  className?: string;
}) {
  if (!hash) return <span className="text-muted-foreground">—</span>;
  const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  if (!isOnChainHash(hash)) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs ${className ?? ""}`}
      >
        {short} <span className="text-[10px] text-muted-foreground">local</span>
      </span>
    );
  }
  return (
    <a
      href={POLYGONSCAN_TX(hash)}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent ${className ?? ""}`}
    >
      {short} <ExternalLink className="h-3 w-3" />
    </a>
  );
}
