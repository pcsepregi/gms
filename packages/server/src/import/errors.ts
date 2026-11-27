export type ImportErrorCode =
  'NOT_EMPTY' | 'FILE' | 'SHEET_MISSING' | 'HEADER_MISSING' | 'COLUMN_MISSING' | 'ROWS';

/** Az import hibája. Ilyenkor egyetlen kártya sem kerül az adatbázisba. */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly rowErrors: string[] = [],
  ) {
    super(
      rowErrors.length ? `${message}\n${rowErrors.map((e) => `  - ${e}`).join('\n')}` : message,
    );
  }
}
