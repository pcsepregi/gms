import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  hasActiveFilters,
  queryCards,
  type Card,
  type CardQuery,
  type ImageFilter,
  type OwnedFilter,
  type SortKey,
} from '@gms/shared';
import { useCards } from '../api/queries';
import { CardDetails } from '../components/CardDetails';
import { CardGrid } from '../components/CardGrid';
import { CardTable } from '../components/CardTable';
import { FilterMenu, type FilterOption } from '../components/FilterMenu';
import { CloseIcon, GridIcon, ListIcon, SearchIcon, SortIcon } from '../components/icons';
import { useCardQuery } from '../hooks/useCardQuery';
import { useOwnedToggle } from '../hooks/useOwnedToggle';
import { useViewMode } from '../hooks/useViewMode';
import { hu } from '../i18n/hu';

const t = hu.cards;
const SORT_KEYS: SortKey[] = ['set', 'number', 'language', 'pokemon', 'updated'];
const OWNED: OwnedFilter[] = ['all', 'owned', 'missing'];
const IMAGE: ImageFilter[] = ['fallback', 'none'];

function countBy<T>(items: readonly Card[], key: (c: Card) => T) {
  const m = new Map<T, number>();
  for (const c of items) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
  return m;
}

function textOptions(cards: readonly Card[], key: (c: Card) => string): FilterOption[] {
  return [...countBy(cards, key)]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, 'hu'));
}

/** Az adatokból képzett szűrőértékek (nincs beégetett Pokémon-név, K-10). */
function useOptions(cards: readonly Card[]) {
  return useMemo(() => {
    const langs = new Map<string, { label: string; order: number; count: number }>();
    for (const c of cards) {
      const l = langs.get(c.language.shortCode);
      if (l) l.count++;
      else
        langs.set(c.language.shortCode, {
          label: c.language.nameHu,
          order: c.language.sortOrder,
          count: 1,
        });
    }
    const imageCounts = countBy(cards, (c) => c.image.status);
    return {
      pokemon: textOptions(cards, (c) => c.pokemon),
      sets: textOptions(cards, (c) => c.setName),
      finishes: textOptions(cards, (c) => c.finish.name),
      languages: [...langs]
        .sort((a, b) => a[1].order - b[1].order)
        .map(([value, l]) => ({ value, label: l.label, count: l.count })),
      image: IMAGE.map((v) => ({ value: v, label: t.image[v], count: imageCounts.get(v) ?? 0 })),
      languageName: new Map([...langs].map(([k, v]) => [k, v.label])),
    };
  }, [cards]);
}

interface Chip {
  key: string;
  label: string;
  remove: Partial<CardQuery>;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function CardsPage() {
  const cardsQuery = useCards();
  const allCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);
  const { query, params, update, clear } = useCardQuery();
  const [view, setView] = useViewMode();
  const toggle = useOwnedToggle();
  const navigate = useNavigate();
  const { id } = useParams();
  const options = useOptions(allCards);

  // Keresőmező: helyi állapot, az URL-be azonnal (cserével) kerül, így nem
  // keletkezik minden leütésre új előzménybejegyzés; a szűrés késleltetett értékkel fut.
  const [text, setText] = useState(query.q);
  const written = useRef(query.q);
  useEffect(() => {
    if (query.q !== written.current) {
      written.current = query.q;
      setText(query.q);
    }
  }, [query.q]);
  const changeText = (value: string) => {
    setText(value);
    written.current = value;
    update({ q: value }, { replace: query.q !== '' && value !== '' });
  };
  const deferredText = useDeferredValue(text);

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const shown = useMemo(
    () => queryCards(allCards, { ...query, q: deferredText }),
    [allCards, query, deferredText],
  );
  const missing = useMemo(() => shown.filter((c) => !c.owned).length, [shown]);

  const linkSearch = params.toString() ? `?${params.toString()}` : '';
  const selectedId = id === undefined ? null : Number(id);
  const selected = selectedId === null ? null : (allCards.find((c) => c.id === selectedId) ?? null);
  const closeDetails = useCallback(
    () => navigate({ pathname: '/kartyak', search: linkSearch }),
    [navigate, linkSearch],
  );

