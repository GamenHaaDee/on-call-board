/**
 * De app schrijft in een tabel die vaak al bestaat: die van het telefoonsysteem.
 * Daarom wordt bij het verbinden gecontroleerd of de kolommen kloppen, zodat
 * een verkeerde tabelnaam meteen een leesbare melding geeft in plaats van een
 * SQL-fout bij de eerste schrijfactie.
 */
export const REQUIRED_COLUMNS = [
  "pc_id",
  "pc_startterm",
  "pc_endterm",
  "pc_period",
  "pc_description",
  "pc_telnum",
] as const;

export function assertColumns(table: string, columns: string[]): void {
  if (columns.length === 0) {
    throw new Error(`Tabel "${table}" bestaat niet of is niet toegankelijk.`);
  }

  const found = new Set(columns.map((c) => c.toLowerCase()));
  const missing = REQUIRED_COLUMNS.filter((c) => !found.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Tabel "${table}" mist de kolom(men): ${missing.join(", ")}. ` +
        `De app verwacht: ${REQUIRED_COLUMNS.join(", ")}.`
    );
  }
}
