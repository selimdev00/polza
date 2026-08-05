-- Схема на три слоя:
--   staging_companies - всё как пришло, без ограничений, ничего не теряется
--   companies         - канонические данные: типы, ограничения, дедупликация
--   ingest_issues     - журнал всех починок, слияний и отбрасываний
-- Такое разделение позволяет не выкидывать плохие строки молча:
-- каждое отклонение остаётся в базе и попадает в ANOMALIES.md.

DROP TABLE IF EXISTS ingest_issues;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS staging_companies;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE staging_companies (
  id            bigserial   PRIMARY KEY,
  source_file   text        NOT NULL,
  source_row    integer     NOT NULL,
  ingested_at   timestamptz NOT NULL DEFAULT now(),
  raw           jsonb       NOT NULL,
  ext_id        text,
  name          text,
  category      text,
  city          text,
  address       text,
  rating        text,
  reviews_count text,
  site          text,
  phone         text
);

CREATE INDEX staging_companies_source_idx ON staging_companies (source_file, source_row);

CREATE TABLE companies (
  id            bigserial    PRIMARY KEY,
  ext_id        text         NOT NULL,
  name          text         NOT NULL,
  -- category допускает NULL намеренно: в одной строке review.csv поля
  -- сдвинуты на колонку влево и значение категории потеряно безвозвратно.
  -- Честнее оставить NULL, чем придумать категорию.
  category      text,
  city          text         NOT NULL,
  address       text,
  rating        numeric(2,1) CHECK (rating >= 0 AND rating <= 5),
  reviews_count integer      NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
  site          text,
  phone         text,
  phone_raw     text,
  dedup_key     text         NOT NULL,
  source        text         NOT NULL CHECK (source IN ('api_pages', 'review_csv')),
  first_seen_at timestamptz  NOT NULL DEFAULT now(),
  last_seen_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX companies_ext_id_uq     ON companies (ext_id);
CREATE UNIQUE INDEX companies_dedup_key_uq  ON companies (dedup_key);
CREATE INDEX        companies_city_idx      ON companies (city);
CREATE INDEX        companies_category_idx  ON companies (category);
-- Триграммный GIN нужен для поиска по подстроке (ILIKE '%...%') на странице
-- /companies. Без него это seq scan; с ним поиск остаётся индексным и на
-- миллионах строк.
CREATE INDEX companies_name_trgm_idx ON companies USING gin (name gin_trgm_ops);

CREATE TABLE ingest_issues (
  id          bigserial   PRIMARY KEY,
  staging_id  bigint      REFERENCES staging_companies(id),
  source_file text        NOT NULL,
  source_row  integer     NOT NULL,
  ext_id      text,
  disposition text        NOT NULL CHECK (disposition IN ('row_dropped', 'row_merged', 'field_nulled', 'field_repaired')),
  code        text        NOT NULL,
  field       text,
  raw_value   text,
  new_value   text,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ingest_issues_code_idx ON ingest_issues (code);
CREATE INDEX ingest_issues_source_idx ON ingest_issues (source_file);
