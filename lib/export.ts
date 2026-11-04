// XLSX download in the template's layout (spec A11/B8, design.md §8).
import ExcelJS from "exceljs";
import type { Grid } from "./gridCore";

const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

export async function gridToXlsx(grid: Grid): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Satsang Chart");
  ws.columns = [{ width: 18 }, { width: 14 }, { width: 8 }, { width: 30 }, { width: 26 }];

  grid.headerLines.forEach((text, i) => {
    const r = i + 1;
    ws.mergeCells(r, 2, r, 4);
    const c = ws.getCell(r, 2);
    c.value = text;
    c.font = { bold: true, size: 12 };
    c.alignment = { horizontal: "center" };
  });
  const headings = ["Shlokas", "From", "To", "Allocated to", "Backup"];
  headings.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.border = thin;
    c.alignment = { horizontal: "center" };
  });

  // Physical start row of each line.
  const start: number[] = [];
  let r = 5;
  for (const line of grid.lines) {
    start.push(r);
    r += line.rowSpan;
  }
  const endOf = (i: number) => start[i] + grid.lines[i].rowSpan - 1;
  const merge = (t: number, l: number, b: number, rt: number) => {
    if (b > t || rt > l) ws.mergeCells(t, l, b, rt);
  };
  const num = (s: string | null) => (s && /^\d+$/.test(s) ? Number(s) : (s ?? ""));

  grid.lines.forEach((line, i) => {
    const top = start[i];
    const bottom = endOf(i);
    merge(top, 1, bottom, 1);
    ws.getCell(top, 1).value = line.section;

    if (line.rowKind === "SINGLE_PRAYER") {
      merge(top, 2, bottom, 4);
      ws.getCell(top, 2).value = line.allocated;
    } else {
      if (line.rowKind === "NAMED_PART" && !line.toText) {
        merge(top, 2, bottom, 3);
        ws.getCell(top, 2).value = line.fromText ?? "";
      } else {
        merge(top, 2, bottom, 2);
        merge(top, 3, bottom, 3);
        ws.getCell(top, 2).value = num(line.fromText);
        ws.getCell(top, 3).value = num(line.toText);
      }
      if (line.unitSpan > 0) {
        merge(top, 4, endOf(i + line.unitSpan - 1), 4);
        ws.getCell(top, 4).value = line.allocated;
      }
    }
    if (line.backupSpan > 0) {
      merge(top, 5, endOf(i + line.backupSpan - 1), 5);
      ws.getCell(top, 5).value = line.backup;
    }
  });

  for (let row = 5; row < r; row++) {
    for (let col = 1; col <= 5; col++) {
      const c = ws.getCell(row, col);
      c.border = thin;
      c.alignment = { vertical: "middle", horizontal: col === 2 || col === 3 ? "center" : "left", wrapText: true };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
