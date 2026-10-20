-- Search finds tasks too (spec §10), so an assistant can find "my task about
-- the timeline" without knowing its space: by its title and description, the
-- way it finds knowledge. The access rule on tasks applies as before.

alter table tasks
  add column search tsvector generated always as (to_tsvector('simple', title || ' ' || coalesce(description, ''))) stored;

create index tasks_search on tasks using gin (search);
