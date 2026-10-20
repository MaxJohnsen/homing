import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { cn } from 'cn';
import { Avatar, focusRing, ScreenHeader, Section, Tag } from '@/components/screen';
import { MoreHorizontal } from 'lucide-react';
import { RadioCards } from '@/components/radio-cards';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, type SpaceView } from '@/lib/router';
import type { SpaceData } from '@/lib/spaces';

/**
 * A space: where it sits and who it's shared with, then its parts. Overview says where it stands, Knowledge holds its pages,
 * Guidance its rules and skills, and Members who can open it. A space in your personal tree has no
 * members but you.
 */
export function Space({ space, view, children }: { space: SpaceData; view: SpaceView; children: ReactNode }) {
  const tabs = [
    { label: 'Overview', href: `/spaces/${space.id}`, current: view === 'overview' },
    { label: 'Knowledge', href: `/spaces/${space.id}/pages`, current: view === 'pages' || view === 'collections' || view === 'sources' },
    { label: 'Guidance', href: `/spaces/${space.id}/rules`, current: view === 'rules' || view === 'skills' },
    ...(space.private ? [] : [{ label: 'Members', href: `/spaces/${space.id}/members`, current: view === 'members' }]),
    // Settings appear once there's something to set: so far, the name, which admins change.
    ...(space.admin && !space.personal ? [{ label: 'Settings', href: `/spaces/${space.id}/settings`, current: view === 'settings' }] : []),
  ];
  return (
    <>
      <ScreenHeader
        title={space.name}
        meta={<Where space={space} />}
        below={
          <nav aria-label={`${space.name}’s parts`} className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1">
            {tabs.map((tab) => (
              <Link
                key={tab.label}
                // On a phone the tabs scroll sideways, so the one you're on is brought into view.
                ref={tab.current ? (link) => link?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) : undefined}
                href={tab.href}
                aria-current={tab.current ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-base font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  focusRing,
                  tab.current && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        }
      />
      {(view === 'pages' || view === 'collections' || view === 'sources') && (
        <Parts
          label="Knowledge"
          parts={[
            { label: 'Pages', href: `/spaces/${space.id}/pages`, current: view === 'pages' },
            { label: 'Collections', href: `/spaces/${space.id}/collections`, current: view === 'collections' },
            { label: 'Sources', href: `/spaces/${space.id}/sources`, current: view === 'sources' },
          ]}
        />
      )}
      {(view === 'rules' || view === 'skills') && (
        <Parts label="Guidance" parts={[{ label: 'Rules', href: `/spaces/${space.id}/rules`, current: view === 'rules' }, { label: 'Skills', href: `/spaces/${space.id}/skills`, current: view === 'skills' }]} />
      )}
      {children}
    </>
  );
}

/** Views of one part of a space, such as its pages and its sources. */
function Parts({ label, parts }: { label: string; parts: { label: string; href: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="-mt-4 flex w-fit gap-1 rounded-full bg-muted p-1">
      {parts.map((part) => (
        <Link
          key={part.label}
          href={part.href}
          aria-current={part.current ? 'page' : undefined}
          className={cn('shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground', focusRing, part.current && 'bg-card text-foreground')}
        >
          {part.label}
        </Link>
      ))}
    </nav>
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

/** A space's own settings, for its admins: its name, so far. */
export function SpaceSettings({ space, rename }: { space: SpaceData; rename: (name: string) => Promise<string | undefined> }) {
  const [name, setName] = useState(space.name);
  const [problem, setProblem] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // Shows the name as it is now, after a rename here or anywhere else.
  useEffect(() => setName(space.name), [space.name]);
  const changed = name.replace(/\s+/g, ' ').trim() !== space.name;

  const save = async () => {
    setBusy(true);
    const answer = await rename(name.trim());
    setBusy(false);
    setProblem(answer);
    setSaved(!answer);
  };

  return (
    <Section title="Name" tone="raised" className="max-w-2xl" description={space.private ? 'Only you see it.' : `Everyone who can open ${space.name} sees the new name.`}>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && name.trim()) void save();
        }}
      >
        <Input
          aria-label="Name"
          className="h-11 text-base md:text-base sm:max-w-sm"
          value={name}
          maxLength={100}
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          aria-invalid={Boolean(problem) || undefined}
          aria-describedby={problem ? 'space-name-problem' : undefined}
          disabled={busy}
        />
        <Button type="submit" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !changed || !name.trim()}>Rename</Button>
      </form>
      {problem && <FieldError id="space-name-problem">{problem}</FieldError>}
      {saved && <p role="status" className="text-sm text-muted-foreground">Renamed.</p>}
    </Section>
  );
}

/** Changing who is in a space, directly, as one of its admins. Resolves to what went wrong, if anything. */
export interface MemberActions {
  add: (email: string, admin: boolean) => Promise<{ problem: string; field?: string } | undefined>;
  change: (personId: string, change: 'make admin' | 'make member' | 'remove') => Promise<string | undefined>;
}

/**
 * Who can open the space, and who looks after it. Its admins add someone by email, saying what
 * they'll see, make someone an admin or a member, and remove them, which asks first, in place.
 * People with access through a space above are changed there.
 */
export function Members({ space, actions }: { space: SpaceData; actions?: MemberActions }) {
  const parent = space.path.at(-1);
  const managing = Boolean(actions && space.admin && !space.private);
  return (
    <div className="flex flex-col gap-10">
      {managing && <AddMember space={space} add={actions!.add} />}
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
            <MemberRow key={member.id} space={space} member={member} change={managing && member.member ? actions!.change : undefined} />
          ))}
        </ul>
        {space.reachedFromAbove && <p className="text-sm text-muted-foreground">People who can open the space above it have access too.</p>}
      </Section>
    </div>
  );
}

