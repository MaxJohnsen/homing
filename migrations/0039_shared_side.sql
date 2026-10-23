-- A person's assistant writes only on that person's private side (#118, spec
-- §3 and §5). What it learns or corrects reaches the others when the person
-- shares it, which only a person editing directly does (publish_item).
-- Homing's own code already keeps assistants there; now the store refuses
-- on its own, as it does for guidance and sharing. A space's routine, which
-- tidies the shared side, and people editing directly are unaffected.

-- Nothing new on the shared side, and no change to what's there, while an
-- agent acts for a person.
create function check_shared_side() returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if current_agent() is not null and current_person_id() is not null then
    raise exception 'an assistant writes only on the private side of the person it acts for' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

-- A shared item, or a change to one.
create trigger check_shared_side
before insert or update on content
for each row when (new.private_to is null)
execute function check_shared_side();

-- A shared source, which everyone in the space finds.
create trigger check_shared_side
before insert on sources
for each row when (new.private_to is null)
execute function check_shared_side();

-- A page put in a shared collection, or taken out of one, for everyone.
create trigger check_shared_side
before insert on gathered
for each row when (new.private_to is null)
execute function check_shared_side();

create trigger check_shared_side_out
before delete on gathered
for each row when (old.private_to is null)
execute function check_shared_side();

-- Nor a source on a shared item, which would change what it rests on for everyone.
alter policy visible on citations
using (exists (select from content where content.id = citations.content_id))
with check (
  exists (
    select from content
    where content.id = citations.content_id and content.kind = 'text' and content.written_by is not distinct from current_person_id()
      and (content.private_to is not null or current_agent() is null or current_person_id() is null)
  )
  and exists (select from sources where sources.id = citations.source_id)
);
