-- Reading a connected mailbox for its owner (#125, spec §7, §8 and §10).
-- Homing searches and reads the person's mail live, as them, through their
-- own connection, and records each use. What it keeps from an email it read
-- itself says so, so it's never taken for what an assistant reported.

-- Which connection Homing read a source through, when it read it itself,
-- such as an email in the person's mailbox. Null for what a person or an
-- assistant gave Homing.
alter table sources add column read_through uuid references connections (id) on delete set null;

grant insert (read_through) on sources to homing_app;

-- Only on the person's own private side, in the space where the mailbox it
-- came from is theirs, through their own connection while it works.
create policy read_through on sources as restrictive for insert
with check (
  read_through is null
  or (
    private_to = current_person_id()
    and exists (
      select from places p join connections c on c.id = p.connection_id
      where c.id = sources.read_through and p.space_id = sources.space_id
        and p.private_to = current_person_id() and c.person_id = current_person_id()
        and p.removed_at is null and c.revoked_at is null and c.status = 'connected'
    )
  )
);

-- Each use of a connection: which one, through which place, what Homing did
-- with it, and for which assistant. Only its owner sees it, as with the
-- connection itself.
create table connection_uses (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections (id) on delete cascade,
  place_id uuid not null references places (id) on delete cascade,
  space_id uuid not null references spaces (id),
  private_to uuid not null references people (id) on delete cascade,
  operation text not null check (operation in ('search mail', 'read mail')),
  -- The assistant it was for, such as Claude.
  agent text,
  used_at timestamptz not null default clock_timestamp()
);

create index connection_uses_connection on connection_uses (connection_id, used_at);
create index connection_uses_space on connection_uses (space_id);
create index connection_uses_place on connection_uses (place_id);
create index sources_read_through on sources (read_through) where read_through is not null;

alter table connection_uses enable row level security;

create policy own on connection_uses for select
using (private_to = current_person_id());

-- Recorded by the person's own use of their place, as it is used.
create policy record on connection_uses for insert
with check (
  private_to = current_person_id()
  and exists (
    select from places p
    where p.id = connection_uses.place_id and p.connection_id = connection_uses.connection_id
      and p.space_id = connection_uses.space_id and p.private_to = current_person_id() and p.removed_at is null
  )
);

grant select, insert (connection_id, place_id, space_id, private_to, operation, agent) on connection_uses to homing_app;
