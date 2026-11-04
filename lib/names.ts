// Name matching rules (design.md §7, spec B2/B3).
// Case is ignored and outer spaces are trimmed. Inner spaces must match exactly.

export function normaliseName(raw: string): string {
  return raw.normalize("NFC").trim().toLocaleLowerCase("en");
}

/** Display form: NFC + outer spaces trimmed, spelling and case kept. */
export function cleanName(raw: string): string {
  return raw.normalize("NFC").trim();
}

export type NameWarning = "email" | "digits" | "all-lower" | "all-caps";

/** Flags shown in the master-list import preview (design.md §6). */
export function nameWarnings(name: string): NameWarning[] {
  const w: NameWarning[] = [];
  if (name.includes("@")) w.push("email");
  else if (/\d/.test(name)) w.push("digits");
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1) {
    if (letters === letters.toLowerCase() && letters !== letters.toUpperCase()) w.push("all-lower");
    else if (letters === letters.toUpperCase() && letters !== letters.toLowerCase()) w.push("all-caps");
  }
  return w;
}

export const NOT_ON_LIST_MESSAGE =
  "This name isn't on the list for this group, so it can't be registered for this satsang. Please check the spelling or contact the coordinator.";
