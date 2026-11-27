import { useState } from 'react';
import type { Card } from '@gms/shared';
import { useDeleteCard } from '../api/queries';
import { cardName } from '../hooks/useOwnedToggle';
import { hu } from '../i18n/hu';
import { CardForm } from './CardForm';
import { CardImage } from './CardImage';
import { ConfirmDialog } from './ConfirmDialog';
import { Panel } from './Panel';
import { useToast } from './Toasts';

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

/**
 * Kártya részletei oldalpanelen a lista fölött (S-10/EF4, S-20/EF1), innen
 * szerkeszthető (S-23) és törölhető (S-24).
 */
export function CardDetails({ card, loading, onClose, onToggle }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [shownId, setShownId] = useState(card?.id);
  const remove = useDeleteCard();
  const toast = useToast();

  // Másik kártyára váltáskor a nézet alaphelyzetbe áll.
  if (card?.id !== shownId) {
    setShownId(card?.id);
    setEditing(false);
    setConfirming(false);
  }

  const title = card
    ? editing
      ? t.editHeading
      : card.pokemon
    : loading
      ? hu.common.loading
      : t.notFound;

  const confirmDelete = () => {
    if (!card) return;
    const name = cardName(card);
    remove.mutate(card.id, {
      onSuccess: () => {
        setConfirming(false);
        toast({ message: hu.toast.deleted(name) });
        onClose();
      },
      onError: () => {
        setConfirming(false);
        toast({ message: hu.toast.deleteFailed, tone: 'error' });
      },
    });
  };

  return (
    <Panel
      title={title}
      focusKey={`${card?.id}-${editing}`}
      onClose={onClose}
      onEscape={editing ? () => setEditing(false) : onClose}
      testId="card-details"
      footer={
        card &&
        !editing && (
          <>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              {t.edit}
            </button>
            <button
              type="button"
              className="btn btn-quiet-danger push-end"
              onClick={() => setConfirming(true)}
            >
              {t.delete}
            </button>
          </>
        )
      }
    >
      {card && editing && (
        <CardForm
          card={card}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            toast({ message: hu.toast.saved(cardName(saved)) });
          }}
        />
      )}
      {card && !editing && (
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
                <span className="muted block" data-testid="finish-description">
                  <span className="sr-only">{t.finishHelp}: </span>
                  {card.finish.description}
                </span>
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
        </div>
      )}
      {card && confirming && (
        <ConfirmDialog
          title={hu.confirm.deleteTitle}
          body={hu.confirm.deleteBody}
          note={hu.confirm.deleteRestore}
          confirmLabel={hu.confirm.delete}
          cancelLabel={hu.confirm.cancel}
          busy={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Panel>
  );
}
