import { Fragment } from 'react';
import type { ImportSummary } from '@gms/shared';
import { useHealth, useImageStatus, useImportSummary } from '../api/queries';
import { useBackupStatus, useRunBackup } from '../api/backup';
import { useToast } from '../components/Toasts';
import { downloadExport } from '../lib/download';
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

function BackupBlock() {
  const status = useBackupStatus();
  const run = useRunBackup();
  const toast = useToast();
  const s = status.data;
  const onRun = () =>
    run.mutate(undefined, {
      onSuccess: (r) => toast({ message: hu.backup.done(r.cards) }),
      onError: () => toast({ message: hu.backup.failed, tone: 'error' }),
    });
  return (
    <div className="stack" data-testid="backup-block">
      {s && !s.configured && <p className="muted">{hu.backup.notConfigured}</p>}
      {s?.configured && (
        <dl className="facts">
          <dt>{hu.backup.lastOk}</dt>
          <dd data-testid="backup-last-ok">
            {s.lastOkAt
              ? new Date(s.lastOkAt).toLocaleString('hu-HU', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : hu.backup.never}
          </dd>
          <dt>{hu.backup.target}</dt>
          <dd className="mono">{s.targetDir}</dd>
          {s.lastStatus === 'error' && (
            <>
              <dt>{hu.backup.lastError}</dt>
              <dd role="alert">{s.lastError}</dd>
            </>
          )}
        </dl>
      )}
      {s?.configured && (
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRun}
            disabled={run.isPending || s.running}
          >
            {run.isPending || s.running ? hu.backup.running : hu.backup.runNow}
          </button>
        </div>
      )}
    </div>
  );
}

function ExportBlock() {
  const toast = useToast();
  const run = (format: 'xlsx' | 'csv') =>
    downloadExport({ format }).catch(() =>
      toast({ message: hu.cards.exportFailed, tone: 'error' }),
    );
  return (
    <div className="export-buttons" role="group" aria-label={t.exportHeading}>
      <p className="muted">{t.exportIntro}</p>
      <button type="button" className="btn" onClick={() => run('xlsx')}>
        {hu.cards.exportXlsx}
      </button>
      <button type="button" className="btn" onClick={() => run('csv')}>
        {hu.cards.exportCsv}
      </button>
    </div>
  );
}

export function ImageStatusView() {
  const status = useImageStatus();
  if (status.isPending) return <p className="muted">{hu.common.loading}</p>;
  if (status.isError || !status.data) return <p role="alert">{hu.common.loadError}</p>;
  const d = status.data;
  const keys = ['exact', 'fallback', 'none', 'pending', 'error'] as const;
  return (
    <div className="stack" data-testid="image-status">
      <p className="muted">{t.imagesIntro}</p>
      <dl className="facts">
        {keys.map((k) => (
          <Fragment key={k}>
            <dt>{t.imageCounts[k]}</dt>
            <dd data-testid={`image-count-${k}`}>{d[k]}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export function SettingsPage() {
  const summary = useImportSummary();
  const health = useHealth();

  return (
    <section>
      <h1>{t.heading}</h1>
      <h2>{t.exportHeading}</h2>
      <ExportBlock />
      <h2>{t.backupHeading}</h2>
      <BackupBlock />
      <h2>{t.importHeading}</h2>
      {summary.isPending && <p className="muted">{hu.common.loading}</p>}
      {summary.isError && <p role="alert">{hu.common.loadError}</p>}
      {summary.data === null && <p>{t.notImported}</p>}
      {summary.data && <ImportSummaryView summary={summary.data} />}
      <h2>{t.imagesHeading}</h2>
      <ImageStatusView />
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
