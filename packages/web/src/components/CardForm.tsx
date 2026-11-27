import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  cardInputSchema,
  cleanText,
  fieldErrors,
  foldSearch,
  keyText,
  LIMITS,
  naturalKey,
  type Card,
  type CardInput,
  type Finish,
  type Language,
  type Lookups,
} from '@gms/shared';
import { duplicateId, errorFields } from '../api/client';
import {
  useCards,
  useCreateFinish,
  useCreateLanguage,
  useLookups,
  useSaveCard,
} from '../api/queries';
import { hu } from '../i18n/hu';
import { Combobox, type ComboOption } from './Combobox';

const t = hu.form;
/** A közös séma üzenete üres kötelező mezőre. */
const REQUIRED = 'Kötelező mező.';

type Field = 'pokemon' | 'setName' | 'setCode' | 'cardNumber' | 'finish' | 'language' | 'note';

interface Values {
  pokemon: string;
  setName: string;
  setCode: string;
  cardNumber: string;
  finish: string;
  language: string;
  owned: boolean;
  note: string;
}

const EMPTY: Values = {
  pokemon: '',
  setName: '',
  setCode: '',
  cardNumber: '',
  finish: '',
  language: '',
  owned: false,
  note: '',
};

function fromCard(c: Card): Values {
  return {
    pokemon: c.pokemon,
    setName: c.setName,
    setCode: c.setCode ?? '',
    cardNumber: c.cardNumber,
    finish: c.finish.name,
    language: c.language.nameHu,
    owned: c.owned,
    note: c.note,
  };
}

export function findFinish(finishes: readonly Finish[], text: string): Finish | undefined {
  const k = keyText(text);
  return k ? finishes.find((f) => keyText(f.name) === k) : undefined;
}

/** Nyelv a magyar vagy az eredeti neve, illetve a rövid kódja alapján (ékezet nélkül is). */
export function findLanguage(languages: readonly Language[], text: string): Language | undefined {
  const k = foldSearch(cleanText(text));
  if (!k) return undefined;
  return languages.find(
    (l) => foldSearch(l.nameHu) === k || foldSearch(l.name) === k || foldSearch(l.shortCode) === k,
  );
}

/** Ismert set esetén az egyértelmű setkód (S-21/EF4); több kódú setnél nincs. */
function uniqueSetCode(lookups: Lookups | undefined, setName: string): string | null {
  const k = keyText(setName);
  const set = lookups?.sets.find((s) => keyText(s.name) === k);
  return set && set.codes.length === 1 ? set.codes[0]! : null;
}

/** A mezők ellenőrzése a közös Zod sémával (ugyanazok a szabályok, mint a szerveren). */
function validate(v: Values): Partial<Record<Field, string>> {
  const res = cardInputSchema.safeParse({
    owned: v.owned,
    pokemon: v.pokemon,
    setName: v.setName,
    setCode: v.setCode,
    cardNumber: v.cardNumber,
    finishId: 1,
    languageId: 1,
    note: v.note,
  });
  const errors: Partial<Record<Field, string>> = res.success
    ? {}
    : (fieldErrors(res.error) as Partial<Record<Field, string>>);
  for (const f of ['finish', 'language'] as const) {
    const text = cleanText(v[f]);
    if (!text) errors[f] = REQUIRED;
    else if (text.length > LIMITS.text) errors[f] = `Legfeljebb ${LIMITS.text} karakter.`;
  }
  return errors;
}

interface ControlProps {
  id: string;
  invalid: boolean;
  describedBy?: string;
}

interface Props {
  /** Szerkesztendő kártya; `null` esetén új kártya. */
  card: Card | null;
  onSaved: (card: Card) => void;
  onCancel: () => void;
}

