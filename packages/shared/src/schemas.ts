import { z } from 'zod';
import { cleanText } from './normalize.js';

/** Mezőkorlátok (technikai spec 6.). */
export const LIMITS = {
  text: 100,
  setCode: 20,
  note: 5000,
  description: 1000,
} as const;

const requiredText = z
  .string()
  .transform(cleanText)
  .pipe(
    z.string().min(1, 'Kötelező mező.').max(LIMITS.text, `Legfeljebb ${LIMITS.text} karakter.`),
  );

const optionalSetCode = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null ? null : cleanText(v) || null))
  .pipe(z.string().max(LIMITS.setCode, `Legfeljebb ${LIMITS.setCode} karakter.`).nullable());

/** Egy kártya szerkeszthető mezői (közös a szerver és a kliens között). */
export const cardInputSchema = z.strictObject({
  owned: z.boolean().default(false),
  pokemon: requiredText,
  setName: requiredText,
  setCode: optionalSetCode,
  cardNumber: requiredText,
  finishId: z.number().int().positive(),
  languageId: z.number().int().positive(),
  note: z
    .string()
    .default('')
    .transform((v) => v.trim())
    .pipe(z.string().max(LIMITS.note, `Legfeljebb ${LIMITS.note} karakter.`)),
});

export type CardInput = z.input<typeof cardInputSchema>;
export type CardFields = z.output<typeof cardInputSchema>;

/** A kártya szerkeszthető mezőinek nevei (PATCH: ezek közül bármelyik részhalmaza). */
export const CARD_FIELDS = [
  'owned',
  'pokemon',
  'setName',
  'setCode',
  'cardNumber',
  'finishId',
  'languageId',
  'note',
] as const satisfies readonly (keyof CardFields)[];

/** A képet és az azonosítót befolyásoló mezők (S-23/EF3). */
export const IMAGE_FIELDS = [
  'pokemon',
  'setName',
  'cardNumber',
  'finishId',
  'languageId',
] as const satisfies readonly (keyof CardFields)[];

const optionalDescription = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null ? null : v.trim() || null))
  .pipe(
    z.string().max(LIMITS.description, `Legfeljebb ${LIMITS.description} karakter.`).nullable(),
  );

/** Új nyomási változat (S-64). */
export const finishInputSchema = z
  .object({ name: requiredText, description: optionalDescription })
  .strict();
export type FinishInput = z.input<typeof finishInputSchema>;

/** Nyomási változat leírásának módosítása (S-64/EF1). */
export const finishPatchSchema = z.object({ description: optionalDescription }).strict();

/** Új nyelv (technikai spec 4.1): a magyar név és a rövid kód elhagyható. */
export const languageInputSchema = z
  .object({
    name: requiredText,
    nameHu: z
      .string()
      .optional()
      .transform((v) => (v == null ? undefined : cleanText(v) || undefined))
      .pipe(z.string().max(LIMITS.text).optional()),
    shortCode: z
      .string()
      .optional()
      .transform((v) => (v == null ? undefined : cleanText(v).toUpperCase() || undefined))
      .pipe(
        z
          .string()
          .regex(/^[A-Z0-9]{1,6}$/u, 'Legfeljebb 6 betű vagy szám.')
          .optional(),
      ),
  })
  .strict();
export type LanguageInput = z.input<typeof languageInputSchema>;

/** Zod hibák mezőnként (az első üzenet mezőnként), a `400 VALIDATION` válasz `details` része. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length ? String(issue.path[0]) : '_';
    if (!(field in out)) {
      out[field] =
        issue.code === 'unrecognized_keys'
          ? `Ismeretlen mező: ${issue.keys.join(', ')}`
          : issue.code === 'invalid_type'
            ? field === '_' || issue.input === undefined
              ? 'Kötelező mező.'
              : 'Hibás érték.'
            : issue.message;
    }
  }
  return out;
}

/**
 * Rövid nyelvkód egy új nyelvhez: a név első két betűje ékezet nélkül, nagybetűvel;
 * foglalt kódnál hosszabb előtag, végül sorszám.
 */
export function deriveShortCode(name: string, taken: ReadonlySet<string>): string {
  const letters =
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z0-9]/gu, '')
      .toUpperCase() || 'X';
  for (let len = 2; len <= Math.min(letters.length, 4); len++) {
    const code = letters.slice(0, len);
    if (!taken.has(code)) return code;
  }
  const stem = letters.slice(0, 2);
  for (let n = 2; ; n++) if (!taken.has(`${stem}${n}`)) return `${stem}${n}`;
}
