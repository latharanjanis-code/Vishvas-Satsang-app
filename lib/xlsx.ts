// Small helpers around exceljs.
import ExcelJS from "exceljs";

export async function loadWorkbook(data: ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // exceljs' typings expect a Node Buffer.
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  return wb;
}

/** Plain text of a cell, whatever exceljs stored (number, rich text, formula, hyperlink). */
export function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((p) => p.text).join("");
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

export type Range = { top: number; left: number; bottom: number; right: number };

function colNum(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function parseRange(ref: string): Range {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(ref.trim());
  if (!m) throw new Error(`Bad range ${ref}`);
  const left = colNum(m[1]);
  const top = Number(m[2]);
  const right = m[3] ? colNum(m[3]) : left;
  const bottom = m[4] ? Number(m[4]) : top;
  return { top, left, bottom, right };
}

/** Merged ranges of a sheet. */
export function mergesOf(ws: ExcelJS.Worksheet): Range[] {
  const merges = (ws.model as unknown as { merges?: string[] }).merges ?? [];
  return merges.map(parseRange);
}

/** The merged range a cell belongs to, or a 1×1 range. */
export function rangeAt(merges: Range[], row: number, col: number): Range {
  return (
    merges.find((m) => row >= m.top && row <= m.bottom && col >= m.left && col <= m.right) ?? {
      top: row,
      left: col,
      bottom: row,
      right: col,
    }
  );
}
