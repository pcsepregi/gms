import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  NO_SET_CODE,
  filterCards,
  hasActiveFilters,
  queryCards,
  setCodeKey,
  type Card,
  type CardQuery,
  type ImageFilter,
  type OwnedFilter,
  type SortKey,
} from '@gms/shared';
import { useCards } from '../api/queries';
import { downloadExport } from '../lib/download';
import { CardDetails } from '../components/CardDetails';
import { CardForm } from '../components/CardForm';
import { Panel } from '../components/Panel';
import { useToast } from '../components/Toasts';
import { CardGrid } from '../components/CardGrid';
import { CardTable } from '../components/CardTable';
import { FilterMenu, type FilterOption } from '../components/FilterMenu';
import { CloseIcon, GridIcon, ListIcon, PlusIcon, SearchIcon, SortIcon } from '../components/icons';
import { useCardQuery } from '../hooks/useCardQuery';
import { cardName, useOwnedToggle } from '../hooks/useOwnedToggle';
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

type FacetKey = 'pokemon' | 'languages' | 'sets' | 'setCodes' | 'finishes' | 'image';

/**
 * Egymásra ható (fazettás) szűrők: egy szűrő lehetőségei azokból a lapokból állnak, amelyek
 * a többi szűrőnek (és a keresésnek) megfelelnek, a saját szűrőjét nem számítva. A már
 * kiválasztott értékek akkor is látszanak, ha jelenleg nulla lapot adnának.
 */
function useOptions(cards: readonly Card[], query: CardQuery) {
  return useMemo(() => {
    const facet = (key: FacetKey) => filterCards(cards, { ...query, [key]: [] });

    // A nyelvek nevei az összes lapból, hogy a kiválasztott nyelv neve mindig megvan.
    const langInfo = new Map<string, { label: string; order: number }>();
    for (const c of cards) {
      langInfo.set(c.language.shortCode, { label: c.language.nameHu, order: c.language.sortOrder });
    }
    // Setkód → a hozzá tartozó setnevek (a szűrőben segítségnek a kód mellett).
    const codeNames = new Map<string, Set<string>>();
    for (const c of cards) {
      const k = setCodeKey(c);
      if (!codeNames.has(k)) codeNames.set(k, new Set());
      codeNames.get(k)!.add(c.setName);
    }
    const codeLabel = (code: string) =>
      code === NO_SET_CODE
        ? t.noSetCode
        : `${code} – ${[...(codeNames.get(code) ?? [])].join(', ')}`;

    /** A kiválasztott, de a jelenlegi lapok között nem szereplő értékek 0 darabbal. */
    const withSelected = (
      options: FilterOption[],
      selected: readonly string[],
      label: (v: string) => string,
    ) => {
      const present = new Set(options.map((o) => o.value));
      const extra = selected
        .filter((v) => !present.has(v))
        .map((v) => ({ value: v, label: label(v), count: 0 }));
      return [...options, ...extra];
    };
    const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label, 'hu');
    const text = (key: FacetKey, get: (c: Card) => string, selected: readonly string[]) =>
      withSelected(textOptions(facet(key), get), selected, (v) => v).sort(byLabel);

    const languages = withSelected(
      [...countBy(facet('languages'), (c) => c.language.shortCode)].map(([value, count]) => ({
        value,
        label: langInfo.get(value)?.label ?? value,
        count,
      })),
      query.languages,
      (v) => langInfo.get(v)?.label ?? v,
    ).sort(
      (a, b) =>
        (langInfo.get(a.value)?.order ?? Infinity) - (langInfo.get(b.value)?.order ?? Infinity),
    );

    const setCodes = withSelected(
      [...countBy(facet('setCodes'), setCodeKey)].map(([value, count]) => ({
        value,
        label: codeLabel(value),
        count,
      })),
      query.setCodes,
      codeLabel,
    ).sort((a, b) =>
      a.value === NO_SET_CODE ? 1 : b.value === NO_SET_CODE ? -1 : a.value.localeCompare(b.value),
    );

    const imageCounts = countBy(facet('image'), (c) => c.image.status);
    return {
      pokemon: text('pokemon', (c) => c.pokemon, query.pokemon),
      sets: text('sets', (c) => c.setName, query.sets),
      setCodes,
      setCodeLabel: (code: string) => (code === NO_SET_CODE ? t.noSetCode : code),
      finishes: text('finishes', (c) => c.finish.name, query.finishes),
      languages,
      image: IMAGE.map((v) => ({ value: v, label: t.image[v], count: imageCounts.get(v) ?? 0 })),
      languageName: new Map([...langInfo].map(([k, v]) => [k, v.label])),
    };
  }, [cards, query]);
}

