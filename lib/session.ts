// WA Session State
import type { Session } from "@/lib/types";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 menit

const store = new Map<string, Session>();

function sessionKey(tenantId: string, customerPhone: string): string {
  return `${tenantId}:${customerPhone}`;
}

export function getSession(tenantId: string, customerPhone: string): Session {
  const key = sessionKey(tenantId, customerPhone);
  const existing = store.get(key);

  if (existing && Date.now() - existing.last_updated < SESSION_TTL_MS) {
    return existing;
  }

  // Expired atau belum ada — kembalikan session idle baru
  const fresh: Session = {
    state: "idle",
    retry_count: 0,
    last_updated: Date.now(),
  };
  store.set(key, fresh);
  return fresh;
}

export function setSession(
  tenantId: string,
  customerPhone: string,
  update: Partial<Session>
): Session {
  const current = getSession(tenantId, customerPhone);
  const updated: Session = {
    ...current,
    last_updated: Date.now(),
    ...update,
  };
  store.set(sessionKey(tenantId, customerPhone), updated);
  return updated;
}

export function clearSession(tenantId: string, customerPhone: string): void {
  store.delete(sessionKey(tenantId, customerPhone));
}

// Panggil periodik (misal di webhook handler) untuk cegah memory leak
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let removed = 0;
  for (const [key, session] of store) {
    if (now - session.last_updated >= SESSION_TTL_MS) {
      store.delete(key);
      removed++;
    }
  }
  return removed;
}

// Hanya untuk testing
export function _getStoreSize(): number {
  return store.size;
}
