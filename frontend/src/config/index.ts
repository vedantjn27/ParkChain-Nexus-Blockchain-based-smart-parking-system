export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? "ws://localhost:8000/ws/chain-feed";

export const AMOY_CHAIN_ID_DECIMAL = 80002;
export const AMOY_CHAIN_ID_HEX = "0x13882";

export const AMOY_NETWORK = {
  chainId: AMOY_CHAIN_ID_HEX,
  chainName: "Polygon Amoy",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: ["https://rpc-amoy.polygon.technology"],
  blockExplorerUrls: ["https://amoy.polygonscan.com"],
} as const;

export const CONTRACT_ADDRESSES = {
  PARK_COIN: "0x5E4f7B38Ea510FcEF6ADA487f804cfB373695d88",
  PARKING_SESSION_MANAGER: "0xaB8EB34510c7cFE1981E7Ef15E8a2464b9cB8F0C",
  TRUST_SCORE_SBT: "0x90b47C91d7bce58f7D9627c9689231854ACdd604",
  ESCROW_SETTLEMENT: "0x842535c9A70c7E7B6799C57E1a6CeDACd24C6F4f",
  GREEN_CREDIT_TOKEN: "0x01E2A0f0e29357E3b854D694b3Dd4E600f315Ebd",
} as const;

export const POLYGONSCAN_TX = (hash: string) => `https://amoy.polygonscan.com/tx/${hash}`;
export const POLYGONSCAN_ADDR = (addr: string) => `https://amoy.polygonscan.com/address/${addr}`;
