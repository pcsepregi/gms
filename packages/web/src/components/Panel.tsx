import { useEffect, useRef, type ReactNode } from 'react';
import { hu } from '../i18n/hu';
import { CloseIcon } from './icons';

interface Props {
  title: string;
  /** Ha változik, a fókusz a címre kerül (pl. másik kártya, szerkesztés vége). */
  focusKey?: unknown;
  onClose: () => void;
  /** Escape billentyű; alapból bezár. */
  onEscape?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}

/** Oldalpanel a lista fölött: részletek, szerkesztés, új kártya (technikai spec 8.1). */
export function Panel({ title, focusKey, onClose, onEscape, children, footer, testId }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [focusKey]);

  const escape = onEscape ?? onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) escape();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [escape]);

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="panel" role="dialog" aria-labelledby="panel-title" data-testid={testId}>
        <div className="panel-head">
          <h2 id="panel-title" tabIndex={-1} ref={headingRef}>
            {title}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label={hu.details.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
        {footer && <div className="panel-foot">{footer}</div>}
      </aside>
    </>
  );
}
