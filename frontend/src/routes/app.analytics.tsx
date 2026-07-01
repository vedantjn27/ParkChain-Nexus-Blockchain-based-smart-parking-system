import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { ChainEvent, Lot } from "@/lib/types";

export const Route = createFileRoute("/app/analytics")({
  component: AnalyticsPage,
});

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function AnalyticsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [events, setEvents] = useState<ChainEvent[]>([]);

  useEffect(() => {
    api<Lot[]>("/lots", { auth: false })
      .then(setLots)
      .catch(() => {});
    api<ChainEvent[]>("/chain/events?limit=200", { auth: false })
      .then(setEvents)
      .catch(() => {});
  }, []);

  const occupancyData = lots.map((l) => ({ name: l.name, value: Math.round(l.occupancy_pct) }));
  const eventTypeData = Object.entries(
    events.reduce<Record<string, number>>((acc, e) => {
      acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  // Group events by hour bucket
  const buckets: Record<string, number> = {};
  events.forEach((e) => {
    const t = e.indexed_at ? new Date(e.indexed_at) : new Date();
    const key = `${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:00`;
    buckets[key] = (buckets[key] ?? 0) + 1;
  });
  const throughputData = Object.entries(buckets)
    .slice(-20)
    .map(([t, v]) => ({ t, v }));

  const disputes = events.filter((e) => e.event_type.startsWith("Dispute")).length;
  const reserved = events.filter((e) => e.event_type === "SlotReserved").length;
  const exited = events.filter((e) => e.event_type === "ExitConfirmed").length;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Network Analytics</h1>
        <p className="text-sm text-muted-foreground">Live ParkChain operational metrics.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Reservations" value={reserved} />
        <Kpi label="Exits" value={exited} />
        <Kpi label="Disputes" value={disputes} />
        <Kpi label="Lots online" value={lots.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Occupancy per lot">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={occupancyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Event type distribution">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={eventTypeData} dataKey="value" nameKey="name" outerRadius={100} label>
                {eventTypeData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Transaction throughput (hourly)" wide>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={throughputData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="t" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke="var(--color-accent)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 ${wide ? "lg:col-span-2" : ""}`}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}
