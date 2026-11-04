import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nameWarnings, normaliseName } from "@/lib/names";
import { nextSatsangTimes } from "@/lib/time";
import { previewMasterList } from "@/lib/masterList";

describe("name matching", () => {
  it("ignores case and outer spaces only", () => {
    expect(normaliseName("  Lakshmi R. ")).toBe(normaliseName("lakshmi r."));
    expect(normaliseName("Lakshmi  R.")).not.toBe(normaliseName("Lakshmi R."));
  });
  it("flags suspicious names", () => {
    expect(nameWarnings("Testbhakta81@Example.Com")).toContain("email");
    expect(nameWarnings("2 person")).toContain("digits");
    expect(nameWarnings("test bhakta j")).toContain("all-lower");
    expect(nameWarnings("TEST BHAKTA Z")).toContain("all-caps");
    expect(nameWarnings("Test Bhakta E")).toEqual([]);
  });
});

describe("weekly schedule (IST)", () => {
  const schedule = {
    satsangDay: 6, satsangTime: "19:00",
    openDay: 1, openTime: "06:00",
    closeDay: 2, closeTime: "23:59",
    publishDay: 3, publishTime: "06:00",
  };
  it("computes Mon/Tue/Wed times for the next Saturday 7 pm", () => {
    const t = nextSatsangTimes(schedule, new Date("2026-11-01T00:00:00Z")); // Sun 1 Nov
    expect(t.startsAt.toISOString()).toBe("2026-11-07T13:30:00.000Z"); // Sat 7 Nov 19:00 IST
    expect(t.opensAt.toISOString()).toBe("2026-11-02T00:30:00.000Z"); // Mon 06:00 IST
    expect(t.closesAt.toISOString()).toBe("2026-11-03T18:29:00.000Z"); // Tue 23:59 IST
    expect(t.publishAt.toISOString()).toBe("2026-11-04T00:30:00.000Z"); // Wed 06:00 IST
  });
  it("moves to the following week once the satsang has started", () => {
    const t = nextSatsangTimes(schedule, new Date("2026-11-07T13:30:00Z"));
    expect(t.startsAt.toISOString()).toBe("2026-11-14T13:30:00.000Z");
  });
});

describe("master-list import (column A only)", () => {
  it("reads the names-only fixture", async () => {
    const data = new Uint8Array(readFileSync(path.join(__dirname, "fixtures", "master-list-names.csv")));
    const p = await previewMasterList("master-list-names.csv", data);
    expect(p.rows).toHaveLength(75);
    expect(p.rows[0]).toMatchObject({ row: 2, name: "Test Bhakta A" });
    expect(p.rows.find((r) => r.name === "Test Bhakta B")).toBeTruthy(); // trailing space trimmed
    expect(p.mergedInFile).toEqual([]);
  });
  it("merges duplicates and reports blank rows that have other content", async () => {
    const csv = "Name,x\nAsha,1\nasha ,2\n,3\nRavi,4\n";
    const p = await previewMasterList("x.csv", new TextEncoder().encode(csv));
    expect(p.rows.map((r) => r.name)).toEqual(["Asha", "Ravi"]);
    expect(p.mergedInFile).toEqual([{ name: "Asha", rows: [2, 3] }]);
    expect(p.blankRows).toEqual([4]);
  });
});
