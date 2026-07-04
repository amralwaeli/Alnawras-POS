/**
 * CSV generation helpers — the single, safe place the app turns row data into a
 * downloadable CSV. Centralised so every export shares identical RFC 4180
 * quoting and spreadsheet formula-injection defence. Never re-implement CSV
 * encoding inline; call these instead.
 */

// A cell a spreadsheet could execute as a formula begins with one of these.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// A value that is purely a (optionally signed/decimal) number is safe to leave
// untouched so exported amounts stay numeric and summable in Excel/Sheets.
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;
// UTF-8 byte-order mark so Excel renders non-ASCII text (e.g. Arabic) correctly.
const BOM = '﻿';

/**
 * Encode one cell (RFC 4180) and neutralise CSV formula injection: a
 * non-numeric value starting with `= + - @` (or tab/CR) is prefixed with a
 * single quote so spreadsheets treat it as text, then the whole value is
 * wrapped in quotes with any embedded quotes doubled.
 */
export function escapeCsvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Turn a matrix of rows into RFC 4180 CSV text (CRLF line endings). */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/**
 * Build the CSV and trigger a browser download. A UTF-8 BOM is prepended so
 * Excel renders non-ASCII text (e.g. Arabic names) correctly.
 */
export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<unknown>>): void {
  const blob = new Blob([BOM + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
