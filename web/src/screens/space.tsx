import { Fragment } from 'react';
import { cn } from 'cn';
import { Avatar, focusRing, ScreenHeader, Section, Tag } from '@/components/screen';
import { Link } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/** A space: where it sits, who it's shared with, and who can open it. */
export function Space({ space }: { space: SpaceData }) {
  return (
    <>
      <ScreenHeader title={space.name} meta={<Where space={space} />} />
      {!space.private && <Members space={space} />}
    </>
  );
}

/** "In Acme. Shared with its 4 members, not with everyone in Acme." */
function Where({ space }: { space: SpaceData }) {
  const parent = space.path.at(-1);
  const own = space.members.filter((member) => member.member).length;
  const onlyYou = own === 1 && space.members.some((member) => member.member && member.you);
  // Members of this space who aren't also in the one above it.
  const added = space.members.filter((member) => member.member && !member.through).length;
  if (space.personal) return <>Your personal space. Its rules follow you everywhere, and nobody else sees what’s in it.</>;
  const where = space.path.length > 0 && (
    <>
      In{' '}
      {/* Nearest first: "In Northwind, in Acme." */}
      {[...space.path].reverse().map((above, index) => (
        <Fragment key={above.id}>
          {index > 0 && ', in '}
          <Link href={`/spaces/${above.id}`} className={cn('rounded-sm font-medium text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing)}>
            {above.name}
          </Link>
        </Fragment>
      ))}
      .{' '}
    </>
  );
  if (space.private) return <>{where}It’s in your personal space, so only you have it.</>;
  if (space.closed && parent) return <>{where}{onlyYou ? 'Only you have it so far' : `Shared with its ${members(own)}`}, not everyone in {parent.name}.</>;
  if (parent) return <>{where}Shared with everyone in {parent.name}{added > 0 && `, and ${added === 1 ? '1 more person' : `${added} more people`}`}.</>;
  if (space.reachedFromAbove) return <>Shared with {onlyYou ? 'you' : `its ${members(own)}`}, and with people who can open the space above it.</>;
  return <>{onlyYou ? 'Only you have it so far.' : `Shared with its ${members(own)}.`}</>;
}

function members(n: number) {
  return n === 1 ? '1 member' : `${n} members`;
}

/** Who can open the space, and who looks after it. */
function Members({ space }: { space: SpaceData }) {
  const parent = space.path.at(-1);
  return (
    <Section
      title="Members"
      description={
        space.closed && parent
          ? `${space.name} is closed. People in ${parent.name} have access only if they’re added here. Admins change its shared rules, and who has access.`
          : `They see ${space.name}’s shared knowledge and rules, and the spaces in it that aren’t closed. Admins change its shared rules, and who has access.`
      }
    >
      <ul className="-mx-3 grid gap-1 sm:grid-cols-2">
        {space.members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 rounded-xl px-3 py-3">
            <Avatar name={member.name} className="size-10 text-sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-semibold">{member.name}{member.you && ' (you)'}</span>
              {!member.member && member.through && <span className="truncate text-sm text-muted-foreground">Through {member.through}</span>}
            </div>
            {member.admin && <Tag>Admin</Tag>}
          </li>
        ))}
      </ul>
      {space.reachedFromAbove && <p className="text-sm text-muted-foreground">People who can open the space above it have access too.</p>}
    </Section>
  );
}
