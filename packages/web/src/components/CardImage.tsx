import type { Card } from '@gms/shared';

/**
 * Kártyakép, vagy amíg nincs kép, egységes helykitöltő: sematikus kártyakeret a
 * Pokémon nevével és a kártyaszámmal (technikai spec 7.1).
 */
export function CardImage({
  card,
  size = 'grid',
}: {
  card: Card;
  size?: 'grid' | 'thumb' | 'large';
}) {
  if (card.image.url) {
    return (
      <img
        className={`card-img card-img-${size}`}
        src={card.image.url}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className={`card-img card-img-${size} card-placeholder`} aria-hidden="true">
      {size !== 'thumb' && (
        <>
          <span className="ph-name">{card.pokemon}</span>
          <span className="ph-art" />
          <span className="ph-number">{card.cardNumber}</span>
        </>
      )}
    </div>
  );
}
