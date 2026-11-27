/** Kezdeti nyelvtábla (technikai spec 4.3). A sorrend a szűrőkben és a dashboardon is ez. */
export interface LanguageSeed {
  name: string;
  nameHu: string;
  shortCode: string;
  imageCode: string | null;
}

export const INITIAL_LANGUAGES: readonly LanguageSeed[] = [
  { name: 'English', nameHu: 'Angol', shortCode: 'EN', imageCode: 'en' },
  { name: 'French', nameHu: 'Francia', shortCode: 'FR', imageCode: 'fr' },
  { name: 'German', nameHu: 'Német', shortCode: 'DE', imageCode: 'de' },
  { name: 'Italian', nameHu: 'Olasz', shortCode: 'IT', imageCode: 'it' },
  { name: 'Spanish', nameHu: 'Spanyol', shortCode: 'ES', imageCode: 'es' },
  {
    name: 'Spanish (LATAM)',
    nameHu: 'Spanyol (latin-amerikai)',
    shortCode: 'LA',
    imageCode: 'es-mx',
  },
  { name: 'Portuguese', nameHu: 'Portugál', shortCode: 'PT', imageCode: 'pt' },
  { name: 'Japanese', nameHu: 'Japán', shortCode: 'JA', imageCode: 'ja' },
  { name: 'Korean', nameHu: 'Koreai', shortCode: 'KO', imageCode: 'ko' },
  {
    name: 'Simplified Chinese',
    nameHu: 'Egyszerűsített kínai',
    shortCode: 'ZHS',
    imageCode: 'zh-cn',
  },
  {
    name: 'Traditional Chinese',
    nameHu: 'Hagyományos kínai',
    shortCode: 'ZHT',
    imageCode: 'zh-tw',
  },
  { name: 'Thai', nameHu: 'Thai', shortCode: 'TH', imageCode: 'th' },
  { name: 'Indonesian', nameHu: 'Indonéz', shortCode: 'ID', imageCode: 'id' },
];