  const chips: Chip[] = [
    ...(query.q.trim()
      ? [{ key: 'q', label: `${t.filters.search}: „${query.q.trim()}”`, remove: { q: '' } }]
      : []),
    ...query.pokemon.map((v) => ({
      key: `p:${v}`,
      label: `${t.filters.pokemon}: ${v}`,
      remove: { pokemon: query.pokemon.filter((x) => x !== v) },
    })),
    ...query.languages.map((v) => ({
      key: `l:${v}`,
      label: `${t.filters.language}: ${options.languageName.get(v) ?? v}`,
      remove: { languages: query.languages.filter((x) => x !== v) },
    })),
    ...query.sets.map((v) => ({
      key: `s:${v}`,
      label: `${t.filters.set}: ${v}`,
      remove: { sets: query.sets.filter((x) => x !== v) },
    })),
    ...query.finishes.map((v) => ({
      key: `f:${v}`,
      label: `${t.filters.finish}: ${v}`,
      remove: { finishes: query.finishes.filter((x) => x !== v) },
    })),
    ...(query.owned !== 'all'
      ? [
          {
            key: 'o',
            label: `${t.owned.label}: ${t.owned[query.owned]}`,
            remove: { owned: 'all' as const },
          },
        ]
      : []),
    ...query.image.map((v) => ({
      key: `i:${v}`,
      label: `${t.filters.image}: ${t.image[v]}`,
      remove: { image: query.image.filter((x) => x !== v) },
    })),
  ];
  const active = hasActiveFilters(query);

  return (
    <section className="cards-page">
      <div className="page-head">
        <h1>{t.heading}</h1>
        <p className="result-count" data-testid="result-count" aria-live="polite">
          {cardsQuery.data ? t.count(shown.length, missing) : ''}
        </p>
        <div className="toolbar-end">
          <label className="sort">
            <span className="sr-only">{t.sort.label}</span>
            <select
              className="input select"
              value={query.sort}
              onChange={(e) => update({ sort: e.target.value as SortKey }, { replace: true })}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t.sort.label}: {t.sort[k]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn icon-button"
            aria-label={t.sort.toggleDir(t.sort[query.dir])}
            title={t.sort[query.dir]}
            onClick={() => update({ dir: query.dir === 'asc' ? 'desc' : 'asc' }, { replace: true })}
          >
            <SortIcon dir={query.dir} />
          </button>
          <div className="segmented" role="group" aria-label={t.view.label}>
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              <GridIcon />
              {t.view.grid}
            </button>
            <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
              <ListIcon />
              {t.view.table}
            </button>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            className="input search-input"
            aria-label={t.searchLabel}
            placeholder={t.searchPlaceholder}
            value={text}
            onChange={(e) => changeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                changeText('');
              }
            }}
          />
          <kbd className="kbd" title={t.searchHint}>
            /
          </kbd>
        </div>

        <div className="filters">
          <FilterMenu
            label={t.filters.pokemon}
            options={options.pokemon}
            selected={query.pokemon}
            onChange={(pokemon) => update({ pokemon })}
          />
          <FilterMenu
            label={t.filters.language}
            options={options.languages}
            selected={query.languages}
            onChange={(languages) => update({ languages })}
          />
          <FilterMenu
            label={t.filters.set}
            options={options.sets}
            selected={query.sets}
            onChange={(sets) => update({ sets })}
            searchable
          />
          <FilterMenu
            label={t.filters.finish}
            options={options.finishes}
            selected={query.finishes}
            onChange={(finishes) => update({ finishes })}
            searchable={options.finishes.length > 10}
          />
          <FilterMenu
            label={t.filters.image}
            options={options.image}
            selected={query.image}
            onChange={(image) => update({ image: image as ImageFilter[] })}
          />
          <div className="segmented" role="group" aria-label={t.owned.label}>
            {OWNED.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={query.owned === o}
                onClick={() => update({ owned: o })}
              >
                {t.owned[o]}
              </button>
            ))}
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="chips" aria-label={t.activeFilters}>
            {chips.map((c) => (
              <li key={c.key} className="chip">
                <span>{c.label}</span>
                <button
                  type="button"
                  aria-label={t.removeChip(c.label)}
                  onClick={() => update(c.remove)}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="link-button" onClick={clear}>
                {t.clearAll}
              </button>
            </li>
          </ul>
        )}
      </div>

      {cardsQuery.isPending && <p className="muted">{hu.common.loading}</p>}
      {cardsQuery.isError && <p role="alert">{hu.common.loadError}</p>}
      {cardsQuery.data && allCards.length === 0 && <p className="empty">{t.emptyDb}</p>}
      {cardsQuery.data && allCards.length > 0 && shown.length === 0 && (
        <div className="empty" data-testid="empty-state">
          <p>{t.empty}</p>
          {active && (
            <button type="button" className="btn" onClick={clear}>
              {t.clearFilters}
            </button>
          )}
        </div>
      )}
      {shown.length > 0 &&
        (view === 'grid' ? (
          <CardGrid cards={shown} linkSearch={linkSearch} onToggle={toggle} />
        ) : (
          <CardTable cards={shown} linkSearch={linkSearch} onToggle={toggle} />
        ))}

      {selectedId !== null && (
        <CardDetails
          card={selected}
          loading={cardsQuery.isPending}
          onClose={closeDetails}
          onToggle={toggle}
        />
      )}
    </section>
  );
}
