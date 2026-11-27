import { useEffect, useRef } from 'react';
import type { Card } from '@gms/shared';
import { hu } from '../i18n/hu';
import { CardImage } from './CardImage';
import { CloseIcon } from './icons';

const t = hu.details;

/** A megjegyzés szövege, a benne lévő linkek kattinthatók (pl. a `Forrás:` sor). */
function NoteText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/gu);
  return (
    <p className="note-text">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  );
}

interface Props {
  card: Card | null;
  loading: boolean;
  onClose: () => void;
  onToggle: (card: Card) => void;
}

/** Kártya részletei oldalpanelen a lista fölött (S-10/EF4, S-20/EF1). */
export function CardDetails({ card, loading, onClose, onToggle }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cardId = card?.id;

  useEffect(() => {
    headingRef.current?.focus();
  }, [cardId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className="panel"
        role="dialog"
        aria-labelledby="card-details-title"
        data-testid="card-details"
      >
        <div className="panel-head">
          <h2 id="card-details-title" tabIndex={-1} ref={headingRef}>
            {card ? card.pokemon : loading ? hu.common.loading : t.notFound}
          </h2>
          <button type="button" className="icon-button" aria-label={t.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {card && (
          <div className="panel-body" data-owned={String(card.owned)}>
            <div className="panel-media">
              <CardImage card={card} size="large" />
            </div>
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={card.owned}
                onChange={() => onToggle(card)}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              <span>{t.owned}</span>
            </label>
            <dl className="facts">
              <dt>{t.set}</dt>
              <dd>{card.setName}</dd>
              <dt>{t.setCode}</dt>
              <dd>{card.setCode ?? '–'}</dd>
              <dt>{t.number}</dt>
              <dd>{card.cardNumber}</dd>
              <dt>{t.finish}</dt>
              <dd>
                {card.finish.name}
                {card.finish.description && (
                  <span className="muted block">{card.finish.description}</span>
                )}
              </dd>
              <dt>{t.language}</dt>
              <dd>
                {card.language.nameHu} <span className="muted">({card.language.shortCode})</span>
              </dd>
              <dt>{t.displayId}</dt>
              <dd className="mono">{card.displayId}</dd>
            </dl>
            <h3>{t.note}</h3>
            {card.note ? <NoteText text={card.note} /> : <p className="muted">{t.noNote}</p>}
            <p className="muted small">{t.editLater}</p>
          </div>
        )}
      </aside>
    </>
  );
}
