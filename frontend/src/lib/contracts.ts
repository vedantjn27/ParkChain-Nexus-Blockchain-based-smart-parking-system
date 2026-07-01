import { Contract, type ContractTransactionReceipt } from "ethers";
import { CONTRACT_ADDRESSES } from "@/config";
import { getProvider } from "@/lib/wallet";
import { PARKING_SESSION_MANAGER_ABI, PARK_COIN_ABI, ESCROW_SETTLEMENT_ABI } from "@/lib/abis";

async function signer() {
  const p = getProvider();
  return p.getSigner();
}

export async function reserveSlotOnChain(lotId: number, slotId: number) {
  const c = new Contract(
    CONTRACT_ADDRESSES.PARKING_SESSION_MANAGER,
    PARKING_SESSION_MANAGER_ABI as unknown as string[],
    await signer(),
  );
  const tx = await c.reserveSlot(lotId, slotId);
  return tx as { hash: string; wait: () => Promise<ContractTransactionReceipt> };
}

export function parseSessionIdFromReceipt(
  receipt: ContractTransactionReceipt | null,
): number | null {
  if (!receipt) return null;
  const iface = new Contract(
    CONTRACT_ADDRESSES.PARKING_SESSION_MANAGER,
    PARKING_SESSION_MANAGER_ABI as unknown as string[],
  ).interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "SlotReserved") {
        return Number(parsed.args.sessionId);
      }
    } catch {
      /* ignore non-matching */
    }
  }
  return null;
}

export async function parkCoin() {
  return new Contract(
    CONTRACT_ADDRESSES.PARK_COIN,
    PARK_COIN_ABI as unknown as string[],
    await signer(),
  );
}
export async function escrow() {
  return new Contract(
    CONTRACT_ADDRESSES.ESCROW_SETTLEMENT,
    ESCROW_SETTLEMENT_ABI as unknown as string[],
    await signer(),
  );
}
