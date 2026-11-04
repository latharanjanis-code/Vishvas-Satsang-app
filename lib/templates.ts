// Template reader (design.md §6). Reads columns A–E of one sheet of an allocation workbook.
// A filled-in past allocation can be uploaded as is: names are dropped, fixed names (VISVAS) kept.
import type ExcelJS from "exceljs";
import { cellText, loadWorkbook, mergesOf, rangeAt } from "./xlsx";
import type { RowKind } from "./allocation";

export const PRAYER_SECTIONS = ["opening prayer", "pledge", "closing prayer"];
const HEADINGS = ["shlokas", "from", "to", "allocated to", "backup"];

export type ParsedLine = {
  sheetOrder: number;
  sheetRow: number;
  section: string;
  fromText: string | null;
  toText: string | null;
  rowKind: RowKind;
  unitNo: number;
  rowSpan: number;
  prefilledName: string | null;
};

export type ParsedTemplate = {
  sheetName: string;
  headerLines: string[];
  lines: ParsedLine[];
  /** True when most "Allocated to" cells held names, i.e. a past allocation was uploaded. */
  wasFilled: boolean;
  fillUnits: number;
};

export class TemplateError extends Error {}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export async function listSheets(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  const wb = await loadWorkbook(data);
  return wb.worksheets.map((w) => w.name);
}

export async function parseTemplate(
  data: ArrayBuffer | Uint8Array,
  opts: { sheetName?: string; fixedNames: string[] },
): Promise<ParsedTemplate> {
  const wb = await loadWorkbook(data);
  const ws = opts.sheetName ? wb.getWorksheet(opts.sheetName) : wb.worksheets[0];
  if (!ws) throw new TemplateError(`Sheet "${opts.sheetName}" not found.`);
  return parseSheet(ws, opts.fixedNames);
}

export function parseSheet(ws: ExcelJS.Worksheet, fixedNames: string[]): ParsedTemplate {
  const fixed = new Set(fixedNames.map(norm));
  const merges = mergesOf(ws);
  const text = (r: number, c: number) => {
    const m = rangeAt(merges, r, c);
    return cellText(ws.getCell(m.top, m.left)).trim();
  };

  const headings = [1, 2, 3, 4, 5].map((c) => norm(cellText(ws.getCell(4, c))));
  const ok = headings.every((h, i) => h === HEADINGS[i] || (i === 4 && h === "back up"));
  if (!ok) {
    throw new TemplateError(
      `Row 4 must read "Shlokas · From · To · Allocated to · Backup" in columns A–E. Found: "${headings.join(" · ")}".`,
    );
  }
  const headerLines = [1, 2, 3].map((r) => text(r, 2) || text(r, 1));

  const lines: ParsedLine[] = [];
  const unitKeys = new Map<string, number>();
  let section = "";
  let filledCells = 0;
  let nameCells = 0;
  const seenNameCells = new Set<string>();
  const lastRow = ws.rowCount;

  for (let r = 5; r <= lastRow; r++) {
    const aRange = rangeAt(merges, r, 1);
    const bRange = rangeAt(merges, r, 2);
    // Skip the lower physical rows of a line that spans several rows (e.g. A8:A9).
    if (aRange.top !== r && bRange.top !== r) continue;

    const a = text(r, 1);
    const from = bRange.top === r ? text(r, 2) : "";
    const to = rangeAt(merges, r, 3).left === 3 && rangeAt(merges, r, 3).top === r ? text(r, 3) : "";
    if (!a && !from && !to) continue;
    if (a) section = a;
    if (!section) continue;

    const dRange = rangeAt(merges, r, 4);
    const unitKey = `${dRange.top}:${dRange.left}`;
    if (!unitKeys.has(unitKey)) unitKeys.set(unitKey, unitKeys.size + 1);
    const unitNo = unitKeys.get(unitKey)!;
    const dText = text(r, 4);

    const prayer = PRAYER_SECTIONS.includes(norm(section)) || (bRange.left === 2 && bRange.right >= 4);
    const rowSpan = Math.max(aRange.bottom - r + 1, bRange.bottom - r + 1, 1);

    let rowKind: RowKind;
    let prefilledName: string | null = null;
    if (!prayer && dText && fixed.has(norm(dText))) {
      rowKind = "PREFILLED";
      prefilledName = dText;
    } else if (prayer) {
      rowKind = "SINGLE_PRAYER";
    } else if (/^\d+$/.test(from) && /^\d+$/.test(to)) {
      rowKind = "BLOCK";
    } else {
      rowKind = "NAMED_PART";
    }

    // Track how full the sheet is (one count per "Allocated to" cell).
    if (rowKind !== "PREFILLED" && !seenNameCells.has(unitKey)) {
      seenNameCells.add(unitKey);
      nameCells++;
      if (prayer ? from : dText) filledCells++;
    }

    lines.push({
      sheetOrder: lines.length + 1,
      sheetRow: r,
      section,
      fromText: prayer ? null : from || null,
      toText: prayer ? null : to || null,
      rowKind,
      unitNo,
      rowSpan,
      prefilledName,
    });

    if (norm(section) === "closing prayer") break;
  }

  if (lines.length === 0) throw new TemplateError("No slokam rows found below row 4.");

  // A unit takes its kind from its "Allocated to" cell: if that is a fixed name, every line in it is pre-filled.
  const prefilledUnits = new Map(lines.filter((l) => l.rowKind === "PREFILLED").map((l) => [l.unitNo, l.prefilledName]));
  for (const l of lines) {
    if (prefilledUnits.has(l.unitNo)) {
      l.rowKind = "PREFILLED";
      l.prefilledName = prefilledUnits.get(l.unitNo) ?? null;
    }
  }

  const fillUnits = new Set(lines.filter((l) => l.rowKind !== "PREFILLED").map((l) => l.unitNo)).size;
  return { sheetName: ws.name, headerLines, lines, wasFilled: nameCells > 0 && filledCells / nameCells > 0.5, fillUnits };
}
