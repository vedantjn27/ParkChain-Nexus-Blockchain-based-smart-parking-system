import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import type { VizTx } from "@/lib/types";

interface Props {
  events: VizTx[];
  height?: number;
}

const eventColor = (type?: string, status?: string) => {
  if (status === "pending") return "var(--color-chart-3)";
  switch (type) {
    case "SlotReserved":
      return "var(--color-primary)";
    case "EntryConfirmed":
      return "var(--color-chart-2)";
    case "PricingCommitted":
    case "PricingRevealed":
      return "var(--color-chart-4)";
    case "ExitConfirmed":
      return "var(--color-accent)";
    case "DisputeRaised":
      return "var(--color-destructive)";
    case "DisputeResolved":
      return "var(--color-chart-5)";
    case "GreenCreditMinted":
      return "var(--color-chain)";
    default:
      return "var(--color-primary)";
  }
};

const cardBase = {
  background: "var(--color-card)",
  color: "var(--color-foreground)",
  textAlign: "center" as const,
};

export function ChainVisualizer({ events, height = 480 }: Props) {
  const pendingCount = events.filter((event) => event.status === "pending").length;
  const confirmedCount = events.filter((event) => event.status === "confirmed").length;

  const { nodes, edges } = useMemo(() => {
    const recent = events.slice(0, 24);
    const pending = recent.filter((event) => event.status === "pending").slice(0, 6);
    const confirmed = recent.filter((event) => event.status === "confirmed");
    const blocks = Array.from(
      confirmed.reduce<Map<number, VizTx[]>>((acc, event) => {
        const block = event.blockNumber ?? 0;
        acc.set(block, [...(acc.get(block) ?? []), event]);
        return acc;
      }, new Map()),
    ).slice(0, 6);

    const mempoolNode: Node = {
      id: "mempool",
      position: { x: 40, y: 36 },
      data: { label: `Mempool\nwaiting room\n${pending.length} pending` },
      style: {
        ...cardBase,
        width: 150,
        padding: 14,
        borderRadius: 12,
        whiteSpace: "pre-line",
        fontWeight: 700,
        background: "color-mix(in oklch, var(--color-chart-3) 16%, transparent)",
        border: "1px solid var(--color-chart-3)",
      },
    };

    const assemblyNode: Node = {
      id: "assembly",
      position: { x: 330, y: height / 2 - 55 },
      data: { label: `Validator step\nchecks txs\n${confirmed.length} confirmed` },
      style: {
        ...cardBase,
        width: 175,
        padding: 16,
        borderRadius: 18,
        whiteSpace: "pre-line",
        fontWeight: 800,
        background: "color-mix(in oklch, var(--color-primary) 18%, transparent)",
        border: "2px solid var(--color-primary)",
        boxShadow: "0 0 24px -8px var(--color-primary)",
      },
    };

    const chainNode: Node = {
      id: "chain",
      position: { x: 620, y: 36 },
      data: { label: "Blockchain\npermanent record" },
      style: {
        ...cardBase,
        width: 130,
        padding: 12,
        borderRadius: 12,
        fontWeight: 800,
        border: "1px solid var(--color-border)",
      },
    };

    const pendingNodes: Node[] = pending.map((event, index) => ({
      id: `pending-${event.txHash}`,
      position: { x: 40, y: 126 + index * 62 },
      data: {
        label: (
          <div className="text-xs">
            <div className="font-semibold">{event.eventType ?? "pending tx"}</div>
            <div className="font-mono text-[10px] opacity-70">
              {event.txHash.slice(0, 8)}...{event.txHash.slice(-4)}
            </div>
          </div>
        ),
      },
      style: {
        ...cardBase,
        width: 150,
        padding: 8,
        borderRadius: 999,
        border: "1.5px solid var(--color-chart-3)",
        boxShadow: "0 0 18px -2px var(--color-chart-3)",
      },
    }));

    const blockNodes: Node[] = blocks.map(([blockNumber, txs], index) => ({
      id: `block-${blockNumber}-${index}`,
      position: { x: 620 + index * 185, y: 150 },
      data: {
        label: (
          <div className="text-xs">
            <div className="font-semibold">Block #{blockNumber || "local"}</div>
            <div className="text-[10px] opacity-70">
              {txs.length} tx event{txs.length === 1 ? "" : "s"}
            </div>
            <div className="font-mono text-[10px] opacity-70">
              {txs[0]?.txHash.slice(0, 8)}...{txs[0]?.txHash.slice(-4)}
            </div>
            <div className="mt-1 text-[10px] opacity-80">
              {txs
                .map((tx) => tx.eventType)
                .slice(0, 2)
                .join(", ")}
            </div>
          </div>
        ),
      },
      style: {
        ...cardBase,
        width: 160,
        padding: 10,
        borderRadius: 10,
        border: `1.5px solid ${eventColor(txs[0]?.eventType, "confirmed")}`,
      },
    }));

    const pendingEdges: Edge[] = pending.map((event) => ({
      id: `edge-pending-${event.txHash}`,
      source: `pending-${event.txHash}`,
      target: "assembly",
      animated: true,
      style: { stroke: eventColor(event.eventType, event.status), strokeWidth: 1.8 },
    }));

    const blockEdges: Edge[] = blocks.flatMap(([blockNumber], index) => {
      const blockId = `block-${blockNumber}-${index}`;
      const next: Edge[] = [
        {
          id: `edge-assembly-${blockId}`,
          source: "assembly",
          target: blockId,
          animated: index === 0,
          style: { stroke: "var(--color-primary)", strokeWidth: 1.6 },
        },
      ];
      next.push(
        index === 0
          ? {
              id: "edge-chain-first",
              source: "chain",
              target: blockId,
              style: { stroke: "var(--color-border)", strokeWidth: 1.6 },
            }
          : {
              id: `edge-chain-${index}`,
              source: `block-${blocks[index - 1][0]}-${index - 1}`,
              target: blockId,
              style: { stroke: "var(--color-border)", strokeWidth: 1.6 },
            },
      );
      return next;
    });

    return {
      nodes: [mempoolNode, assemblyNode, chainNode, ...pendingNodes, ...blockNodes],
      edges: [...pendingEdges, ...blockEdges],
    };
  }, [events, height]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              What this shows
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              A transaction first waits in the mempool, then gets checked by the network, then
              becomes a confirmed block event that can be audited later.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-chart-3/40 bg-chart-3/10 px-3 py-2">
              <div className="font-semibold text-chart-3">{pendingCount}</div>
              <div className="text-muted-foreground">waiting</div>
            </div>
            <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2">
              <div className="font-semibold text-accent">{confirmedCount}</div>
              <div className="text-muted-foreground">confirmed</div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
          <Explain label="Mempool" text="Temporary waiting area before a transaction is confirmed." />
          <Explain label="Pending" text="Submitted, but not final yet. It may still fail or confirm." />
          <Explain label="Block" text="A confirmed group of events that becomes part of the audit trail." />
        </div>
      </div>
      <div className="overflow-hidden" style={{ height }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} color="var(--color-border)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

function Explain({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="text-muted-foreground">{text}</span>
    </div>
  );
}
