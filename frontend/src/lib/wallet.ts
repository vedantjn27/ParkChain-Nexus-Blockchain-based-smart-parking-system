import { BrowserProvider, type Eip1193Provider } from "ethers";
import { AMOY_CHAIN_ID_HEX, AMOY_NETWORK } from "@/config";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export function getProvider(): BrowserProvider {
  if (!hasMetaMask()) throw new Error("MetaMask not detected");
  return new BrowserProvider(window.ethereum!);
}

export async function connectWallet(options: { forceAccountSelection?: boolean } = {}): Promise<string> {
  const provider = getProvider();
  if (options.forceAccountSelection) {
    try {
      await provider.send("wallet_requestPermissions", [{ eth_accounts: {} }]);
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 4001) throw err;
      throw new Error("Wallet account selection was cancelled");
    }
  }
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  if (!accounts.length) throw new Error("No accounts returned");
  return accounts[0];
}

export async function getChainIdHex(): Promise<string> {
  const provider = getProvider();
  const id = (await provider.send("eth_chainId", [])) as string;
  return id;
}

export async function ensureAmoy(): Promise<void> {
  const provider = getProvider();
  const current = (await provider.send("eth_chainId", [])) as string;
  if (current?.toLowerCase() === AMOY_CHAIN_ID_HEX.toLowerCase()) return;
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: AMOY_CHAIN_ID_HEX }]);
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await provider.send("wallet_addEthereumChain", [AMOY_NETWORK]);
    } else {
      throw err;
    }
  }
}

export async function signMessage(
  message: string,
): Promise<{ address: string; signature: string }> {
  const provider = getProvider();
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const signature = await signer.signMessage(message);
  return { address, signature };
}

export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
