/**
 * INK's Google feed export is tab-separated with CSV-style quoting: a field holding a line break (the descriptions) comes between double
 * quotes, with inner quotes doubled. Parsed into one record per row, keyed by the header.
 */
export function parseInkTsv(text: string): { header: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === "\t") {
      record.push(field);
      field = "";
      atFieldStart = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
      field = "";
      atFieldStart = true;
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header = [], ...body] = records;
  const rows = body.map((values) => Object.fromEntries(header.map((name, i) => [name, values[i] ?? ""])));
  return { header, rows };
}

/** One TSV line. Google's TSV takes no quoting: tabs and line breaks inside a value become spaces. */
export function tsvLine(values: readonly string[]): string {
  return values.map((v) => v.replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim()).join("\t");
}
