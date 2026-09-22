-- RotaCall — databasetabel voor PostgreSQL
-- De app maakt deze tabel bij het opstarten zelf aan als hij ontbreekt; dit
-- bestand is handig als je hem liever vooraf (of met andere rechten) aanmaakt.
--
-- Gebruik:
--   psql -U <user> -d <database> -f sql/period_config.pgsql
--
-- De tabelnaam (period_config) moet overeenkomen met DB_TABLE in je .env.

CREATE TABLE IF NOT EXISTS period_config (
  pc_id          SERIAL PRIMARY KEY,
  pc_startterm   TIMESTAMP    NOT NULL,              -- start, bv. maandag 12:00:00
  pc_endterm     TIMESTAMP    NOT NULL,              -- einde, bv. volgende maandag 11:59:00
  pc_period      SMALLINT     NOT NULL DEFAULT 0,
  pc_description VARCHAR(45),                        -- (voor)naam van de bereikbare persoon
  pc_telnum      VARCHAR(15)  NOT NULL               -- telefoonnummer, bv. 0612345678
);

-- "Wie is er nu bereikbaar?" — handige query (ook bruikbaar vanuit 3CX):
--   SELECT pc_description, pc_telnum
--     FROM period_config
--    WHERE NOW() BETWEEN pc_startterm AND pc_endterm
--    ORDER BY pc_startterm DESC
--    LIMIT 1;