function MemberRow({ space, member, change }: { space: SpaceData; member: SpaceData['members'][number]; change?: MemberActions['change'] }) {
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const run = async (what: 'make admin' | 'make member' | 'remove') => {
    setBusy(true);
    const answer = await change!(member.id, what);
    setBusy(false);
    setProblem(answer);
    if (!answer) setRemoving(false);
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl px-3 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} className="size-10 text-sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-semibold">{member.name}{member.you && ' (you)'}</span>
          {!member.member && member.through && <span className="truncate text-sm text-muted-foreground">Through {member.through}</span>}
        </div>
        {member.admin && <Tag>Admin</Tag>}
        {change && !removing && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Change ${member.you ? 'your' : `${member.name}’s`} access`} disabled={busy} className={cn('rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground', focusRing)}>
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {member.admin
                ? <DropdownMenuItem onClick={() => run('make member')}>{member.you ? 'Stop being an admin' : 'Make a member, not an admin'}</DropdownMenuItem>
                : <DropdownMenuItem onClick={() => run('make admin')}>Make an admin</DropdownMenuItem>}
              <DropdownMenuItem onClick={() => setRemoving(true)}>{member.you ? `Leave ${space.name}` : `Remove from ${space.name}`}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {removing && (
        <div className="flex flex-col gap-3 rounded-xl bg-muted p-3">
          <p className="text-sm">
            {member.you ? `You lose access to ${space.name} and the spaces in it at once.` : `${member.name} loses access to ${space.name} and the spaces in it at once.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy} onClick={() => run('remove')}>{member.you ? 'Leave' : 'Remove'}</Button>
            <Button variant="outline" disabled={busy} onClick={() => setRemoving(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </li>
  );
}

/** Adding someone who uses Homing, by email, saying first what they'll see. */
function AddMember({ space, add }: { space: SpaceData; add: MemberActions['add'] }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [added, setAdded] = useState<string>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const answer = await add(email.trim(), role === 'admin');
    setBusy(false);
    setProblem(answer ? { field: answer.field, message: answer.problem } : undefined);
    if (!answer) {
      setAdded(email.trim());
      setEmail('');
      setRole('member');
    }
  };

  return (
    <Section title="Add someone" tone="raised" className="max-w-2xl" description={`They’ll see ${space.name}’s shared knowledge and rules, including what was shared before they joined, and the spaces in it that aren’t closed.`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (email.trim()) void save();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-member-email" className="text-base">Their email</Label>
          <Input
            id="add-member-email"
            type="email"
            className="h-11 text-base md:text-base"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setAdded(undefined);
            }}
            placeholder="The address they sign in to Homing with"
            aria-invalid={problem?.field === 'email' || undefined}
            aria-describedby={problem ? 'add-member-problem' : undefined}
            disabled={busy}
          />
        </div>
        <RadioCards
          label="Their role"
          surface="muted"
          value={role}
          onChange={setRole}
          disabled={busy}
          options={[
            { value: 'member', label: 'Member', detail: 'Reads and adds to what’s known.' },
            { value: 'admin', label: 'Admin', detail: 'Also changes its shared rules and who’s in it.' },
          ]}
        />
        {problem && <FieldError id="add-member-problem">{problem.message}</FieldError>}
        {added && <p role="status" className="text-sm text-muted-foreground">Added. {added} sees {space.name} from now on.</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !email.trim()}>Add to {space.name}</Button>
        </div>
      </form>
    </Section>
  );
}
