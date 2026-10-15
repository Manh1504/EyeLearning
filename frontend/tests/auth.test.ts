import { describe, expect, it } from "vitest";
import { primaryRole } from "@/lib/api/auth";

describe("primaryRole", () => {
  it("uses the legacy teacher, student, admin priority", () => {
    expect(primaryRole(["admin", "student", "teacher"])).toBe("teacher");
    expect(primaryRole(["admin", "student"])).toBe("student");
    expect(primaryRole(["admin"])).toBe("admin");
  });

  it("defaults safely when roles are absent", () => {
    expect(primaryRole([])).toBe("student");
    expect(primaryRole(undefined)).toBe("student");
  });
});
