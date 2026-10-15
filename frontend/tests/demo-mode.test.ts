import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoMode, prototypeRouteRedirect } from "@/lib/demo-mode";

const originalDemo = process.env.NEXT_PUBLIC_DEMO;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalDemo === undefined) delete process.env.NEXT_PUBLIC_DEMO;
  else process.env.NEXT_PUBLIC_DEMO = originalDemo;
});

describe("demo mode", () => {
  it("is enabled only by NEXT_PUBLIC_DEMO=1", () => {
    delete process.env.NEXT_PUBLIC_DEMO;
    expect(isDemoMode()).toBe(false);

    process.env.NEXT_PUBLIC_DEMO = "0";
    vi.stubGlobal("window", { location: { search: "?demo=1" } });
    expect(isDemoMode()).toBe(false);

    process.env.NEXT_PUBLIC_DEMO = "1";
    expect(isDemoMode()).toBe(true);
  });

  it("redirects prototype routes in non-demo production", () => {
    process.env.NEXT_PUBLIC_DEMO = "0";

    expect(prototypeRouteRedirect("/demo", true)).toBe("/");
    expect(prototypeRouteRedirect("/student/assignments/quiz-1", true)).toBe("/student");
    expect(prototypeRouteRedirect("/teacher/assignments/new", true)).toBe("/teacher");
    expect(prototypeRouteRedirect("/student/profile", true)).toBeNull();
  });

  it("keeps prototype routes available for demo E2E", () => {
    process.env.NEXT_PUBLIC_DEMO = "1";

    expect(prototypeRouteRedirect("/demo", true)).toBeNull();
    expect(prototypeRouteRedirect("/student/assignments", true)).toBeNull();
    expect(prototypeRouteRedirect("/teacher/assignments", true)).toBeNull();
  });
});
