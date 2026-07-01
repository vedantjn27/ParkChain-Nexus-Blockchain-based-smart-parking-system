// Minimal ABIs needed for direct MetaMask calls. Replace with full JSON from
// backend/app/chain/abis/* when integrating end-to-end. ethers will tolerate
// partial ABIs as long as the called functions/events are present.

export const PARKING_SESSION_MANAGER_ABI = [
  "function reserveSlot(uint256 lotId, uint256 slotId) returns (uint256)",
  "event SlotReserved(uint256 indexed sessionId, address indexed driver, uint256 lotId, uint256 slotId, uint256 timestamp)",
] as const;

export const PARK_COIN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;

export const ESCROW_SETTLEMENT_ABI = [
  "function depositEscrow(uint256 sessionId, address lotOwner, uint256 amount)",
  "function releaseEscrow(uint256 sessionId)",
  "function escrows(uint256 sessionId) view returns (address driver, address lotOwner, uint256 amount, uint256 exitTimestamp, bool disputed, bool released)",
  "event EscrowDeposited(uint256 indexed sessionId, address indexed driver, uint256 amount)",
  "event EscrowReleased(uint256 indexed sessionId, uint256 ownerAmount, uint256 protocolFee)",
] as const;

export const GREEN_CREDIT_TOKEN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
] as const;

export const TRUST_SCORE_SBT_ABI = [
  "function getScore(address driver) view returns (uint256)",
] as const;
