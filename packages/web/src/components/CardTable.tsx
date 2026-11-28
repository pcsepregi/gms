import { Link } from 'react-router';
import type { Card } from '@gms/shared';
import { hu } from '../i18n/hu';
import { CardImage } from './CardImage';

const t = hu.cards;

function noteStart(note: string): string {
  const first = note.split('\n').find((l) => l.trim()) ?? '';
  return first.length > 60 ? `${first.slice(0, 59)}…` : first;
}

interface Props {
  cards: Card[];
  linkSearch: string;
  onToggle: (card: Card) => void;
  onToggleOnTheWay: (card: Card) => void;
}

/** Sűrű táblázatos nézet (S-11/EF2). */
export function CardTable({ cards, linkSearch, onToggle, onToggleOnTheWay }: Props) {
  return (
    <div className="table-wrap">
      <table className="table card-table" data-testid="card-table">
        <thead>
          <tr>
            <th scope="col" className="col-check">
              {t.columns.owned}
            </th>
            <th scope="col" className="col-check">
              {t.columns.onTheWay}
            </th>
            <th scope="col" className="col-thumb">
              <span className="sr-only">{t.columns.image}</span>
            </th>
            <th scope="col">{t.columns.pokemon}</th>
            <th scope="col">{t.columns.set}</th>
            <th scope="col">{t.columns.setCode}</th>
            <th scope="col">{t.columns.number}</th>
            <th scope="col">{t.columns.finish}</th>
            <th scope="col">{t.columns.language}</th>
            <th scope="col">{t.columns.note}</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} data-owned={String(c.owned)} data-testid="card">
              <td className="col-check">
                <input
                  type="checkbox"
                  checked={c.owned}
                  aria-label={t.toggleOwned(
                    `${c.pokemon} ${c.cardNumber} ${c.finish.name} ${c.language.shortCode}`,
                  )}
                  onChange={() => onToggle(c)}
                />
              </td>
              <td className="col-check">
                <input
                  type="checkbox"
                  checked={c.onTheWay}
                  disabled={c.owned}
                  aria-label={t.toggleOnTheWay(
                    `${c.pokemon} ${c.cardNumber} ${c.finish.name} ${c.language.shortCode}`,
                  )}
                  onChange={() => onToggleOnTheWay(c)}
                />
              </td>
              <td className="col-thumb">
                <CardImage card={c} size="thumb" />
              </td>
              <td>
                <Link to={{ pathname: `/kartyak/${c.id}`, search: linkSearch }}>{c.pokemon}</Link>
              </td>
              <td>{c.setName}</td>
              <td className="set-code">{c.setCode ?? '–'}</td>
              <td className="num">{c.cardNumber}</td>
              <td>{c.finish.name}</td>
              <td>{c.language.nameHu}</td>
              <td className="col-note">{noteStart(c.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
