import type { Card } from '@gms/shared';
import { hu } from '../i18n/hu';

/**
 * Kártyakép, vagy amíg nincs kép, egységes helykitöltő: sematikus kártyakeret a
 * Pokémon nevével és a kártyaszámmal (technikai spec 7.1). Tartalék képnél a kép nyelvét
 * jelvény mutatja (S-42/EF2), keresés közben a helykitöltőn "Kép keresése…" látszik (S-41).
 */
export function CardImage({
  card,
  size = 'grid',
}: {
  card: Card;
  size?: 'grid' | 'thumb' | 'large';
}) {
  const src = size === 'large' ? card.image.url : (card.image.thumbUrl ?? card.image.url);
  if (src) {
    const badge =
      card.image.status === 'fallback' && card.image.languageNameHu && size === 'grid'
        ? hu.cards.imageFallback(card.image.languageNameHu)
        : null;
    return (
      <>
        <img
          className={`card-img card-img-${size}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          data-image-status={card.image.status}
        />
        {badge && (
          <span className="img-badge" data-testid="image-badge">
            {badge}
          </span>
        )}
      </>
    );
  }
  return (
    <div
      className={`card-img card-img-${size} card-placeholder`}
      aria-hidden="true"
      data-image-status={card.image.status}
    >
      {size !== 'thumb' && (
        <>
          <span className="ph-name">{card.pokemon}</span>
          <span className="ph-art" />
          <span className="ph-number">{card.cardNumber}</span>
          {card.image.status === 'pending' && (
            <span className="ph-searching" data-testid="image-searching">
              {hu.cards.imageSearching}
            </span>
          )}
        </>
      )}
    </div>
  );
}