interface Chip {
  key: string;
  label: string;
  remove: Partial<CardQuery>;
}

/** A szűrőkből képzett fájlnév-részlet (S-51/EF2), pl. "hianylista-nemet". */
function exportName(q: CardQuery): string {
  const parts: string[] = [];
  if (q.owned === 'missing') parts.push('hianylista');
  if (q.owned === 'owned') parts.push('megvan');
  if (q.languages.length === 1) parts.push(q.languages[0]!.toLowerCase());
  if (q.pokemon.length === 1) parts.push(q.pokemon[0]!);
  if (q.sets.length === 1) parts.push(q.sets[0]!);
  if (q.setCodes.length === 1 && q.setCodes[0] !== NO_SET_CODE) parts.push(q.setCodes[0]!);
  return parts.join(' ') || 'lista';
}

function ExportMenu({ ids, name, disabled }: { ids: number[]; name: string; disabled: boolean }) {
  const toast = useToast();
  const run = (format: 'xlsx' | 'csv') =>
    downloadExport({ format, ids, name }).catch(() =>
      toast({ message: hu.cards.exportFailed, tone: 'error' }),
    );
  return (
    <div className="export-buttons" role="group" aria-label={hu.cards.export}>
      <button type="button" className="btn" disabled={disabled} onClick={() => run('xlsx')}>
        {hu.cards.exportXlsx}
      </button>
      <button type="button" className="btn" disabled={disabled} onClick={() => run('csv')}>
        {hu.cards.exportCsv}
      </button>
    </div>
  );
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function CardsPage({ creating = false }: { creating?: boolean }) {
  const cardsQuery = useCards();
  const allCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);
  const { query, params, update, clear } = useCardQuery();
  const [view, setView] = useViewMode();
  const toggle = useOwnedToggle();
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

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
  const options = useOptions(
    allCards,
    useMemo(() => ({ ...query, q: deferredText }), [query, deferredText]),
  );

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
  const selectedId = creating || id === undefined ? null : Number(id);
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
    ...query.setCodes.map((v) => ({
      key: `sc:${v}`,
      label: `${t.filters.setCode}: ${options.setCodeLabel(v)}`,
      remove: { setCodes: query.setCodes.filter((x) => x !== v) },
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
          <ExportMenu
            ids={shown.map((c) => c.id)}
            name={exportName(query)}
            disabled={shown.length === 0}
          />
          <Link className="btn btn-primary" to={`/kartyak/uj${linkSearch}`}>
            <PlusIcon />
            {t.newCard}
          </Link>
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
            label={t.filters.setCode}
            options={options.setCodes}
            selected={query.setCodes}
            onChange={(setCodes) => update({ setCodes })}
            searchable={options.setCodes.length > 10}
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

      {creating && (
        <Panel title={hu.form.newHeading} onClose={closeDetails} testId="new-card">
          <CardForm
            card={null}
            onCancel={closeDetails}
            onSaved={(card) => {
              toast({ message: hu.toast.created(cardName(card)) });
              navigate({ pathname: `/kartyak/${card.id}`, search: linkSearch });
            }}
          />
        </Panel>
      )}

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
