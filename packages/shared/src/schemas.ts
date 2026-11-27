import { z } from 'zod';
import { cleanText } from './normalize.js';

/** Mezőkorlátok (technikai spec 6.). */
export const LIMITS = {
  text: 100,
  setCode: 20,
  note: 5000,
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
export const cardInputSchema = z.object({
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
