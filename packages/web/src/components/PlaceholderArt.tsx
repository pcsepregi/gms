/**
 * Szürke, stilizált malacka-figura a kép nélküli kártyákon: egyértelműen helyettesítő
 * rajz, nem a kártya képe. Színe a currentColor, így világos és sötét témában is a
 * halvány szövegszínt követi.
 */
export function PlaceholderArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {/* fülek (a test mögött) */}
      <path d="M31 40 Q22 22 28 13 Q40 20 47 31 Z" fill="currentColor" fillOpacity="0.3" />
      <path d="M69 40 Q78 22 72 13 Q60 20 53 31 Z" fill="currentColor" fillOpacity="0.3" />
      {/* lábak */}
      <ellipse
        cx="37"
        cy="87"
        rx="7.5"
        ry="4.5"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="none"
      />
      <ellipse
        cx="63"
        cy="87"
        rx="7.5"
        ry="4.5"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="none"
      />
      {/* kerek test, takaró kitöltéssel */}
      <ellipse className="ph-body" cx="50" cy="57" rx="34" ry="30" />
      {/* sötét szemsáv, benne világos szemek */}
      <path
        d="M22 50 Q50 37 78 50 Q76 60 64 60 Q50 54 36 60 Q24 60 22 50 Z"
        fill="currentColor"
        fillOpacity="0.5"
        stroke="none"
      />
      <circle className="ph-eye" cx="38" cy="52" r="3" stroke="none" />
      <circle className="ph-eye" cx="62" cy="52" r="3" stroke="none" />
      {/* orr */}
      <ellipse cx="50" cy="70" rx="12" ry="8" fill="currentColor" fillOpacity="0.2" />
      <ellipse cx="45.5" cy="70" rx="2" ry="3" fill="currentColor" stroke="none" />
      <ellipse cx="54.5" cy="70" rx="2" ry="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
