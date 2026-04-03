function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportRowsToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!Array.isArray(rows) || rows.length === 0) {
    alert("Não há dados para exportar.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}