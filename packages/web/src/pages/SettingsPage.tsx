import type { ImportSummary } from '@gms/shared';
import { useHealth, useImportSummary } from '../api/queries';
import { FinishDictionary } from '../components/FinishDictionary';
import { hu } from '../i18n/hu';

const t = hu.settings;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ImportSummaryView({ summary }: { summary: ImportSummary }) {
  return (
    <div className="stack" data-testid="import-summary">
      <dl className="facts">
        <dt>{t.total}</dt>
        <dd data-testid="summary-total">{summary.total}</dd>
        <dt>{t.owned}</dt>
        <dd data-testid="summary-owned">{summary.owned}</dd>
        <dt>{t.missing}</dt>
        <dd data-testid="summary-missing">{summary.missing}</dd>
        <dt>{t.needsCheck}</dt>
        <dd>{summary.needsCheck}</dd>
        <dt>{t.importedAt}</dt>
        <dd>{formatDate(summary.importedAt)}</dd>
        <dt>{t.sourceFile}</dt>
        <dd>{summary.sourceFile}</dd>
      </dl>

      <h3>{t.byLanguage}</h3>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">{t.language}</th>
            <th scope="col" className="num">
              {t.ownedOfAll}
            </th>
          </tr>
        </thead>
        <tbody>
          {summary.byLanguage.map((l) => (
            <tr key={l.shortCode}>
              <td>{l.nameHu}</td>
              <td className="num">
                {l.owned} / {l.all}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        {t.finishesFromDictionary}: {summary.finishesFromDictionary}
      </p>
      <p>
        {t.newFinishes}: {summary.newFinishes.length ? summary.newFinishes.join(', ') : t.none}
      </p>

      {summary.warnings.length > 0 && (
        <details>
          <summary>
            {t.warnings} ({summary.warnings.length})
          </summary>
          <ul>
            {summary.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SettingsPage() {
  const summary = useImportSummary();
  const health = useHealth();

  return (
    <section>
      <h1>{t.heading}</h1>
      <h2>{t.importHeading}</h2>
      {summary.isPending && <p className="muted">{hu.common.loading}</p>}
      {summary.isError && <p role="alert">{hu.common.loadError}</p>}
      {summary.data === null && <p>{t.notImported}</p>}
      {summary.data && <ImportSummaryView summary={summary.data} />}
      <h2>{t.finishesHeading}</h2>
      <FinishDictionary />
      {health.data && (
        <p className="muted">
          {t.version}: {health.data.version}
        </p>
      )}
    </section>
  );
}
