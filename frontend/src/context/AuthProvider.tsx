import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, apiJson, getJwt, setJwt } from "@/lib/api";
import { connectWallet, ensureAmoy, getChainIdHex, hasMetaMask, signMessage } from "@/lib/wallet";

interface AuthUser {
  wallet_address: string;
  display_name?: string | null;
}

interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  walletAddress: string | null;
  chainIdHex: string | null;
  jwt: string | null;
  isAuthenticated: boolean;
  metamaskAvailable: boolean;
  loginWithWallet: (displayName?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [jwt, setJwtState] = useState<string | null>(null);
  const [walletAddress, setWallet] = useState<string | null>(null);
  const [chainIdHex, setChain] = useState<string | null>(null);
  const [mmAvailable, setMmAvailable] = useState(false);

  const refresh = useCallback(async () => {
    const token = getJwt();
    setJwtState(token);
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await api<AuthUser>("/auth/me");
      setUser(me);
      if (me.wallet_address) setWallet(me.wallet_address);
    } catch {
      setJwt(null);
      setJwtState(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setMmAvailable(hasMetaMask());
    void refresh().finally(() => setReady(true));
    if (hasMetaMask()) {
      getChainIdHex()
        .then(setChain)
        .catch(() => {});
      const eth = window.ethereum!;
      const onChain = (...args: unknown[]) => setChain(args[0] as string);
      const onAccounts = (...args: unknown[]) => {
        const accs = args[0] as string[];
        setWallet(accs?.[0] ?? null);
      };
      eth.on?.("chainChanged", onChain);
      eth.on?.("accountsChanged", onAccounts);
      return () => {
        eth.removeListener?.("chainChanged", onChain);
        eth.removeListener?.("accountsChanged", onAccounts);
      };
    }
  }, [refresh]);

  const loginWithWallet = useCallback(async (displayName?: string) => {
    if (!hasMetaMask()) throw new Error("MetaMask is required");
    const addr = await connectWallet({ forceAccountSelection: true });
    setWallet(addr);
    await ensureAmoy();
    setChain(await getChainIdHex());
    const { message } = await api<{ wallet_address: string; message: string }>(
      `/auth/message/${addr}`,
      { auth: false },
    );
    const { signature } = await signMessage(message);
    const res = await apiJson<{ access_token: string; user: AuthUser }>(
      "/auth/wallet-login",
      { wallet_address: addr, message, signature, display_name: displayName ?? null },
      { auth: false },
    );
    setJwt(res.access_token);
    setJwtState(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setJwt(null);
    setJwtState(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      walletAddress,
      chainIdHex,
      jwt,
      isAuthenticated: !!jwt && !!user,
      metamaskAvailable: mmAvailable,
      loginWithWallet,
      logout,
      refresh,
    }),
    [ready, user, walletAddress, chainIdHex, jwt, mmAvailable, loginWithWallet, logout, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
