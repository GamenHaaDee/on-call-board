import { nl, enUS, de, fr, es, it, pt, pl } from "date-fns/locale";
import type { Locale } from "date-fns";

const MAP: Record<string, Locale> = { nl, en: enUS, de, fr, es, it, pt, pl };

/** date-fns locale voor de actieve i18n-taal (valt terug op Engels). */
export function dateLocale(lng: string): Locale {
  return MAP[lng.slice(0, 2)] ?? enUS;
}
