import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from 'cn';
import { ProposedChange } from '@/components/proposed-change';
import { buttonVariants } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import dovecote from '@/assets/illustrations/dovecote.webp';
import faceBoy from '@/assets/illustrations/face-boy.webp';
import faceGirl from '@/assets/illustrations/face-girl.webp';
import resting from '@/assets/illustrations/empty.png';
import sharing from '@/assets/illustrations/sharing.webp';
import startingOver from '@/assets/illustrations/starting-over.webp';
import '@/landing.css';

const links = {
  github: 'https://github.com/MaxJohnsen/homing',
  docs: 'https://github.com/MaxJohnsen/homing#read-more',
  selfHost: 'https://github.com/MaxJohnsen/homing/blob/main/docs/deployment.md',
  // Homing online, where people sign in. This page itself is homing.place.
  signIn: 'https://app.homing.place/sign-in',
};

/**
 * The landing page, read top to bottom like a picture book. The cover and the ending are centered.
 * Every chapter between them is one column with one left edge for its heading, text and product
 * fragments. Each chapter has one picture: a drawing centered above it, or a product fragment below
 * its text, alternating down the page. Chapters alternate between linen and a soft band.
 */
export function Landing() {
  const root = useMotion();
  return (
    <div ref={root} className="landing bg-background text-foreground">
      <Nav />
      <main className="flex flex-col gap-4 pb-4">
        <Cover />

        <Chapter id="why" title="We got tired of starting over." drawing={<Drawing src={startingOver} width={960} height={960} />}>
          <p className="t-lead" {...reveal(2)}>
            Every new assistant meant explaining things again. Decisions were buried in chats, knowledge was scattered across apps, and things we’d learned together were easily lost.
          </p>
          <p className="t-lead" {...reveal(3)}>We made Homing because we wanted that knowledge to stay useful.</p>
        </Chapter>

        <Chapter id="together" anchor="how" band title="Bring it all together.">
          <p className="t-lead" {...reveal(2)}>Keep what matters about your projects, work and everyday life in one place.</p>
          <p className="t-body" {...reveal(3)}>
            Each project and part of your life gets its own space. Come back weeks later without explaining everything again, switch assistants without losing the context, and let Homing help keep it all up to date.
          </p>
          <SpacesMap />
        </Chapter>

        <Chapter id="sharing" title="Let others build on it, too." drawing={<Drawing src={sharing} width={1200} height={795} />}>
          <p className="t-lead" {...reveal(2)}>Some things are more useful when other people know them too.</p>
          <p className="t-body" {...reveal(3)}>
            Share a project decision with a colleague and their assistant, and everyone works from the same understanding. Everything else stays private.
          </p>
        </Chapter>

        <Chapter id="rules" band title="Rules change only when you say so.">
          <p className="t-body" {...reveal(2)}>Assistants can suggest how they should work in a space. Nothing changes until you approve it.</p>
          <RuleCard />
        </Chapter>

        <Ending />
      </main>
      <Footer />
    </div>
  );
}

/** Revealed in turn as it comes into view. */
function reveal(i: number) {
  return { 'data-reveal': '', style: { '--i': i } as CSSProperties };
}

const primary = cn(buttonVariants(), 'press h-11 px-6 text-[15px]');
const outline = cn(buttonVariants({ variant: 'outline' }), 'press h-11 px-6 text-[15px]');
const smallPrimary = cn(buttonVariants({ size: 'sm' }), 'px-4');
const smallOutline = cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'px-4');

function Nav() {
  return (
    <header className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8">
      <a href="/" className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/70 focus-visible:outline-none">
        <Wordmark className="text-lg" />
      </a>
      <nav aria-label="Homing" className="flex items-center gap-6 text-[15px]">
        <a href="#how" className="link hidden sm:inline">How it works</a>
        <a href={links.github} className="link hidden sm:inline">GitHub</a>
        <a href={links.signIn} className="link">Sign in</a>
      </nav>
    </header>
  );
}

