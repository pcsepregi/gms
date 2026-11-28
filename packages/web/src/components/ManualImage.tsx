import { useRef, useState } from 'react';
import type { Card } from '@gms/shared';
import { ApiError } from '../api/client';
import { useManualImage } from '../api/queries';
import { hu } from '../i18n/hu';
import { useToast } from './Toasts';

const t = hu.details.manualImage;

/**
 * Saját kép a kártyához: fájl feltöltése, képlink, vagy vágólapról beillesztett kép.
 * Azoknak a lapoknak, amelyekhez a képforrásokban nincs kép.
 */
export function ManualImage({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useManualImage();
  const toast = useToast();

  const run = (input: { file?: Blob; url?: string }) => {
    setError(null);
    save.mutate(
      { id: card.id, ...input },
      {
        onSuccess: () => {
          setOpen(false);
          setUrl('');
          toast({ message: t.saved });
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : t.failed),
      },
    );
  };

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {t.open}
      </button>
    );
  }
  return (
    <form
      className="manual-image"
      aria-label={t.heading}
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) run({ url: url.trim() });
      }}
    >
      <p className="muted small">{t.hint}</p>
      <div className="manual-image-row">
        <button
          type="button"
          className="btn"
          disabled={save.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {t.upload}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          aria-label={t.upload}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) run({ file });
          }}
        />
      </div>
      <div className="manual-image-row">
        <input
          type="url"
          aria-label={t.urlLabel}
          className="input"
          placeholder={t.urlPlaceholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
            if (file) {
              e.preventDefault();
              run({ file });
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!url.trim() || save.isPending}>
          {save.isPending ? t.saving : t.save}
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
        {t.cancel}
      </button>
    </form>
  );
}
