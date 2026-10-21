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

  it("only redirects the demo route in non-demo production", () => {
    process.env.NEXT_PUBLIC_DEMO = "0";

    expect(prototypeRouteRedirect("/demo", true)).toBe("/");
    expect(prototypeRouteRedirect("/student/courses/course-1", true)).toBeNull();
    expect(prototypeRouteRedirect("/teacher/courses/course-1", true)).toBeNull();
    expect(prototypeRouteRedirect("/student/profile", true)).toBeNull();
  });

  it("keeps prototype routes available for demo E2E", () => {
    process.env.NEXT_PUBLIC_DEMO = "1";

    expect(prototypeRouteRedirect("/demo", true)).toBeNull();
    expect(prototypeRouteRedirect("/student/courses/course-1", true)).toBeNull();
    expect(prototypeRouteRedirect("/teacher/courses/course-1", true)).toBeNull();
  });
});
