import { Link } from 'react-router';
import type { Card } from '@gms/shared';
import { hu } from '../i18n/hu';
import { CardImage } from './CardImage';
import { CheckIcon } from './icons';

const t = hu.cards;

interface Props {
  cards: Card[];
  linkSearch: string;
  onToggle: (card: Card) => void;
}

/** Rácsnézet (S-10): kép vagy helykitöltő, a hiányzó lapok szürkék és halványak. */
export function CardGrid({ cards, linkSearch, onToggle }: Props) {
  return (
    <ul className="card-grid" data-testid="card-grid">
      {cards.map((c) => (
        <li key={c.id} className="tile" data-owned={String(c.owned)} data-testid="card">
          <Link className="tile-link" to={{ pathname: `/kartyak/${c.id}`, search: linkSearch }}>
            <span className="tile-media">
              <CardImage card={c} />
              <span className="tile-lang">{c.language.nameHu}</span>
              {!c.owned && <span className="tile-missing">{t.missingTag}</span>}
            </span>
            <span className="tile-body">
              <span className="tile-name">{c.pokemon}</span>
              <span className="tile-set">{c.setName}</span>
              <span className="tile-meta">
                {/* Ahogy a kártyára nyomtatva van: setkód, majd a kártyaszám. */}
                {c.setCode && <span className="set-code">{c.setCode} </span>}
                <span className="num">{c.cardNumber}</span>
                <span aria-hidden="true"> · </span>
                <span>{c.finish.name}</span>
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="own-toggle"
            aria-pressed={c.owned}
            aria-label={t.toggleOwned(
              `${c.pokemon} ${c.cardNumber} ${c.finish.name} ${c.language.shortCode}`,
            )}
            onClick={() => onToggle(c)}
          >
            <span className="own-box">{c.owned && <CheckIcon />}</span>
            {t.markOwned}
          </button>
        </li>
      ))}
    </ul>
  );
}
