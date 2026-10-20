import { ChevronDown, ChevronRight, Home, Lock, Menu, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from 'cn';
import { Avatar, focusRing } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Wordmark } from '@/components/wordmark';
import { addressOf, Link, navigate, type Route } from '@/lib/router';
import { inOrder, type SpaceSummary } from '@/lib/spaces';

export interface ShellProps {
  person: { name: string; instanceAdmin?: boolean };
  spaces: SpaceSummary[];
  /** How many changes wait for the person. */
  waiting: number;
  /** The spaces they opened lately, newest first. */
  recent: string[];
  /** The screen being shown, and the space it belongs to, if any. */
  route: Route;
  spaceId?: string;
  onSignOut: () => void;
  children: ReactNode;
}

/** The app around every signed-in screen: your spaces on a linen shelf beside the page. */
export function Shell({ children, route, ...sidebar }: ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const address = addressOf(route);
  const first = useRef(true);

  // Moving to another screen closes the menu, starts at the top, and takes keyboard and screen
  // reader focus to the new screen, as loading a page would.
  useEffect(() => {
    setMenuOpen(false);
    if (first.current) {
      first.current = false;
      return;
    }
    scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [address]);

  return (
    <div className="min-h-dvh bg-background md:pl-72">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col bg-shelf md:flex">
        <Sidebar route={route} {...sidebar} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-2 bg-shelf px-2 py-2 md:hidden">
        <Button variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenuOpen(true)}>
          <Menu />
        </Button>
        <Link href="/" className={cn('mr-auto rounded-md', focusRing)}>
          <Wordmark />
        </Link>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-80 border-0 bg-shelf p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar route={route} {...sidebar} onClose={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <main ref={main} tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pt-8 pb-28 outline-none sm:px-8 md:pt-14 lg:px-12">
        {children}
      </main>
    </div>
  );
}

function Sidebar({ person, spaces, waiting, recent, route, spaceId, onSignOut, onClose }: Omit<ShellProps, 'children'> & { onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className={cn('rounded-md text-lg', focusRing)}>
          <Wordmark />
        </Link>
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label="Close menu" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <SearchField key={addressOf(route)} onSearched={onClose} />

      <nav aria-label="Homing" className="flex flex-col gap-6">
        <NavLink href="/" active={route.name === 'home'}>
          <Home aria-hidden="true" className="size-[18px]" />
          <span className="flex-1">Home</span>
          {waiting > 0 && (
            <span className="min-w-6 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-semibold text-primary-foreground">
              {waiting}
              <span className="sr-only"> waiting for you</span>
            </span>
          )}
        </NavLink>

        <Spaces spaces={spaces} recent={recent} current={spaceId} address={addressOf(route)} />
      </nav>

      <div className="mt-auto">
        <PersonMenu person={person} onSignOut={onSignOut} />
      </div>
    </div>
  );
}

/** Search everything, from any screen: the same results your assistant gets. */
function SearchField({ onSearched }: { onSearched?: () => void }) {
  const [typed, setTyped] = useState('');
  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        if (!typed.trim()) return;
        navigate(`/search?q=${encodeURIComponent(typed.trim())}`);
        onSearched?.();
      }}
    >
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label="Search Homing"
        placeholder="Search everything"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        className={cn('h-11 w-full rounded-full bg-card pr-4 pl-11 text-base outline-none placeholder:text-muted-foreground', focusRing)}
      />
    </form>
  );
}

