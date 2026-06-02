-- On Duty Helper — databasetabel
-- MySQL / MariaDB. De app voegt automatisch wekelijkse rijen toe en leest
-- deze tabel; je telefoonsysteem (bv. 3CX) kan dezelfde tabel uitlezen voor
-- de doorschakelbestemming.
--
-- Gebruik:
--   mysql -u <user> -p <database> < sql/period_config.sql
--
-- De tabelnaam (period_config) moet overeenkomen met DB_TABLE in je .env.

CREATE TABLE IF NOT EXISTS period_config (
  pc_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pc_startterm   DATETIME     NOT NULL,                 -- start, bv. maandag 12:00:00
  pc_endterm     DATETIME     NOT NULL,                 -- einde, bv. volgende maandag 11:59:00
  pc_period      SMALLINT     NOT NULL DEFAULT 0,
  pc_description VARCHAR(45)  DEFAULT NULL,             -- (voor)naam van de bereikbare persoon
  pc_telnum      VARCHAR(15)  NOT NULL,                 -- telefoonnummer, bv. 0612345678
  PRIMARY KEY (pc_id)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

-- "Wie is er nu bereikbaar?" — handige query (ook bruikbaar vanuit 3CX):
--   SELECT pc_description, pc_telnum
--     FROM period_config
--    WHERE NOW() BETWEEN pc_startterm AND pc_endterm
--    ORDER BY pc_startterm DESC
--    LIMIT 1;
