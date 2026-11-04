// Master-list import (design.md §6, spec A2). Column A is the master copy and the only column read.
import { cellText, loadWorkbook } from "./xlsx";
import { cleanName, nameWarnings, normaliseName, type NameWarning } from "./names";

export type ImportRow = { row: number; name: string; warnings: NameWarning[] };
export type ImportPreview = {
  rows: ImportRow[]; // unique names in file order
  blankRows: number[]; // rows where column A is empty but the row has other content
  mergedInFile: { name: string; rows: number[] }[]; // duplicates within the file, kept once
};

/** First field of each CSV line (handles quotes). Other fields are never looked at. */
function csvColumnA(text: string): { cells: string[]; rowHasOther: boolean[] } {
  const cells: string[] = [];
  const rowHasOther: boolean[] = [];
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    let first = "";
    let rest = "";
    if (line.startsWith('"')) {
      let i = 1;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          first += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else first += line[i++];
      }
      rest = line.slice(i + 1);
    } else {
      const comma = line.indexOf(",");
      first = comma === -1 ? line : line.slice(0, comma);
      rest = comma === -1 ? "" : line.slice(comma + 1);
    }
    cells.push(first);
    rowHasOther.push(rest.replace(/[",\s]/g, "").length > 0);
  }
  return { cells, rowHasOther };
}

async function readColumnA(fileName: string, data: ArrayBuffer | Uint8Array) {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return csvColumnA(new TextDecoder().decode(data));
  }
  const wb = await loadWorkbook(data);
  const ws = wb.worksheets[0];
  const cells: string[] = [];
  const rowHasOther: boolean[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    cells.push(cellText(row.getCell(1)));
    let other = false;
    row.eachCell((cell, col) => {
      if (col > 1 && cellText(cell).trim()) other = true;
    });
    rowHasOther.push(other);
  }
  return { cells, rowHasOther };
}

export async function previewMasterList(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ImportPreview> {
  const { cells, rowHasOther } = await readColumnA(fileName, data);
  const rows: ImportRow[] = [];
  const blankRows: number[] = [];
  const firstRowOf = new Map<string, number>();
  const dupRows = new Map<string, number[]>();

  cells.forEach((raw, i) => {
    const rowNo = i + 1;
    const name = cleanName(raw);
    // Row 1 is a header when it is blank or says "Name".
    if (rowNo === 1 && (!name || normaliseName(name) === "name")) return;
    if (!name) {
      if (rowHasOther[i]) blankRows.push(rowNo);
      return;
    }
    const key = normaliseName(name);
    const first = firstRowOf.get(key);
    if (first !== undefined) {
      const list = dupRows.get(key) ?? [first];
      list.push(rowNo);
      dupRows.set(key, list);
      return;
    }
    firstRowOf.set(key, rowNo);
    rows.push({ row: rowNo, name, warnings: nameWarnings(name) });
  });

  const mergedInFile = [...dupRows.entries()].map(([key, rws]) => ({
    name: rows.find((r) => normaliseName(r.name) === key)!.name,
    rows: rws,
  }));
  return { rows, blankRows, mergedInFile };
}
