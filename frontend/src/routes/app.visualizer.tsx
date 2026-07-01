import { createFileRoute } from "@tanstack/react-router";
import { useVisualizer } from "@/context/VisualizerProvider";
import { ChainVisualizer } from "@/components/ChainVisualizer";
import { TxLink } from "@/components/TxLink";
import { fmtDateTime } from "@/lib/format";
import { Radio, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/app/visualizer")({
  component: VizPage,
});

function VizPage() {
  const { events, connected, clear } = useVisualizer();

  const syncRecent = async () => {
    try {
      const events = await api<unknown[]>("/chain/events/sync", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ from_block: 0, to_block: "latest" }),
      });
      toast.success(events.length ? `Synced ${events.length} chain events` : "No new chain events");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Blockchain Visualizer</h1>
          <p className="text-sm text-muted-foreground">
            Pending + confirmed transactions, fed by WebSocket and your local MetaMask submissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${
              connected
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-muted text-muted-foreground"
            }`}
          >
            <Radio className={`h-3 w-3 ${connected ? "animate-pulse" : ""}`} />
            {connected ? "Live" : "Offline"}
          </span>
          <button
            onClick={syncRecent}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent/10"
          >
            Sync chain events
          </button>
          <button
            onClick={clear}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      <ChainVisualizer events={events} height={520} />

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Event log
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Event</th>
                <th>Status</th>
                <th>Session</th>
                <th>Block</th>
                <th>Tx</th>
                <th>At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((ev) => (
                <tr key={ev.id} className="text-xs">
                  <td className="py-2 font-medium">{ev.eventType ?? "—"}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${ev.status === "pending" ? "bg-chart-3/20 text-chart-3" : "bg-accent/15 text-accent"}`}
                    >
                      {ev.status}
                    </span>
                  </td>
                  <td>{ev.sessionId ?? "—"}</td>
                  <td>{ev.blockNumber ?? "—"}</td>
                  <td>
                    <TxLink hash={ev.txHash} />
                  </td>
                  <td className="text-muted-foreground">
                    {fmtDateTime(new Date(ev.createdAt).toISOString())}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
