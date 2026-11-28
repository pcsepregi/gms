/** Export letöltése: a szerver adja a fájlnevet (Content-Disposition). */
export async function downloadExport(opts: {
  format: 'xlsx' | 'csv';
  ids?: number[];
  name?: string;
}): Promise<void> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error('export failed');
  const disposition = res.headers.get('content-disposition') ?? '';
  const fileName = /filename="([^"]+)"/u.exec(disposition)?.[1] ?? `GMS-export.${opts.format}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
