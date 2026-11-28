import { useState } from 'react';
import { Link } from 'react-router';
import {
  DEFAULT_QUERY,
  queryToParams,
  type CardQuery,
  type ClosestGroup,
  type StatGroup,
} from '@gms/shared';
import { useStats } from '../api/queries';
import { CardImage } from '../components/CardImage';
import { hu } from '../i18n/hu';

const SETS_COLLAPSED = 10;

/** A csoport hiányzó lapjaira szűrt lista (S-33). */
function missingLink(filter: Partial<CardQuery>): string {
  const params = queryToParams({ ...DEFAULT_QUERY, owned: 'missing', ...filter });
  return `/kartyak?${params.toString()}`;
}

const percent = (owned: number, all: number) => (all === 0 ? 0 : Math.round((owned / all) * 100));

function Bar({ owned, all }: { owned: number; all: number }) {
  const p = all === 0 ? 0 : (owned / all) * 100;
  return (
    <span className="bar" aria-hidden="true">
      <span className="bar-fill" style={{ width: `${p}%` }} />
    </span>
  );
}

function BarList({
  groups,
  filter,
}: {
  groups: readonly StatGroup[];
  filter: (g: StatGroup) => Partial<CardQuery>;
}) {
  const t = hu.home;
  return (
    <ul className="bar-list">
      {groups.map((g) => (
        <li key={g.key}>
          <Link className="bar-row" to={missingLink(filter(g))} data-complete={g.owned === g.all}>
            <span className="bar-name">{g.label}</span>
            <span className="bar-count num">
              {g.owned} / {g.all}
            </span>
            <span className="bar-percent num">{t.percent(percent(g.owned, g.all))}</span>
            <Bar owned={g.owned} all={g.all} />
            <span className="sr-only">{t.openMissing}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function closestFilter(g: ClosestGroup): Partial<CardQuery> {
  return g.kind === 'language' ? { languages: [g.key] } : { sets: [g.key] };
}

export function HomePage() {
  const stats = useStats();
  const [allSets, setAllSets] = useState(false);
  const t = hu.home;
  const s = stats.data;

  return (
    <section className="dashboard">
      <h1>{t.heading}</h1>
      {stats.isPending && <p className="muted">{hu.common.loading}</p>}
      {stats.isError && <p role="alert">{hu.common.loadError}</p>}
      {s && s.total.all === 0 && <p>{t.empty}</p>}
      {s && s.total.all > 0 && (
        <>
          <div className="hero" data-testid="hero">
            <div>
              <p className="hero-label">{t.progress(s.total.owned, s.total.all)}</p>
              <p className="hero-figure num" aria-hidden="true">
                <span data-testid="hero-owned">{s.total.owned}</span>
                <span className="hero-all"> / {s.total.all}</span>
              </p>
              <p className="muted hero-sub">
                {t.missingCount(s.total.all - s.total.owned)}
                {' · '}
                <Link to="/kartyak">{t.toList}</Link>
              </p>
            </div>
            <div className="hero-side">
              <p className="hero-percent num" data-testid="hero-percent">
                {t.percent(percent(s.total.owned, s.total.all))}
              </p>
              <Bar owned={s.total.owned} all={s.total.all} />
            </div>
          </div>

          <div className="dash-grid">
            <section className="dash-card dash-wide" aria-labelledby="dash-lang">
              <h2 id="dash-lang">{t.languages}</h2>
              <BarList groups={s.byLanguage} filter={(g) => ({ languages: [g.key] })} />
            </section>

            <section className="dash-card" aria-labelledby="dash-closest">
              <h2 id="dash-closest">{t.closest}</h2>
              {s.closest.length === 0 ? (
                <p className="muted">{t.closestNone}</p>
              ) : (
                <ul className="closest-list">
                  {s.closest.map((g) => (
                    <li key={`${g.kind}:${g.key}`}>
                      <Link className="closest-item" to={missingLink(closestFilter(g))}>
                        <span>{t.closestItem(g.label, g.missing)}</span>
                        <span className="muted small">
                          {g.kind === 'set' ? t.closestSet : t.closestLanguage}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dash-card" aria-labelledby="dash-pokemon">
              <h2 id="dash-pokemon">{t.pokemon}</h2>
              <BarList groups={s.byPokemon} filter={(g) => ({ pokemon: [g.key] })} />
            </section>

            <section className="dash-card" aria-labelledby="dash-finish">
              <h2 id="dash-finish">{t.finishes}</h2>
              <BarList groups={s.byFinish} filter={(g) => ({ finishes: [g.key] })} />
            </section>

            <section className="dash-card dash-wide" aria-labelledby="dash-sets">
              <h2 id="dash-sets">{t.sets}</h2>
              <p className="muted small">{t.setsHint(s.bySet.length)}</p>
              <BarList
                groups={allSets ? s.bySet : s.bySet.slice(0, SETS_COLLAPSED)}
                filter={(g) => ({ sets: [g.key] })}
              />
              {s.bySet.length > SETS_COLLAPSED && (
                <button type="button" className="btn" onClick={() => setAllSets(!allSets)}>
                  {allSets ? t.setsLess : t.setsMore(s.bySet.length)}
                </button>
              )}
            </section>

            <section className="dash-card dash-wide" aria-labelledby="dash-recent">
              <h2 id="dash-recent">{t.recent}</h2>
              {s.recent.length === 0 ? (
                <p className="muted">{t.recentNone}</p>
              ) : (
                <ul className="recent-list">
                  {s.recent.map((c) => (
                    <li key={c.id}>
                      <Link to={`/kartyak/${c.id}`} className="recent-item" title={c.displayId}>
                        <CardImage card={c} />
                        <span className="small">{c.language.shortCode}</span>
                        <span className="sr-only">{c.displayId}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
