import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apiJson } from "@/lib/api";

export const Route = createFileRoute("/app/owner")({ component: OwnerPage });

interface SlotInput {
  slot_number: string;
  is_ev: boolean;
  is_premium: boolean;
  min_trust_score: number;
}

function OwnerPage() {
  const [name, setName] = useState("My Garage");
  const [lat, setLat] = useState("19.07");
  const [lng, setLng] = useState("72.87");
  const [base, setBase] = useState("2.0");
  const [slots, setSlots] = useState<SlotInput[]>([
    { slot_number: "A-01", is_ev: false, is_premium: false, min_trust_score: 0 },
  ]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await apiJson("/lots", {
        name,
        lat: Number(lat),
        lng: Number(lng),
        base_price: Number(base),
        slots,
      });
      toast.success("Lot created");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lot Owner</h1>
        <p className="text-sm text-muted-foreground">
          Register a parking lot with slots, EV/premium flags, and trust gating.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Latitude">
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Longitude">
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Base $/min">
            <input
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Slots</h2>
            <button
              onClick={() =>
                setSlots([
                  ...slots,
                  {
                    slot_number: `A-${String(slots.length + 1).padStart(2, "0")}`,
                    is_ev: false,
                    is_premium: false,
                    min_trust_score: 0,
                  },
                ])
              }
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent/10"
            >
              <Plus className="h-3 w-3" /> Add slot
            </button>
          </div>
          <div className="space-y-2">
            {slots.map((s, i) => (
              <div
                key={i}
                className="grid items-center gap-2 rounded-md border border-border p-2 text-sm sm:grid-cols-[1fr_auto_auto_auto_auto]"
              >
                <input
                  value={s.slot_number}
                  onChange={(e) => updateSlot(i, { slot_number: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={s.is_ev}
                    onChange={(e) => updateSlot(i, { is_ev: e.target.checked })}
                  />{" "}
                  EV
                </label>
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={s.is_premium}
                    onChange={(e) => updateSlot(i, { is_premium: e.target.checked })}
                  />{" "}
                  Premium
                </label>
                <label className="inline-flex items-center gap-1 text-xs">
                  Trust ≥
                  <input
                    type="number"
                    value={s.min_trust_score}
                    onChange={(e) => updateSlot(i, { min_trust_score: Number(e.target.value) })}
                    className="w-16 rounded-md border border-input bg-background px-1 py-0.5 text-xs"
                  />
                </label>
                <button
                  onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create lot"}
        </button>
      </div>
    </div>
  );

  function updateSlot(i: number, patch: Partial<SlotInput>) {
    setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs">
      <div className="mb-1 text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
