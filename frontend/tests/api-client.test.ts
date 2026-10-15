import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api/client";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes keepalive to fetch while retaining JSON request headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/learning-sessions/session-1", {
      method: "PATCH",
      body: { status: "completed" },
      keepalive: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/learning-sessions/session-1",
      expect.objectContaining({
        method: "PATCH",
        keepalive: true,
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });
});
