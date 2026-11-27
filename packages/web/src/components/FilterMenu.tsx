import { useEffect, useId, useRef, useState } from 'react';
import { foldSearch } from '@gms/shared';
import { hu } from '../i18n/hu';
import { ChevronIcon } from './icons';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface Props {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Kereshető lista (pl. a sok setnél). */
  searchable?: boolean;
}

/** Többértékű szűrő legördülő listával; egy szűrőn belül VAGY kapcsolat (S-13/EF2). */
export function FilterMenu({ label, options, selected, onChange, searchable = false }: Props) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setFind('');
    buttonRef.current?.focus();
  };

  const selectedSet = new Set(selected);
  const needle = foldSearch(find.trim());
  const shown = needle ? options.filter((o) => foldSearch(o.label).includes(needle)) : options;

  const toggle = (value: string) =>
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div
      className="filter-menu"
      ref={rootRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`btn filter-button${selected.length ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {label}
        {selected.length > 0 && <span className="filter-count">{selected.length}</span>}
        <ChevronIcon />
      </button>
      {open && (
        <div className="filter-panel" id={panelId} role="group" aria-label={label}>
          {searchable && (
            <input
              type="search"
              className="input filter-find"
              placeholder={hu.cards.filters.findInList}
              aria-label={`${label}: ${hu.cards.filters.findInList}`}
              value={find}
              autoFocus
              onChange={(e) => setFind(e.target.value)}
            />
          )}
          <ul className="filter-options">
            {shown.map((o) => (
              <li key={o.value}>
                <label className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="filter-option-label">{o.label}</span>
                  <span className="filter-option-count">{o.count}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="muted filter-empty">{hu.cards.filters.noOptions}</li>
            )}
          </ul>
          {selected.length > 0 && (
            <div className="filter-footer">
              <button type="button" className="link-button" onClick={() => onChange([])}>
                {hu.cards.filters.clear}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
