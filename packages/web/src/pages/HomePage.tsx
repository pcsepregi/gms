import { Link } from 'react-router';
import { useCards } from '../api/queries';
import { hu } from '../i18n/hu';

export function HomePage() {
  const cards = useCards();
  const t = hu.home;

  return (
    <section>
      <h1>{t.heading}</h1>
      {cards.isPending && <p className="muted">{hu.common.loading}</p>}
      {cards.isError && <p role="alert">{hu.common.loadError}</p>}
      {cards.data && cards.data.length === 0 && <p>{t.empty}</p>}
      {cards.data && cards.data.length > 0 && (
        <p className="figure">
          {t.progress(cards.data.filter((c) => c.owned).length, cards.data.length)}
        </p>
      )}
      {cards.data && cards.data.length > 0 && (
        <p>
          <Link className="btn" to="/kartyak">
            {t.toList}
          </Link>
        </p>
      )}
      <p className="muted">{t.comingSoon}</p>
    </section>
  );
}
