/**
 * Kis gyűrűdiagram (dashboard): a megvan lapok Pokémononként színezett ívek, a hiányzó
 * rész a halvány alapgyűrű. Tiszta SVG, színátmenet nélkül (T-UI-04). A diagram csak
 * díszítés: a számok mindig szövegként is ott vannak mellette (aria-hidden).
 */
export interface DonutSegment {
  key: string;
  value: number;
  /** CSS szín, pl. "var(--series-1)". */
  color: string;
  /** Egérrel fölé víve megjelenő szöveg. */
  title: string;
}

const GAP = 2;

export function Donut({
  segments,
  total,
  size,
  thickness,
  children,
  className,
}: {
  segments: readonly DonutSegment[];
  total: number;
  size: number;
  thickness: number;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const visible = segments.filter((s) => s.value > 0);
  const sum = visible.reduce((n, s) => n + s.value, 0);
  // Ha minden megvan és csak egy szín van, zárt gyűrű; különben rés az ívek között.
  const gap = sum === total && visible.length === 1 ? 0 : Math.min(GAP, c / 40);
  const arcs: (DonutSegment & { start: number; full: number; len: number })[] = [];
  for (const s of visible) {
    const prev = arcs.at(-1);
    const start = prev ? prev.start + prev.full : 0;
    const full = total === 0 ? 0 : (s.value / total) * c;
    arcs.push({ ...s, start, full, len: Math.max(full - gap, 0.5) });
  }
  return (
    <span className={`donut ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            className="donut-track"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
          />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.len} ${c - a.len}`}
              strokeDashoffset={-a.start}
            >
              <title>{a.title}</title>
            </circle>
          ))}
        </g>
      </svg>
      {children && <span className="donut-center">{children}</span>}
    </span>
  );
}
