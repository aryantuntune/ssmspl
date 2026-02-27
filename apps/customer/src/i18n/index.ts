import { store } from '../store';
import en from './en';
import mr from './mr';

const translations: Record<string, Record<string, string>> = { en, mr };

/**
 * Translate a key using the current Redux language setting.
 * Falls back to English, then to the raw key.
 */
export function t(key: string): string {
  const lang = store.getState().app.language;
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

export { en, mr };