function NavLink({ href, active, children, className }: { href: string; active?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-base transition-colors hover:bg-background/70',
        focusRing,
        active && 'bg-accent font-semibold text-primary-ink hover:bg-accent',
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** With more spaces than this, the sidebar helps find them. */
const many = 12;

/**
 * Your spaces. A few show as a tree. With many, the spaces you opened lately come first, you can
 * find one by name, and the tree opens only along where you are.
 */
function Spaces({ spaces, recent, current, address }: { spaces: SpaceSummary[]; recent: string[]; current?: string; address: string }) {
  const [typed, setTyped] = useState('');
  const crowded = spaces.length > many;
  // Moving to another screen clears the search.
  useEffect(() => setTyped(''), [address]);
  const query = crowded ? typed.trim().toLowerCase() : '';
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const found = query ? spaces.filter((space) => space.name.toLowerCase().includes(query)).slice(0, many) : [];
  const lately = recent.map((id) => byId.get(id)).filter((space): space is SpaceSummary => Boolean(space));
  // Two spaces can share a name, such as each client's Website, and then the way there tells them apart.
  const shared = new Set(spaces.filter((space, index) => spaces.findIndex((other) => other.name === space.name) !== index).map((space) => space.name));

  return (
    <div className="flex flex-col gap-5">
      {crowded && (
        <input
          type="search"
          aria-label="Find a space"
          placeholder={`Find one of ${spaces.length} spaces`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="h-10 w-full rounded-full bg-background/70 px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60"
        />
      )}
      {query ? (
        <ul className="flex flex-col gap-0.5" aria-label="Spaces found">
          {found.map((space) => (
            <li key={space.id}>
              <NavLink href={`/spaces/${space.id}`} active={current === space.id} className="flex-col items-start gap-0">
                <span className="max-w-full truncate font-semibold">{space.name}</span>
                <span className="max-w-full truncate text-sm text-muted-foreground">{pathOf(space, byId) || 'At the top'}</span>
              </NavLink>
            </li>
          ))}
          {found.length === 0 && <li className="px-3 text-sm text-muted-foreground">No space is called that.</li>}
        </ul>
      ) : (
        <>
          {crowded && lately.length > 0 && (
            <div className="flex flex-col gap-1">
              <h2 className="px-3 text-sm font-semibold text-muted-foreground">Recent</h2>
              <ul className="flex flex-col gap-0.5">
                {lately.map((space) => (
                  <li key={space.id}>
                    <NavLink href={`/spaces/${space.id}`} active={current === space.id} className={cn(shared.has(space.name) && 'flex-col items-start gap-0')}>
                      <span className="max-w-full truncate">{space.name}</span>
                      {shared.has(space.name) && <span className="max-w-full truncate text-sm text-muted-foreground">{pathOf(space, byId) || 'At the top'}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h2 className="px-3 text-sm font-semibold text-muted-foreground">{crowded ? 'All spaces' : 'Your spaces'}</h2>
            <SpaceTree spaces={spaces} current={current} crowded={crowded} />
          </div>
        </>
      )}
    </div>
  );
}

/** "Acme, Northwind": the spaces above one, from the top. */
function pathOf(space: SpaceSummary, byId: Map<string, SpaceSummary>): string {
  const names: string[] = [];
  for (let above = space.parentId && byId.get(space.parentId); above; above = above.parentId && byId.get(above.parentId)) names.unshift(above.name);
  return names.join(', ');
}

/**
 * Your spaces as a tree, your personal space first. Spaces at the top are set in bold. With many,
 * only the way to where you are is open, and a closed branch says how many spaces it holds.
 */
function SpaceTree({ spaces, current, crowded }: { spaces: SpaceSummary[]; current?: string; crowded: boolean }) {
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const byId = new Map(spaces.map((space) => [space.id, space]));
  const childrenOf = (id: string | null) => spaces.filter((space) => space.parentId === id);
  const along = new Set<string>();
  for (let above = current ? byId.get(current)?.parentId : undefined; above; above = byId.get(above)?.parentId) along.add(above);
  const isOpen = (id: string) => toggled.get(id) ?? (!crowded || along.has(id));
  const toggle = (id: string) => setToggled((previous) => new Map(previous).set(id, !isOpen(id)));

  const branch = (space: SpaceSummary, depth: number): ReactNode => {
    const children = childrenOf(space.id);
    const expanded = isOpen(space.id);
    return (
      <li key={space.id} className={cn(depth === 0 && 'mt-1 first:mt-0')}>
        <div className="relative flex items-center">
          <NavLink
            href={`/spaces/${space.id}`}
            active={current === space.id}
            className={cn('flex-1 pr-11', depth === 0 ? 'font-semibold' : depth === 1 ? 'pl-7' : 'pl-11')}
          >
            <span className="truncate">{space.name}</span>
            {space.personal && <Lock aria-label="Only you" className="size-3.5 shrink-0 text-private-foreground" />}
          </NavLink>
          {children.length > 0 && (
            <button
              type="button"
              aria-label={expanded ? `Hide the spaces in ${space.name}` : `Show the ${children.length === 1 ? 'space' : `${children.length} spaces`} in ${space.name}`}
              aria-expanded={expanded}
              onClick={() => toggle(space.id)}
              className={cn('absolute right-1.5 flex h-7 min-w-7 items-center justify-center gap-0.5 rounded-md px-1 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground', focusRing)}
            >
              {!expanded && crowded && children.length}
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
        </div>
        {children.length > 0 && expanded && <ul className="flex flex-col gap-0.5">{children.map((child) => branch(child, depth + 1))}</ul>}
      </li>
    );
  };

  return <ul className="flex flex-col gap-0.5">{inOrder(childrenOf(null)).map((space) => branch(space, 0))}</ul>;
}

/** Your name, at the bottom of the shelf: your account, looking after Homing if you do, and signing out. */
function PersonMenu({ person, onSignOut }: { person: ShellProps['person']; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-base font-medium hover:bg-background/70', focusRing)}>
        <Avatar name={person.name} className="bg-card" />
        <span className="flex-1 truncate">{person.name}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuItem onClick={() => navigate('/account')}>Your account</DropdownMenuItem>
        {person.instanceAdmin && <DropdownMenuItem onClick={() => navigate('/admin')}>Looking after Homing</DropdownMenuItem>}
        <DropdownMenuItem onClick={onSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
