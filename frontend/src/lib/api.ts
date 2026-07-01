import { API_BASE_URL } from "@/config";

const JWT_KEY = "parkchain.jwt";

export function getJwt(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(JWT_KEY);
}
export function setJwt(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(JWT_KEY, token);
  else window.localStorage.removeItem(JWT_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const h = new Headers(headers ?? {});
  if (!h.has("Content-Type") && rest.body && typeof rest.body === "string") {
    h.set("Content-Type", "application/json");
  }
  if (auth) {
    const jwt = getJwt();
    if (jwt) h.set("Authorization", `Bearer ${jwt}`);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: h });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : undefined) ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const apiJson = <T = unknown>(
  path: string,
  data: unknown,
  init: RequestInit & { auth?: boolean } = {},
) => api<T>(path, { ...init, method: init.method ?? "POST", body: JSON.stringify(data) });
