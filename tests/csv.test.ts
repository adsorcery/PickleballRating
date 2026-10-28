import { describe, expect, it } from "vitest";
import { csvCell, parseCsv } from "@/lib/csv";

describe("csv", () => {
  it("parses quotes, escaped quotes, CRLF, BOM and embedded newlines", () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\n\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["multi\nline", "z"],
    ]);
  });
  it("rejects unterminated quotes", () => {
    expect(() => parseCsv('a,"b')).toThrow();
  });
  it("neutralises spreadsheet formulas on export", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(-3.5)).toBe("-3.5");
  });
});
