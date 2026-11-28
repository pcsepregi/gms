import { useCallback } from 'react';
import type { Card } from '@gms/shared';
import { useSetOnTheWay } from '../api/queries';
import { useToast } from '../components/Toasts';
import { hu } from '../i18n/hu';
import { cardName } from './useOwnedToggle';

/** "Úton" jelölés egy kattintással, Visszavonással és hibaüzenettel. */
export function useOnTheWayToggle() {
  const toast = useToast();
  const mutation = useSetOnTheWay({
    onError: () => toast({ message: hu.toast.saveFailed, tone: 'error' }),
  });
  const { mutate } = mutation;

  return useCallback(
    (card: Card, onTheWay = !card.onTheWay) => {
      mutate({ id: card.id, onTheWay });
      toast({
        message: onTheWay
          ? hu.toast.markedOnTheWay(cardName(card))
          : hu.toast.unmarkedOnTheWay(cardName(card)),
        action: { label: hu.toast.undo, run: () => mutate({ id: card.id, onTheWay: !onTheWay }) },
      });
    },
    [mutate, toast],
  );
}
