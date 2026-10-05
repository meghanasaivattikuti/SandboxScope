export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 10_000;
export const MAX_COLUMNS = 50;

export type ColumnType = "number" | "date" | "boolean" | "text";

export type Dataset = {
  name: string;
  size: number;
  rows: number;
  columns: number;
  headers: string[];
  types: ColumnType[];
  preview: string[][];
  source: "sample" | "upload";
  content: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) throw new Error("A quote appears inside an unquoted field.");
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function inferType(values: string[]): ColumnType {
  const populated = values.filter(Boolean).slice(0, 100);
  if (populated.length === 0) return "text";
  if (populated.every((value) => Number.isFinite(Number(value)))) return "number";
  if (populated.every((value) => /^(true|false)$/i.test(value))) return "boolean";
  if (populated.every((value) => /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(value) && !Number.isNaN(Date.parse(value)))) return "date";
  return "text";
}

export function validateCsv(
  text: string,
  name: string,
  size: number,
  source: Dataset["source"],
): Dataset {
  if (size > MAX_FILE_BYTES) throw new Error("CSV files must be 2 MB or smaller.");
  if (!text.trim()) throw new Error("The selected CSV is empty.");
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error("The CSV needs a header and at least one data row.");

  const headers = parsed[0].map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim(),
  );
  if (headers.some((header) => !header)) throw new Error("Every column needs a header name.");
  if (headers.length > MAX_COLUMNS) throw new Error(`CSV files can contain at most ${MAX_COLUMNS} columns.`);

  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) throw new Error("Column names must be unique.");

  const dataRows = parsed.slice(1);
  if (dataRows.length > MAX_ROWS) throw new Error(`CSV files can contain at most ${MAX_ROWS.toLocaleString()} rows.`);
  const invalidRow = dataRows.findIndex((values) => values.length !== headers.length);
  if (invalidRow >= 0) throw new Error(`Row ${invalidRow + 2} has a different number of columns than the header.`);

  return {
    name,
    size,
    rows: dataRows.length,
    columns: headers.length,
    headers,
    types: headers.map((_, column) => inferType(dataRows.map((values) => values[column]))),
    preview: dataRows.slice(0, 3),
    source,
    content: text,
  };
}
