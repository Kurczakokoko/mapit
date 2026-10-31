import { describe, expect, it } from "vitest";
import {
  findProvinceIdGaps,
  parseDefinitionCsv,
  writeDefinitionCsv,
} from "../../src/pdx/definition.ts";

const SAMPLE = [
  "0;0;0;0;land;false;unknown;0",
  "1;230;81;119;lake;false;lakes;7",
  "2;0;0;55;land;false;forest;1",
].join("\n");

describe("definition.csv", () => {
  it("parses semicolon rows including province 0", () => {
    const defs = parseDefinitionCsv(SAMPLE);
    expect(defs).toHaveLength(3);
    expect(defs[0]).toEqual({
      id: 0,
      r: 0,
      g: 0,
      b: 0,
      type: "land",
      coastal: false,
      terrain: "unknown",
      continent: 0,
    });
    expect(defs[1]?.type).toBe("lake");
    expect(defs[1]?.terrain).toBe("lakes");
  });

  it("accepts CRLF and writes CRLF", () => {
    const defs = parseDefinitionCsv(SAMPLE.replaceAll("\n", "\r\n") + "\r\n");
    const out = writeDefinitionCsv(defs);
    expect(out.endsWith("\r\n")).toBe(true);
    expect(out).toContain("\r\n");
    expect(out.split("\r\n")[0]).toBe("0;0;0;0;land;false;unknown;0");
  });

  it("reports gaps after province 0", () => {
    const defs = parseDefinitionCsv(
      ["0;0;0;0;land;false;unknown;0", "1;1;1;1;land;false;plains;1", "3;3;3;3;land;false;plains;1"].join("\n"),
    );
    expect(findProvinceIdGaps(defs)).toEqual([2]);
  });
});
