import { useCallback } from 'react';
import type { Card } from '@gms/shared';
import { useSetOwned } from '../api/queries';
import { useToast } from '../components/Toasts';
import { hu } from '../i18n/hu';

export function cardName(c: Card): string {
  return `${c.pokemon} ${c.cardNumber} (${c.language.shortCode})`;
}

/** Jelölés egy kattintással, 5 mp-es Visszavonással és hibaüzenettel (S-20). */
export function useOwnedToggle() {
  const toast = useToast();
  const mutation = useSetOwned({
    onError: () => toast({ message: hu.toast.saveFailed, tone: 'error' }),
  });
  const { mutate } = mutation;

  return useCallback(
    (card: Card, owned = !card.owned) => {
      mutate({ id: card.id, owned });
      toast({
        message: owned
          ? hu.toast.markedOwned(cardName(card))
          : hu.toast.markedMissing(cardName(card)),
        action: { label: hu.toast.undo, run: () => mutate({ id: card.id, owned: !owned }) },
      });
    },
    [mutate, toast],
  );
}