/** A drawing, centered, at the height every drawing on the page shares. */
function Drawing({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    <div className="flex justify-center" {...reveal(0)}>
      <img src={src} alt="" width={width} height={height} loading="lazy" className="h-auto max-h-[20rem] w-auto max-w-full" />
    </div>
  );
}

/** The cover: the opening drawing, the title and the way in, all centered. */
function Cover() {
  return (
    <section className="mx-auto flex w-full max-w-[44rem] flex-col items-center px-5 pt-6 pb-24 text-center sm:px-8 lg:pb-32">
      {/* The bird flies home to its loft with one more card, as a homing pigeon would. */}
      <img src={dovecote} alt="" width={1200} height={805} className="h-auto max-h-[20rem] w-auto max-w-full" />
      <h1 className="t-display mt-8 font-semibold" {...reveal(0)}>A home for everything worth knowing.</h1>
      <p className="t-lead mt-6 max-w-[34rem]" {...reveal(1)}>Your life and work don’t fit into one conversation.</p>
      <p className="t-body mt-4 max-w-[34rem]" {...reveal(2)}>
        Homing gives your AI assistants a shared place to remember what matters, build on what they learn, and pick up where you left off.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row" {...reveal(3)}>
        <a href="#start" className={primary}>Get started</a>
        <a href="#how" className={outline}>See how it works</a>
      </div>
      <p className="t-small mt-5 text-muted-foreground" {...reveal(4)}>Open source, and designed for Claude, ChatGPT, Copilot and more.</p>
    </section>
  );
}

/**
 * A chapter: an optional drawing centered at the top, then its heading, text and any product
 * fragment on one left edge in one column. A band chapter sits on the soft ground.
 */
