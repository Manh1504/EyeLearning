import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureGazeSession } from "@/lib/api/calibration";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiFetch }));

describe("saved calibration sessions", () => {
  let storage: Map<string, string>;
  const calibratedAt = "2025-01-01T00:00:00.000Z";

  beforeEach(() => {
    storage = new Map([
      ["gaze_session_id", "old-session"],
      ["gaze_calibrated_at", calibratedAt],
      ["gaze_screen_w", "1200"],
      ["gaze_screen_h", "800"],
      ["gaze_dpr", "1"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    vi.stubGlobal("window", { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1 });
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 800);
    vi.stubGlobal("fetch", vi.fn());
    apiFetch.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reuses a ready session without opening a camera or fetching a profile", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ state: "ready" }));
    expect(await ensureGazeSession("device")).toEqual({ status: "ready", calibratedAt });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each(["missing", "expired"])("restores a %s session without renewing calibration metadata", async (state) => {
    if (state === "missing") storage.delete("gaze_session_id");
    else vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    apiFetch.mockResolvedValueOnce({ calibrated: true, calibratedAt });
    apiFetch.mockResolvedValueOnce({ modelUbjBase64: "VUJK", maePx: 0.05 });
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ session_id: "restored-session" }))
      .mockResolvedValueOnce(Response.json({ status: "ready" }));

    expect(await ensureGazeSession("device")).toEqual({ status: "ready", calibratedAt });
    expect(storage.get("gaze_session_id")).toBe("restored-session");
    expect(storage.get("gaze_calibrated_at")).toBe(calibratedAt);
    expect(storage.get("gaze_screen_w")).toBe("1200");
    expect(storage.get("gaze_dpr")).toBe("1");
  });

  it("preserves the session during a temporary outage", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(await ensureGazeSession("device")).toEqual({ status: "unavailable", calibratedAt });
    expect(storage.get("gaze_session_id")).toBe("old-session");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("does not import a model into a changed screen context", async () => {
    vi.stubGlobal("window", { innerWidth: 900, innerHeight: 800, devicePixelRatio: 1 });
    expect(await ensureGazeSession("device")).toEqual({ status: "screen_changed", calibratedAt });
    expect(fetch).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each([undefined, "invalid-base64!"])("handles a malformed saved model (%s) without losing local metadata", async (modelUbjBase64) => {
    storage.delete("gaze_session_id");
    apiFetch.mockResolvedValueOnce({ calibrated: true, calibratedAt });
    apiFetch.mockResolvedValueOnce({ modelUbjBase64 });
    expect(await ensureGazeSession("device")).toEqual({ status: "unavailable", calibratedAt });
    expect(storage.get("gaze_calibrated_at")).toBe(calibratedAt);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes a missing profile from a backend outage", async () => {
    storage.delete("gaze_session_id");
    apiFetch.mockResolvedValueOnce({ calibrated: false, calibratedAt: null });
    expect(await ensureGazeSession("device")).toEqual({ status: "missing", calibratedAt: null });
    apiFetch.mockRejectedValueOnce(new Error("offline"));
    expect(await ensureGazeSession("device")).toEqual({ status: "unavailable", calibratedAt });
  });
});
