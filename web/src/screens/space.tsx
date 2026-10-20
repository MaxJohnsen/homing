import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from 'cn';
import { Avatar, focusRing, ScreenHeader, Section, Tag } from '@/components/screen';
import { MoreHorizontal } from 'lucide-react';
import { ProposedChange } from '@/components/proposed-change';
import { RadioCards } from '@/components/radio-cards';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, navigate, type SpaceView } from '@/lib/router';
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
    { label: 'Tasks', href: `/spaces/${space.id}/tasks`, current: view === 'tasks' },
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

/** What sharing a space from your personal tree would do: the rules that stop applying, and where it can go. */
export interface ConversionData {
  rulesLeaving: { kind: 'requirement' | 'preference'; text: string; from: string | null }[];
  skillsLeaving: { name: string; from: string | null }[];
  places: { id: string; name: string; label: string; people: number; above: boolean }[];
}

/** Sharing a space from your personal tree. Resolves to what went wrong, if anything. */
export interface ShareSpaceActions {
  conversion: () => Promise<ConversionData | undefined>;
  convert: (input: { in: string | null; closed: boolean; rules: 'keep' | 'share' | 'drop' }) => Promise<string | undefined>;
}

/**
 * A space's own settings, for its admins: its name, and for a space in your personal tree, sharing
 * it with others. A shared space you moved from your personal tree says where it came from, to you.
 */
export function SpaceSettings({ space, rename, share }: { space: SpaceData; rename: (name: string) => Promise<string | undefined>; share?: ShareSpaceActions }) {
  const [name, setName] = useState(space.name);
  const [problem, setProblem] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
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
    <div className="flex flex-col gap-10">
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
          {/* One main action at a time: while sharing, that's the one. */}
          <Button type="submit" variant={sharing ? 'outline' : 'default'} size="lg" className="h-11 text-base sm:px-5" disabled={busy || !changed || !name.trim()}>Rename</Button>
        </form>
        {problem && <FieldError id="space-name-problem">{problem}</FieldError>}
        {saved && <p role="status" className="text-sm text-muted-foreground">Renamed.</p>}
        {space.movedFrom && (
          <p className="text-sm text-muted-foreground">
            You moved it here from {space.movedFrom.name === 'your personal space' ? 'your personal space' : `${space.movedFrom.name}, in your personal space`}. Only you see this.
          </p>
        )}
      </Section>
      {share && space.private && !space.personal && (
        <ShareSpace space={space} share={share} open={sharing} onOpen={setSharing} />
      )}
    </div>
  );
}

/**
 * Sharing a space from your personal tree with others (spec §1): it leaves your personal space as
 * a space of its own, or goes in a shared space you're an admin of. It says who will have it, that
 * everything in it stays yours until you share it, and what becomes of the rules it had there.
 */