/** Kártya űrlap: felvétel és szerkesztés (S-21, S-22, S-23, technikai spec 8.4). */
export function CardForm({ card, onSaved, onCancel }: Props) {
  const lookups = useLookups();
  const cards = useCards();
  const save = useSaveCard();
  const createFinish = useCreateFinish();
  const createLanguage = useCreateLanguage();
  const uid = useId();
  const fid = (f: string) => `${uid}-${f}`;

  const [values, setValues] = useState<Values>(() => (card ? fromCard(card) : EMPTY));
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverDuplicate, setServerDuplicate] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // Az utoljára automatikusan kitöltött setkód: csak ezt írjuk felül.
  const autoCode = useRef<string | null>(null);

  const finishes = useMemo(() => lookups.data?.finishes ?? [], [lookups.data]);
  const languages = useMemo(() => lookups.data?.languages ?? [], [lookups.data]);
  const finish = findFinish(finishes, values.finish);
  const language = findLanguage(languages, values.language);

  const options = useMemo(() => {
    const d = lookups.data;
    return {
      pokemon: (d?.pokemon ?? []).map((value): ComboOption => ({ value })),
      sets: (d?.sets ?? []).map((s): ComboOption => ({
        value: s.name,
        hint: s.codes.join(', ') || undefined,
      })),
      finishes: finishes.map((f): ComboOption => ({
        value: f.name,
        hint: f.description ?? undefined,
      })),
      languages: languages.map((l): ComboOption => ({ value: l.nameHu, hint: l.shortCode })),
    };
  }, [lookups.data, finishes, languages]);

  const errors = validate(values);
  const shownError = (f: Field) => serverErrors[f] ?? (touched[f] ? errors[f] : undefined);

  // Duplikátum gépelés közben (S-22/EF1): csak ismert finish és nyelv mellett lehet.
  const duplicate = (() => {
    if (!finish || !language || errors.pokemon || errors.setName || errors.cardNumber) return null;
    const key = naturalKey({
      pokemon: values.pokemon,
      setName: values.setName,
      cardNumber: values.cardNumber,
      finishId: finish.id,
      languageId: language.id,
    });
    return (
      (cards.data ?? []).find(
        (c) =>
          c.id !== card?.id &&
          naturalKey({
            pokemon: c.pokemon,
            setName: c.setName,
            cardNumber: c.cardNumber,
            finishId: c.finish.id,
            languageId: c.language.id,
          }) === key,
      ) ?? null
    );
  })();
  const duplicateCard =
    duplicate ??
    (serverDuplicate !== null ? (cards.data?.find((c) => c.id === serverDuplicate) ?? null) : null);

  const invalid = Object.keys(errors).length > 0;
  const LABELS: Record<Field, string> = {
    pokemon: t.pokemon,
    setName: t.setName,
    setCode: t.setCode,
    cardNumber: t.cardNumber,
    finish: t.finish,
    language: t.language,
    note: t.note,
  };
  const missing = (Object.keys(LABELS) as Field[])
    .filter((f) => errors[f] === REQUIRED)
    .map((f) => LABELS[f]);
  const canSave = !invalid && !duplicateCard && !saving && !lookups.isPending;

  const set = <K extends keyof Values>(field: K, value: Values[K]) => {
    setValues((v) => {
      const next = { ...v, [field]: value };
      if (field === 'setName') {
        const code = uniqueSetCode(lookups.data, value as string);
        if (code && (v.setCode === '' || v.setCode === autoCode.current)) {
          next.setCode = code;
          autoCode.current = code;
        }
      }
      return next;
    });
    if (field in serverErrors) setServerErrors((e) => ({ ...e, [field]: undefined }));
    setServerDuplicate(null);
    setFailed(false);
  };
  const touch = (f: Field) => setTouched((s) => (s[f] ? s : { ...s, [f]: true }));

  async function resolveId<T extends { id: number }>(
    known: T | undefined,
    create: () => Promise<T>,
  ): Promise<number> {
    if (known) return known.id;
    try {
      return (await create()).id;
    } catch (err) {
      const existing = duplicateId(err);
      if (existing !== null) return existing;
      throw err;
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({
      pokemon: true,
      setName: true,
      setCode: true,
      cardNumber: true,
      finish: true,
      language: true,
      note: true,
    });
    if (!canSave) return;
    setSaving(true);
    setFailed(false);
    try {
      const finishId = await resolveId(finish, () =>
        createFinish.mutateAsync({ name: values.finish }),
      );
      const languageId = await resolveId(language, () =>
        createLanguage.mutateAsync({ name: values.language }),
      );
      const input: CardInput = {
        owned: values.owned,
        pokemon: values.pokemon,
        setName: values.setName,
        setCode: values.setCode,
        cardNumber: values.cardNumber,
        finishId,
        languageId,
        note: values.note,
      };
      const saved = await save.mutateAsync({ id: card?.id ?? null, input });
      onSaved(saved);
    } catch (err) {
      const dup = duplicateId(err);
      const fields = errorFields(err);
      if (dup !== null) setServerDuplicate(dup);
      else if (Object.keys(fields).length) {
        setServerErrors({
          ...(fields as Partial<Record<Field, string>>),
          finish: fields.finishId,
          language: fields.languageId,
        });
      } else setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const hintFor = (f: Field): ReactNode => {
    switch (f) {
      case 'pokemon': {
        const k = keyText(values.pokemon);
        return k && lookups.data && !lookups.data.pokemon.some((p) => keyText(p) === k)
          ? t.newPokemon
          : null;
      }
      case 'setName': {
        const k = keyText(values.setName);
        return k && lookups.data && !lookups.data.sets.some((s) => keyText(s.name) === k)
          ? t.newSet
          : null;
      }
      case 'finish':
        if (!cleanText(values.finish) || !lookups.data) return null;
        return finish ? finish.description : t.newFinish;
      case 'language':
        if (!cleanText(values.language) || !lookups.data) return null;
        return language ? null : t.newLanguage;
      default:
        return null;
    }
  };

  const row = (
    f: Field,
    label: string,
    control: (p: ControlProps) => ReactNode,
    opts: { optional?: boolean; extra?: ReactNode } = {},
  ) => {
    const err = shownError(f);
    const hint = hintFor(f);
    const describedBy =
      [err ? fid(`${f}-err`) : null, hint ? fid(`${f}-hint`) : null].filter(Boolean).join(' ') ||
      undefined;
    return (
      <div className={`field field-${f}`} data-invalid={err ? 'true' : undefined}>
        <label htmlFor={fid(f)} className="field-label">
          {label}
          {opts.optional && <span className="field-optional"> {t.optional}</span>}
        </label>
        {control({ id: fid(f), invalid: !!err, describedBy })}
        {err && (
          <p id={fid(`${f}-err`)} className="field-error">
            {err}
          </p>
        )}
        {hint && !err && (
          <p id={fid(`${f}-hint`)} className="field-hint">
            {hint}
          </p>
        )}
        {opts.extra}
      </div>
    );
  };

  const text =
    (f: Exclude<Field, 'finish' | 'language' | 'note'>, placeholder?: string) =>
    (p: ControlProps) => (
      <input
        id={p.id}
        className="input"
        value={values[f]}
        aria-invalid={p.invalid || undefined}
        aria-describedby={p.describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(e) => set(f, e.target.value)}
        onBlur={() => touch(f)}
      />
    );

  const combo =
    (f: 'pokemon' | 'setName' | 'finish' | 'language', label: string, list: ComboOption[]) =>
    (p: ControlProps) => (
      <div onBlur={() => touch(f)}>
        <Combobox
          id={p.id}
          label={label}
          value={values[f]}
          onChange={(v) => set(f, v)}
          options={list}
          invalid={p.invalid}
          describedBy={p.describedBy}
        />
      </div>
    );

  return (
    <form className="panel-form" onSubmit={submit} noValidate data-testid="card-form">
      <div className="panel-body form-body">
        {row('pokemon', t.pokemon, combo('pokemon', t.pokemon, options.pokemon))}
        {row('setName', t.setName, combo('setName', t.setName, options.sets))}
        <div className="field-pair">
          {row('setCode', t.setCode, text('setCode'), { optional: true })}
          {row('cardNumber', t.cardNumber, text('cardNumber', t.cardNumberPlaceholder))}
        </div>
        {row('finish', t.finish, combo('finish', t.finish, options.finishes))}
        {row('language', t.language, combo('language', t.language, options.languages))}

        <label className="switch form-switch">
          <input
            type="checkbox"
            role="switch"
            checked={values.owned}
            onChange={(e) => set('owned', e.target.checked)}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>{t.owned}</span>
        </label>

        {row(
          'note',
          t.note,
          (p) => (
            <textarea
              id={p.id}
              className="input textarea"
              rows={5}
              value={values.note}
              aria-invalid={p.invalid || undefined}
              aria-describedby={[p.describedBy, fid('note-count')].filter(Boolean).join(' ')}
              onChange={(e) => set('note', e.target.value)}
              onBlur={() => touch('note')}
            />
          ),
          {
            optional: true,
            extra: (
              <p
                id={fid('note-count')}
                className="field-hint field-count"
                data-over={values.note.trim().length > LIMITS.note || undefined}
              >
                <span>{t.noteHint}</span>
                <span className="num">{t.noteCount(values.note.trim().length, LIMITS.note)}</span>
              </p>
            ),
          },
        )}

        {duplicateCard && (
          <div className="form-alert" role="alert" data-testid="duplicate-warning">
            <span>
              {t.duplicate}
              <span className="mono block">{duplicateCard.displayId}</span>
            </span>
            <Link to={`/kartyak/${duplicateCard.id}`}>{t.openExisting}</Link>
          </div>
        )}
        {failed && (
          <p className="form-alert" role="alert">
            {t.saveFailed}
          </p>
        )}
      </div>
      <div className="panel-foot">
        <button type="submit" className="btn btn-primary" disabled={!canSave}>
          {saving ? t.saving : card ? t.save : t.create}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t.cancel}
        </button>
        {invalid && !duplicateCard && (
          <span className="muted small" data-testid="form-status">
            {missing.length ? t.missing(missing) : t.fixErrors}
          </span>
        )}
      </div>
    </form>
  );
}
