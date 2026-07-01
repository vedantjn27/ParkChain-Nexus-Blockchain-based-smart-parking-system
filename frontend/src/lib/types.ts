export type SessionState =
  | "Reserved"
  | "EntryConfirmed"
  | "PriceCommitted"
  | "Active"
  | "ExitConfirmed"
  | "Settled"
  | "Disputed"
  | "Resolved";

export interface Lot {
  lot_id: number;
  owner_wallet: string;
  name: string;
  lat: number;
  lng: number;
  total_slots: number;
  base_price: number;
  occupied_slots: number;
  occupancy_pct: number;
}

export interface Slot {
  slot_id: number;
  lot_id: number;
  slot_number: string;
  is_ev: boolean;
  is_premium: boolean;
  min_trust_score: number;
  status: "available" | "reserved" | "occupied" | string;
}

export interface SessionDto {
  session_id: number;
  on_chain_session_id: number | null;
  driver_wallet: string;
  lot_id: number;
  slot_id: number;
  state: SessionState;
  entry_ts: string | null;
  exit_ts: string | null;
  final_price_per_min: number | null;
  total_amount: number | null;
  is_ev_charging: boolean;
  tx_hash: string | null;
  chain_status?: "confirmed" | "fallback" | "local" | string | null;
  chain_error?: string | null;
}

export type ActiveSessionDto = SessionDto;

export interface TimelineEvent {
  event_type: string;
  tx_hash: string | null;
  block_number: number | null;
  payload: Record<string, unknown> | null;
  indexed_at: string;
}

export interface ForecastPoint {
  minutes_ahead: number;
  predicted_occupancy_pct: number;
  timestamp: string;
}
export interface ForecastResponse {
  lot_id: number;
  current_occupancy_pct: number;
  historical_demand_factor: number;
  points: ForecastPoint[];
  rationale: string;
}

export interface PriceResponse {
  session_id: number;
  commit_hash: string;
  price_per_minute: number;
  surge_multiplier: number;
  rationale: string;
  source: string;
  verified: boolean;
  chain_status?: "confirmed" | "fallback" | "local" | string | null;
  chain_error?: string | null;
}

export interface TrustResponse {
  wallet_address: string;
  score: number;
  history: Array<{
    delta: number;
    reason_code: string;
    tx_hash: string | null;
    created_at: string;
  }>;
}

export interface GreenCreditResponse {
  wallet_address: string;
  balance: number | string;
  tx_hash: string | null;
  chain_status?: "confirmed" | "fallback" | "local" | string | null;
  chain_error?: string | null;
}

export interface ChainAwareResponse {
  chain_status?: "confirmed" | "fallback" | "local" | string | null;
  chain_error?: string | null;
}

export interface ParkCoinResponse extends ChainAwareResponse {
  wallet_address: string;
  balance: number | string;
  tx_hash: string | null;
}

export interface ChainEvent {
  event_type: string;
  session_id?: number | null;
  block_number: number | null;
  tx_hash: string | null;
  payload: Record<string, unknown> | null;
  indexed_at?: string;
}

export interface ChainStatus {
  rpc_url: string;
  network: string;
  connected: boolean;
  relayer_address: string;
  contracts: Record<string, boolean>;
}

export type WsMessage =
  | { type: "feed_connected"; payload: { message: string } }
  | { type: "tx_confirmed"; payload: ChainEvent };

export interface VizTx {
  id: string;
  status: "pending" | "confirmed";
  txHash: string;
  blockNumber?: number | null;
  eventType?: string;
  sessionId?: number | null;
  payload?: unknown;
  createdAt: number;
}