function ShareSpace({ space, share, open, onOpen }: { space: SpaceData; share: ShareSpaceActions; open: boolean; onOpen: (open: boolean) => void }) {
  const [conversion, setConversion] = useState<ConversionData | null>();
  const [inside, setInside] = useState('');
  const [closed, setClosed] = useState(false);
  const [rules, setRules] = useState<'keep' | 'share' | 'drop'>('keep');
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || conversion !== undefined) return;
    let live = true;
    share.conversion().then((found) => live && setConversion(found ?? null));
    return () => {
      live = false;
    };
  }, [open, conversion, share]);
  const parent = conversion?.places.find((place) => place.id === inside);
  const others = parent ? parent.people - 1 : 0;
  const opener = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLDivElement>(null);
  // Opening takes you into the form; closing it brings you back to where you were.
  useEffect(() => {
    if (open && conversion) first.current?.querySelector<HTMLElement>('select, button')?.focus();
  }, [open, conversion]);
  const close = () => {
    onOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };

  const convert = async () => {
    setBusy(true);
    const answer = await share.convert({ in: parent?.id ?? null, closed: Boolean(parent) && closed, rules });
    setBusy(false);
    if (answer) setProblem(answer);
    else navigate(`/spaces/${space.id}/members`);
  };

  return (
    <Section
      title="Share with others"
      tone="raised"
      className="max-w-2xl"
      description={`${space.name} is in your personal space, so only you have it. Shared, it leaves your personal space and you can add people. Everything in it, and in the spaces under it, stays only yours until you share it.`}
    >
      {!open ? (
        <div>
          <Button ref={opener} variant="outline" onClick={() => onOpen(true)}>Share {space.name}</Button>
        </div>
      ) : conversion === undefined ? (
        <p role="status" className="text-sm text-muted-foreground">Getting what would change…</p>
      ) : conversion === null ? (
        <p className="text-base">{space.name} can’t be shared from here.</p>
      ) : (
        <div ref={first} className="flex flex-col gap-4">
          {conversion.places.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="share-space-in" className="text-base">Where does it go?</Label>
              <select
                id="share-space-in"
                value={inside}
                onChange={(event) => setInside(event.target.value)}
                disabled={busy}
                className={cn('h-11 w-full rounded-4xl border border-input bg-card px-3.5 text-base disabled:opacity-50 sm:max-w-md', focusRing)}
              >
                <option value="">On its own</option>
                {conversion.places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
              </select>
            </div>
          )}
          {parent && (
            <RadioCards
              label="Who has access?"
              surface="muted"
              value={closed ? 'closed' : 'open'}
              onChange={(value) => setClosed(value === 'closed')}
              disabled={busy}
              options={[
                {
                  value: 'open',
                  label: `Everyone in ${parent.name}`,
                  detail: parent.above
                    ? `${others > 0 ? `${others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`}, ` : ''}everyone who can open the space above it, and anyone who joins later.`
                    : `${others > 0 ? `${others === 1 ? '1 other person' : `${others.toLocaleString('en-US')} other people`} now, and ` : ''}anyone who joins ${parent.name} later.`,
                },
                { value: 'closed', label: 'Only people you add', detail: `Others in ${parent.name} don’t see it.` },
              ]}
            />
          )}
          <p className="text-base">
            {!parent
              ? `A space of its own, with you as its admin. Only you have it until you add people.`
              : closed
                ? `In ${parent.name}, with you as its admin. Only the people you add have it, and ${parent.name}’s shared rules apply in it.`
                : `In ${parent.name}. Everyone there sees its name and the spaces under it, ${parent.name}’s admins look after it with you, and its shared rules apply in it.`}
          </p>
          {conversion.rulesLeaving.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-base font-medium">These rules from your personal space stop applying in it:</p>
              <ul className="flex flex-col gap-2">
                {conversion.rulesLeaving.map((rule, index) => (
                  <li key={index}>
                    <ProposedChange kind={rule.kind} label={`${rule.kind === 'requirement' ? 'Requirement' : 'Preference'} from ${rule.from ?? 'a space above'}`} text={rule.text} settled />
                  </li>
                ))}
              </ul>
              <RadioCards
                label="What becomes of them?"
                surface="muted"
                value={rules}
                onChange={setRules}
                disabled={busy}
                options={[
                  { value: 'keep', label: 'Keep them for me', detail: `In ${space.name}, only for you.`, private: true },
                  { value: 'share', label: 'Add them for everyone', detail: `In ${space.name}, for everyone who has it.` },
                  { value: 'drop', label: 'Let them go', detail: 'They stay in your personal space.' },
                ]}
              />
            </div>
          )}
          {conversion.skillsLeaving.length > 0 && (
            <p className="text-base">
              {conversion.skillsLeaving.length === 1 ? 'The skill' : 'The skills'} {conversion.skillsLeaving.map((skill) => `“${skill.name}”`).join(', ')} from your personal space stop applying in it too. Add {conversion.skillsLeaving.length === 1 ? 'it' : 'them'} to {space.name}’s Guidance afterwards if you need {conversion.skillsLeaving.length === 1 ? 'it' : 'them'}.
            </p>
          )}
          {problem && <FieldError>{problem}</FieldError>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={close}>Cancel</Button>
            {/* The button names who will have it: everyone in a space it goes in, or for now only you. */}
            <Button size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={convert}>
              {parent && !closed ? `Share with ${parent.name}` : `Move ${space.name} out of your personal space`}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

/** Changing who is in a space, directly. Resolves to what went wrong, if anything. */
export interface MemberActions {
  add: (email: string, admin: boolean) => Promise<{ problem: string; field?: string } | { name: string }>;
  change: (personId: string, change: 'make admin' | 'make member' | 'remove') => Promise<string | undefined>;
}

type Member = SpaceData['members'][number];

/**
 * Who can open the space, and who looks after it. Its admins add someone by email, saying what
 * they'll see, make someone an admin or a member, and remove them; anyone can leave. Each change
 * that gives or takes away something asks first, in place. People with access through a space
 * above are changed there.
 */
export function Members({ space, actions }: { space: SpaceData; actions?: MemberActions }) {
  const parent = space.path.at(-1);
  const managing = Boolean(actions && space.admin && !space.private);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<string>();
  return (
    <div className="flex flex-col gap-10">
      {adding && actions && (
        <AddMember
          space={space}
          add={actions.add}
          onAdded={(name) => setStatus(`Added ${name}. They see ${space.name} from now on.`)}
          onDone={() => setAdding(false)}
        />
      )}
      <Section
        title="Members"
        description={
          space.closed && parent
            ? `${space.name} is closed. People in ${parent.name} have access only if they’re added here. Admins change its shared rules, and who has access.`
            : `They see ${space.name}’s shared knowledge and rules, and the spaces in it that aren’t closed. Admins change its shared rules, and who has access.`
        }
      >
        {managing && !adding && (
          <div>
            <Button variant="outline" onClick={() => setAdding(true)}>Add someone</Button>
          </div>
        )}
        {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
        <ul className="-mx-3 grid gap-1 sm:grid-cols-2">
          {space.members.map((member) => (
            <MemberRow
              key={member.id}
              space={space}
              member={member}
              // Admins change anyone in the space itself; anyone else can only leave.
              change={actions && member.member && (managing || member.you) ? actions.change : undefined}
              admin={managing}
              onChanged={setStatus}
            />
          ))}
        </ul>
        {space.reachedFromAbove && <p className="text-sm text-muted-foreground">People who can open the space above it have access too.</p>}
      </Section>
    </div>
  );
}

type Confirming = 'make admin' | 'make member' | 'remove';

function MemberRow({ space, member, change, admin, onChanged }: {
  space: SpaceData;
  member: Member;
  change?: MemberActions['change'];
  /** Whether the reader is an admin, who can change anyone's role. */
  admin: boolean;
  onChanged: (status: string) => void;
}) {
  const [confirming, setConfirming] = useState<Confirming>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const who = member.you ? 'You' : member.name;

  const close = () => {
    setConfirming(undefined);
    trigger.current?.focus();
  };
  const run = async (what: Confirming) => {
    setBusy(true);
    const answer = await change!(member.id, what);
    setBusy(false);
    setProblem(answer);
    if (answer) return;
    setConfirming(undefined);
    if (what === 'remove' && member.you) {
      navigate('/');
      return;
    }
    onChanged(
      what === 'remove'
        ? `Removed ${member.name} from ${space.name}.`
        : what === 'make admin'
          ? `${who} ${member.you ? 'are' : 'is'} now an admin of ${space.name}.`
          : `${who} ${member.you ? 'are' : 'is'} now a member of ${space.name}, not an admin.`,
    );
  };

  // What each change means, said before it's made, and its two buttons: keep things as they are, or go ahead.
  const ask: Record<Confirming, { text: string; keep: string; go: string }> = {
    'make admin': { text: `${member.name} will also change ${space.name}’s shared rules and who’s in it.`, keep: 'Keep as member', go: 'Make admin' },
    'make member': member.you
      ? { text: `You’ll no longer change ${space.name}’s shared rules or who’s in it, and can’t make yourself an admin again.`, keep: 'Stay an admin', go: 'Stop being an admin' }
      : { text: `${member.name} keeps access, but no longer changes ${space.name}’s shared rules or who’s in it.`, keep: 'Keep as admin', go: 'Make member' },
    remove: member.you
      ? {
          text: member.through ? `You’ll no longer be a member of ${space.name}, but still have access through ${member.through}.` : `You lose access to ${space.name} and the spaces in it at once.`,
          keep: 'Stay',
          go: `Leave ${space.name}`,
        }
      : {
          text: member.through ? `${member.name} will no longer be a member of ${space.name}, but still has access through ${member.through}.` : `${member.name} loses access to ${space.name} and the spaces in it at once.`,
          keep: 'Keep them',
          go: `Remove ${member.name}`,
        },
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
        {change && (
          <DropdownMenu>
            <DropdownMenuTrigger ref={trigger} aria-label={`Change ${member.you ? 'your' : `${member.name}’s`} access`} disabled={busy} className={cn('rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground', focusRing)}>
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {admin && (member.admin
                ? <DropdownMenuItem onClick={() => setConfirming('make member')}>{member.you ? 'Stop being an admin' : 'Make a member, not an admin'}</DropdownMenuItem>
                : <DropdownMenuItem onClick={() => setConfirming('make admin')}>Make an admin</DropdownMenuItem>)}
              <DropdownMenuItem onClick={() => setConfirming('remove')}>{member.you ? `Leave ${space.name}` : `Remove from ${space.name}`}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {confirming && (
        <div role="group" aria-label={ask[confirming].go} className="flex flex-col gap-3 rounded-xl bg-muted p-3">
          <p className="text-sm">{ask[confirming].text}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={close} autoFocus>{ask[confirming].keep}</Button>
            <Button variant={confirming === 'remove' ? 'destructive' : 'default'} disabled={busy} onClick={() => run(confirming)}>{ask[confirming].go}</Button>
          </div>
        </div>
      )}
      {problem && <FieldError>{problem}</FieldError>}
    </li>
  );
}

/** Adding someone who uses Homing, by email, saying first what they'll see. */
function AddMember({ space, add, onAdded, onDone }: { space: SpaceData; add: MemberActions['add']; onAdded: (name: string) => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const answer = await add(email.trim(), role === 'admin');
    setBusy(false);
    if ('problem' in answer) {
      setProblem({ field: answer.field, message: answer.problem });
      return;
    }
    onAdded(answer.name);
    onDone();
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
              setProblem(undefined);
            }}
            placeholder="The address they sign in to Homing with"
            aria-invalid={problem?.field === 'email' || undefined}
            aria-describedby={problem ? 'add-member-problem' : undefined}
            readOnly={busy}
            autoFocus
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
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" className="h-11 text-base sm:px-5" disabled={busy} onClick={onDone}>Cancel</Button>
          <Button type="submit" size="lg" className="h-11 text-base sm:px-5" disabled={busy || !email.trim()}>Add to {space.name}</Button>
        </div>
      </form>
    </Section>
  );
}
