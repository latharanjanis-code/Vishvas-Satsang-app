import { db } from "./db";
import type { ParsedTemplate } from "./templates";
import type { RowKind } from "./allocation";

export async function saveTemplate(input: {
  name: string;
  slokamsPerBhakta: number;
  sourceFile: string;
  parsed: ParsedTemplate;
  kindOverrides?: Record<number, RowKind>; // sheetOrder → corrected kind
}) {
  return db.slokamTemplate.create({
    data: {
      name: input.name,
      slokamsPerBhakta: input.slokamsPerBhakta,
      sourceFile: input.sourceFile,
      rows: {
        create: input.parsed.lines.map((l) => ({
          sheetOrder: l.sheetOrder,
          section: l.section,
          fromText: l.fromText,
          toText: l.toText,
          rowKind: input.kindOverrides?.[l.sheetOrder] ?? l.rowKind,
          unitNo: l.unitNo,
          rowSpan: l.rowSpan,
          prefilledName: l.prefilledName,
        })),
      },
    },
  });
}
