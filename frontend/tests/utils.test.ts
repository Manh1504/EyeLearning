import { describe, it, expect } from "vitest";
import { cn, formatShortDate, initialsOf } from "@/lib/utils";

describe("cn", () => {
  it("gộp class và loại bỏ trùng lặp tailwind", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", undefined, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("formatShortDate", () => {
  it("định dạng ISO thành DD/MM/YYYY", () => {
    expect(formatShortDate("2026-03-05T00:00:00Z")).toMatch(/0[56]\/03\/2026/);
  });

  it("trả chuỗi gốc khi không parse được", () => {
    expect(formatShortDate("không-phải-ngày")).toBe("không-phải-ngày");
  });

  it("trả rỗng khi giá trị rỗng", () => {
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate(undefined)).toBe("");
  });
});

describe("initialsOf", () => {
  it("lấy 2 ký tự đầu khi một từ", () => {
    expect(initialsOf("An")).toBe("AN");
  });

  it("lấy chữ đầu và chữ cuối khi nhiều từ", () => {
    expect(initialsOf("Nguyễn Văn An")).toBe("NA");
  });

  it("trả ? khi rỗng", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });
});
