-- Your assistant changes your own private text when you ask (#120, spec §3).
--
-- What a person wrote stays protected from agents, with one exception: on
-- the person's own private side, their assistant may change what they wrote
-- themselves, for them. Homing can't tell whether they asked, and accepts
-- that only because the change is private, recorded and can be undone. The
-- text stays theirs: the item keeps them as its author, the new version
-- records which assistant made the change, and the earlier one stays in the
-- history. Replacing it as no longer true stays theirs to do, and so does
-- everything a person wrote that is shared, someone else's or imported. A
-- space's routine, which acts without a person, never changes what a person
-- wrote, with or without an agent.

-- The assistant that made this version for the person who wrote the item,
-- who stays its author. Null when its author made it.
alter table content add column edit_agent text;
alter table revisions add column edit_agent text;

create or replace function keep_history() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  -- A person's assistant changing, on their private side, text they wrote themselves here.
  for_them boolean := current_agent() is not null and current_person_id() is not null
    and old.kind = 'text' and old.private_to = current_person_id()
    and old.written_by = current_person_id() and old.agent is null and not coalesce(old.imported ? 'author', false);
begin
  if by_person(old.written_by, old.agent, old.imported) and (current_agent() is not null or current_space_id() is not null) and not for_them then
    raise exception 'agents never rewrite what people wrote' using errcode = 'insufficient_privilege';
  end if;
  insert into revisions (content_id, space_id, private_to, body, written_by, agent, edit_agent, written_at, imported)
  values (old.id, old.space_id, old.private_to, old.body, old.written_by, old.agent, old.edit_agent, old.updated_at, imported_author(old.imported));
  if for_them then
    -- It stays theirs, changed by their assistant.
    new.written_by := old.written_by;
    new.agent := null;
    new.edit_agent := current_agent();
  else
    new.written_by := current_person_id();
    new.agent := current_agent();
    new.edit_agent := null;
  end if;
  new.updated_at := clock_timestamp();
  new.imported := old.imported - 'author';
  return new;
end
$$;

-- Nobody but a person replaces what a person wrote, the person's own
-- assistant included, and a space's routine doesn't either.
create or replace function check_replacement() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if not exists (
    select from content replaced
    where replaced.id = new.supersedes
      and case new.kind
        when 'text' then
          replaced.kind = 'text'
          and (new.private_to is not null or replaced.private_to is null)
          and ((current_agent() is null and current_space_id() is null) or not by_person(replaced.written_by, replaced.agent, replaced.imported))
        when 'removed' then
          replaced.private_to is not distinct from new.private_to
          and replaced.reaches_down = new.reaches_down
        else false
      end
  ) then
    raise exception 'that item can''t be replaced' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

-- A shared copy keeps who wrote its private original, and the assistant
-- that changed it for them, if one did.
create function copy_edit_agent() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  new.edit_agent := (select o.edit_agent from content o where o.id = new.published_from);
  return new;
end
$$;

create trigger copy_edit_agent
before insert on content
for each row when (new.published_from is not null)
execute function copy_edit_agent();
