import { describe, expect, it } from "vitest";
import { primaryRole } from "@/lib/api/auth";

describe("primaryRole", () => {
  it("prioritizes admin regardless of other roles", () => {
    expect(primaryRole(["admin", "student", "teacher"])).toBe("admin");
    expect(primaryRole(["admin", "student"])).toBe("admin");
    expect(primaryRole(["teacher", "admin"])).toBe("admin");
    expect(primaryRole(["admin"])).toBe("admin");
    expect(primaryRole(["student", "teacher"])).toBe("teacher");
  });

  it("defaults safely when roles are absent", () => {
    expect(primaryRole([])).toBe("student");
    expect(primaryRole(undefined)).toBe("student");
  });
});
