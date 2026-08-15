/** A CSV column: a header label and how to pull its cell value from a row. */
export type CsvColumn<T> = { label: string; value: (row: T) => string | number | null | undefined };

/** UTF-8 byte-order mark; prepended so Excel opens the file as UTF-8. */
const BOM = "﻿";

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Quote when the cell contains a comma, quote, or newline; double inner quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(",")).join("\n");
  return `${BOM}${header}\n${body}`;
}

/** Trigger a client-side download of `content` as a file. Browser-only. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
