import { useId, useMemo, useRef, useState } from 'react';
import { foldSearch } from '@gms/shared';
import { hu } from '../i18n/hu';

export interface ComboOption {
  /** A mezőbe kerülő szöveg. */
  value: string;
  /** Kiegészítő szöveg a listában (pl. a nyelv kódja, a finish leírása). */
  hint?: string;
}

interface Props {
  id: string;
  /** A mező felirata (a javaslatlista akadálymentes nevéhez). */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboOption[];
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  /** Legfeljebb ennyi javaslat látszik egyszerre. */
  limit?: number;
}

/**
 * Gépelhető mező, amely felajánlja a meglévő értékeket, de új értéket is elfogad
 * (S-21/EF3, technikai spec 8.4). WAI-ARIA combobox minta, lista felugró elemmel.
 */
export function Combobox({
  id,
  label,
  value,
  onChange,
  options,
  invalid = false,
  describedBy,
  placeholder,
  limit = 60,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Fókuszba lépéskor a teljes listát mutatja; gépelés után szűr.
  const [typed, setTyped] = useState(false);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const needle = typed ? foldSearch(value.trim()) : '';
    const list = needle
      ? options.filter(
          (o) => foldSearch(o.value).includes(needle) || foldSearch(o.hint ?? '').includes(needle),
        )
      : options;
    return list.slice(0, limit);
  }, [options, value, typed, limit]);

  // Ha a beírt érték már pontosan az egyetlen javaslat, a lista nem takarja a többi mezőt.
  const settled = shown.length === 1 && foldSearch(shown[0]!.value) === foldSearch(value.trim());
  const show = open && shown.length > 0 && !settled;

  const pick = (option: ComboOption) => {
    onChange(option.value);
    setOpen(false);
    setActive(-1);
    setTyped(false);
  };

  const move = (delta: number) => {
    if (!open) setOpen(true);
    const n = shown.length;
    if (!n) return;
    const next = active < 0 ? (delta > 0 ? 0 : n - 1) : (active + delta + n) % n;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView?.({ block: 'nearest' });
  };

  return (
    <div className="combo">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setTyped(false);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
          } else if (e.key === 'Enter' && show && active >= 0) {
            e.preventDefault();
            pick(shown[active]!);
          } else if (e.key === 'Escape' && show) {
            // Csak a listát zárja be, a panelt nem.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setActive(-1);
          } else if (e.key === 'Tab') {
            setOpen(false);
          }
        }}
      />
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        className="combo-list"
        aria-label={hu.form.suggestions(label)}
        hidden={!show}
      >
        {show &&
          shown.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="combo-option"
              // mousedown: a mező ne veszítse el a fókuszt a választás előtt.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseMove={() => setActive(i)}
            >
              <span className="combo-value">{o.value}</span>
              {o.hint && <span className="combo-hint">{o.hint}</span>}
            </li>
          ))}
      </ul>
    </div>
  );
}
