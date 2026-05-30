import { describe, it, expect, beforeEach } from "vitest";
import {
  getSession,
  setSession,
  clearSession,
  cleanupExpiredSessions,
} from "@/lib/session";

const T = "tenant-1";
const P = "628111111111";

beforeEach(() => {
  clearSession(T, P);
  clearSession(T, "628222222222");
});

describe("getSession", () => {
  it("returns idle session for new customer", () => {
    const s = getSession(T, P);
    expect(s.state).toBe("idle");
    expect(s.retry_count).toBe(0);
  });

  it("returns same session if not expired", () => {
    setSession(T, P, { state: "awaiting_confirmation" });
    expect(getSession(T, P).state).toBe("awaiting_confirmation");
  });
});

describe("setSession", () => {
  it("updates state and preserves other fields", () => {
    setSession(T, P, { state: "awaiting_confirmation", retry_count: 1 });
    setSession(T, P, { state: "idle" });
    const s = getSession(T, P);
    expect(s.state).toBe("idle");
    expect(s.retry_count).toBe(1);
  });
});

describe("clearSession", () => {
  it("resets to idle after clear", () => {
    setSession(T, P, { state: "awaiting_payment" });
    clearSession(T, P);
    expect(getSession(T, P).state).toBe("idle");
  });
});

describe("cleanupExpiredSessions", () => {
  it("removes expired sessions", () => {
    // Paksa last_updated ke 31 menit yang lalu agar dianggap expired
    setSession(T, P, { last_updated: Date.now() - 31 * 60 * 1000 } as any);
    setSession(T, "628222222222", { state: "idle" }); // masih fresh
    expect(cleanupExpiredSessions()).toBe(1);
  });
});