function Chapter({ id, anchor, band, title, drawing, children }: { id: string; anchor?: string; band?: boolean; title: string; drawing?: ReactNode; children: ReactNode }) {
  return (
    <section id={anchor} aria-labelledby={id} className="px-2 sm:px-3">
      <div className={cn('rounded-[1.75rem] px-5 py-24 sm:px-8 lg:py-32', band && 'bg-muted')}>
        <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-6">
          {drawing}
          <h2 id={id} className={cn('t-heading font-semibold', drawing && 'mt-6')} {...reveal(1)}>{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

// Two people, each with a home of their own, and Juniper, a studio they both work with.
type Who = 'Ana' | 'Ben';
const faces: Record<Who, string> = { Ana: faceGirl, Ben: faceBoy };

/** Someone's face, small, from the same drawings as the rest of Homing. */
function Face({ who }: { who: Who }) {
  return <img src={faces[who]} alt={who} title={who} width={128} height={128} className="size-7 rounded-full bg-muted object-cover" />;
}

// A home shows whose it is; a shared space shows, on each space inside it, who reaches that space.
const homes: { name: string; owner?: Who; spaces: { name: string; people?: Who[]; closed?: boolean }[] }[] = [
  { name: 'Ana’s home', owner: 'Ana', spaces: [{ name: 'Kitchen' }, { name: 'Half marathon' }, { name: 'Family trip' }] },
  {
    name: 'Juniper',
    spaces: [
      { name: 'Website launch', people: ['Ana', 'Ben'] },
      { name: 'Brand refresh', people: ['Ana', 'Ben'] },
      { name: 'Budget', people: ['Ana'], closed: true },
    ],
  },
  { name: 'Ben’s home', owner: 'Ben', spaces: [{ name: 'Garden' }, { name: 'Book club' }] },
];

/**
 * How Homing is built: spaces for each part of life, some holding other spaces. Ben is invited
 * to Juniper, so he and his assistants reach what's inside it, except the closed budget.
 */
function SpacesMap() {
  return (
    <figure className="mt-6 flex flex-col gap-3" {...reveal(4)}>
      <div data-ui className="grid gap-3 sm:grid-cols-3">
        {homes.map((home) => (
          <div key={home.name} className="flex flex-col gap-3 rounded-2xl bg-card p-4">
            <div className="flex min-h-7 items-center justify-between gap-2">
              <p className="text-[15px] font-semibold">{home.name}</p>
              {home.owner && <Face who={home.owner} />}
            </div>
            <div className="flex flex-col gap-2">
              {home.spaces.map((space) => (
                <div key={space.name} className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-background px-3 py-2">
                  <p className="text-sm">
                    {space.name}
                    {space.closed && <span className="ml-2 text-xs text-muted-foreground">Closed</span>}
                  </p>
                  {space.people && (
                    <div className="flex -space-x-1.5">
                      {space.people.map((who) => (
                        <Face key={who} who={who} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <figcaption className="t-small text-muted-foreground">Invite someone to a space, and they and their assistants reach what’s inside it, except what’s closed.</figcaption>
    </figure>
  );
}

/** An assistant suggests a rule, and only a person can add it. */
function RuleCard() {
  return (
    <div data-ui className="mt-6 flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5" {...reveal(3)}>
      <p className="text-lg font-semibold">Claude suggests a rule for Juniper</p>
      <ProposedChange kind="requirement" label="Rule" text="Send status updates on Fridays." />
      <p className="text-sm text-muted-foreground">Only you can approve this.</p>
      <div className="flex gap-2">
        <span className={smallPrimary}>Add rule</span>
        <span className={smallOutline}>Don’t add</span>
      </div>
    </div>
  );
}

/** The ending mirrors the cover: the bird asleep in its box, and the two ways to start. */
function Ending() {
  return (
    <section id="start" aria-labelledby="start-title" className="mx-auto flex w-full max-w-[44rem] flex-col items-center px-5 pt-24 pb-28 text-center sm:px-8 lg:pt-32 lg:pb-36">
      <img src={resting} alt="" width={960} height={640} loading="lazy" className="h-auto max-h-[16rem] w-auto max-w-full" {...reveal(0)} />
      <h2 id="start-title" className="t-heading mt-4 font-semibold" {...reveal(1)}>Make yourself at home.</h2>
      <div className="mt-12 grid w-full gap-12 sm:grid-cols-2 sm:gap-8">
        <div className="flex flex-col items-center gap-2" {...reveal(2)}>
          <h3 className="t-body font-semibold">Host Homing yourself</h3>
          <p className="t-body">Homing is open source. Run it on your own server.</p>
          <a href={links.selfHost} className={cn(primary, 'mt-4 w-full sm:w-auto')}>Read the setup guide</a>
        </div>
        <div className="flex flex-col items-center gap-2" {...reveal(3)}>
          <h3 className="t-body font-semibold">Use Homing online</h3>
          <p className="t-body">Homing online is invite-only while we build it.</p>
          <a href={links.signIn} className={cn(outline, 'mt-4 w-full sm:w-auto')}>Sign in</a>
        </div>
      </div>
    </section>
  );
}

/** A quiet close, centered like the cover: the name, a line and the links. */
function Footer() {
  return (
    <footer className="bg-foreground text-background [--mark-dark:#a9c2ad] [--mark-light:#d3e0d4]">
      <div className="mx-auto flex max-w-[44rem] flex-col items-center gap-6 px-5 py-16 text-center sm:px-8 sm:py-20">
        <Wordmark className="text-3xl" />
        <p className="t-lead">Built in the open, for everyone.</p>
        <ul className="t-small flex gap-6">
          <li><a href={links.github} className="link rounded-sm focus-visible:ring-[3px] focus-visible:ring-background/60 focus-visible:outline-none">GitHub</a></li>
          <li><a href={links.docs} className="link rounded-sm focus-visible:ring-[3px] focus-visible:ring-background/60 focus-visible:outline-none">Documentation</a></li>
        </ul>
        <p className="t-small opacity-70">© 2026 Max Aasbø. Licensed under AGPL-3.0.</p>
      </div>
    </footer>
  );
}

/** Reveals each part once it comes into view. */
function useMotion() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    page.classList.add('moving');
    const parts = page.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      parts.forEach((part) => part.classList.add('is-in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    });
    parts.forEach((part) => observer.observe(part));
    return () => observer.disconnect();
  }, []);
  return root;
}
