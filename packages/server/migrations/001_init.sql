-- GMS kezdeti séma (technikai spec 4.1).

CREATE TABLE language (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  name_hu     TEXT NOT NULL,
  short_code  TEXT NOT NULL UNIQUE,
  image_code  TEXT,
  sort_order  INTEGER NOT NULL
);

CREATE TABLE finish (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order  INTEGER NOT NULL
);

CREATE TABLE card (
  id               INTEGER PRIMARY KEY,
  owned            INTEGER NOT NULL DEFAULT 0 CHECK (owned IN (0,1)),
  pokemon          TEXT NOT NULL,
  set_name         TEXT NOT NULL,
  set_code         TEXT,
  card_number      TEXT NOT NULL,
  finish_id        INTEGER NOT NULL REFERENCES finish(id),
  language_id      INTEGER NOT NULL REFERENCES language(id),
  note             TEXT NOT NULL DEFAULT '',
  display_id       TEXT NOT NULL,
  image_file       TEXT,
  image_status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (image_status IN ('pending','exact','fallback','none','error')),
  image_lang_id    INTEGER REFERENCES language(id),
  image_source     TEXT,
  image_checked_at TEXT,
  owned_changed_at TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  natural_key      TEXT NOT NULL UNIQUE
);

CREATE INDEX card_language ON card(language_id);
CREATE INDEX card_pokemon  ON card(pokemon);
CREATE INDEX card_set      ON card(set_name);

CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE backup_log (
  id          INTEGER PRIMARY KEY,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL CHECK (status IN ('ok','error')),
  target      TEXT,
  message     TEXT
);

-- Kezdeti nyelvtábla (technikai spec 4.3), a megadott sorrendben.
INSERT INTO language (name, name_hu, short_code, image_code, sort_order) VALUES
  ('English',             'Angol',                    'EN',  'en',    1),
  ('French',              'Francia',                  'FR',  'fr',    2),
  ('German',              'Német',                    'DE',  'de',    3),
  ('Italian',             'Olasz',                    'IT',  'it',    4),
  ('Spanish',             'Spanyol',                  'ES',  'es',    5),
  ('Spanish (LATAM)',     'Spanyol (latin-amerikai)', 'LA',  'es-mx', 6),
  ('Portuguese',          'Portugál',                 'PT',  'pt',    7),
  ('Japanese',            'Japán',                    'JA',  'ja',    8),
  ('Korean',              'Koreai',                   'KO',  'ko',    9),
  ('Simplified Chinese',  'Egyszerűsített kínai',     'ZHS', 'zh-cn', 10),
  ('Traditional Chinese', 'Hagyományos kínai',        'ZHT', 'zh-tw', 11),
  ('Thai',                'Thai',                     'TH',  'th',    12),
  ('Indonesian',          'Indonéz',                  'ID',  'id',    13);
