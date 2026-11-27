import { useId, useMemo, useState, type FormEvent } from 'react';
import { LIMITS, type Finish } from '@gms/shared';
import { duplicateId, errorFields } from '../api/client';
import { useCards, useCreateFinish, useLookups, useUpdateFinish } from '../api/queries';
import { hu } from '../i18n/hu';
import { useToast } from './Toasts';

const t = hu.settings;

function DescriptionEditor({ finish, onDone }: { finish: Finish; onDone: () => void }) {
  const [text, setText] = useState(finish.description ?? '');
  const update = useUpdateFinish();
  const toast = useToast();
  const id = useId();
  const tooLong = text.trim().length > LIMITS.description;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (tooLong) return;
    update.mutate(
      { id: finish.id, description: text },
      {
        onSuccess: () => {
          toast({ message: t.descriptionSaved });
          onDone();
        },
        onError: () => toast({ message: hu.form.saveFailed, tone: 'error' }),
      },
    );
  };

  return (
    <form className="inline-edit" onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        {t.editDescription(finish.name)}
      </label>
      <textarea
        id={id}
        className="input textarea"
        rows={2}
        value={text}
        autoFocus
        aria-invalid={tooLong || undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
          }
        }}
      />
      <div className="inline-actions">
        <button type="submit" className="btn btn-primary" disabled={tooLong || update.isPending}>
          {t.save}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function NewFinishForm() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateFinish();
  const toast = useToast();
  const uid = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name, description },
      {
        onSuccess: (f) => {
          toast({ message: t.finishAdded(f.name) });
          setName('');
          setDescription('');
          setError(null);
        },
        onError: (err) => {
          if (duplicateId(err) !== null) setError(t.finishExists);
          else {
            const fields = errorFields(err);
            setError(fields.name ?? fields.description ?? hu.form.saveFailed);
          }
        },
      },
    );
  };

  return (
    <form className="new-finish" onSubmit={submit} data-testid="new-finish">
      <h3>{t.newFinishHeading}</h3>
      <div className="new-finish-fields">
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-name`}>
            {t.finishName}
          </label>
          <input
            id={`${uid}-name`}
            className="input"
            value={name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-err` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="field grow">
          <label className="field-label" htmlFor={`${uid}-desc`}>
            {t.finishDescription}
            <span className="field-optional"> {hu.form.optional}</span>
          </label>
          <input
            id={`${uid}-desc`}
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!name.trim() || create.isPending}
        >
          {t.add}
        </button>
      </div>
      {error && (
        <p id={`${uid}-err`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** A finish-szótár: leírások megtekintése, szerkesztése, új felvétele (S-64). */
export function FinishDictionary() {
  const lookups = useLookups();
  const cards = useCards();
  const [editing, setEditing] = useState<number | null>(null);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of cards.data ?? []) m.set(c.finish.id, (m.get(c.finish.id) ?? 0) + 1);
    return m;
  }, [cards.data]);

  if (lookups.isPending) return <p className="muted">{hu.common.loading}</p>;
  if (!lookups.data) return <p role="alert">{hu.common.loadError}</p>;

  return (
    <div className="stack" data-testid="finish-dictionary">
      <p className="muted">{t.finishesIntro}</p>
      <table className="table finish-table">
        <thead>
          <tr>
            <th scope="col">{t.finishName}</th>
            <th scope="col">{t.finishDescription}</th>
            <th scope="col" className="num">
              {t.finishCards}
            </th>
            <th scope="col">
              <span className="sr-only">{t.edit}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lookups.data.finishes.map((f) => (
            <tr key={f.id}>
              <th scope="row">{f.name}</th>
              <td>
                {editing === f.id ? (
                  <DescriptionEditor finish={f} onDone={() => setEditing(null)} />
                ) : f.description ? (
                  f.description
                ) : (
                  <span className="muted">{t.noDescription}</span>
                )}
              </td>
              <td className="num">{counts.get(f.id) ?? 0}</td>
              <td className="col-action">
                {editing !== f.id && (
                  <button
                    type="button"
                    className="link-button"
                    aria-label={t.editFor(f.name)}
                    onClick={() => setEditing(f.id)}
                  >
                    {t.edit}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <NewFinishForm />
    </div>
  );
}
