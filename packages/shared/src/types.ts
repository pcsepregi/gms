/** Az API által visszaadott alakok. */

export type ImageStatus = 'pending' | 'exact' | 'fallback' | 'none' | 'error';

export interface Language {
  id: number;
  name: string;
  nameHu: string;
  shortCode: string;
  imageCode: string | null;
  sortOrder: number;
}

export interface Finish {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface Card {
  id: number;
  displayId: string;
  owned: boolean;
  pokemon: string;
  setName: string;
  setCode: string | null;
  cardNumber: string;
  finish: Pick<Finish, 'id' | 'name' | 'description'>;
  language: Pick<Language, 'id' | 'name' | 'nameHu' | 'shortCode' | 'sortOrder'>;
  note: string;
  image: { status: ImageStatus; url: string | null; languageId: number | null };
  createdAt: string;
  updatedAt: string;
}

export interface Lookups {
  languages: Language[];
  finishes: Finish[];
  pokemon: string[];
  sets: { name: string; codes: string[] }[];
}

export interface ImportLanguageCount {
  name: string;
  nameHu: string;
  shortCode: string;
  owned: number;
  all: number;
}

export interface ImportSummary {
  importedAt: string;
  sourceFile: string;
  total: number;
  owned: number;
  missing: number;
  byLanguage: ImportLanguageCount[];
  finishesFromDictionary: number;
  newFinishes: string[];
  needsCheck: number;
  warnings: string[];
}

export interface Health {
  ok: boolean;
  version: string;
  dbPath: string;
  appTitle: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
