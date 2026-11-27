/** Egyszerű vonalas ikonok (nincs emoji a felületen, T-UI-04). */
const base = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const CheckIcon = () => (
  <svg {...base}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
export const SearchIcon = () => (
  <svg {...base}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);
export const ChevronIcon = () => (
  <svg {...base} width={12} height={12}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);
export const SortIcon = ({ dir }: { dir: 'asc' | 'desc' }) => (
  <svg {...base}>
    {dir === 'asc' ? (
      <path d="M8 13V3M4.5 6.5L8 3l3.5 3.5" />
    ) : (
      <path d="M8 3v10M4.5 9.5L8 13l3.5-3.5" />
    )}
  </svg>
);
export const GridIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </svg>
);
export const ListIcon = () => (
  <svg {...base}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </svg>
);
