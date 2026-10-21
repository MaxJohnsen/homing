# Architecture

How Homing is built. The behavior it must have is in the [specification](spec.md). This document can change without changing the concept.

## Shape

Homing is a modular monolith: one deployment with a transactional database, derived indexes, background workers and optional model inference. External agents stay independent and use Homing through MCP.

| Component | Responsibility |
|---|---|
| MCP server | The interface agents use |
| Web app | The interface people use |
| Core | Spaces, guidance, context, permissions, publishing checks, proposals |
| Runner | System routines: capture → route → upkeep |
| Connection broker | Credential vault, OAuth, adapters, executing `act` |
| Store | One transactional database plus derived search indexes |
| Local bridge | Optional. An outbound-only helper on a Mac, for example for iMessage |

## Technology

Chosen for fast context retrieval, simple self-hosting, reliable concurrency and permissions, easy extensibility and minimal infrastructure.

| Part | Choice |
|---|---|
| Language | TypeScript on Node.js, for the MCP server, web app, workers and adapters |
| Database | PostgreSQL, the single source of truth |
| Database access | Plain SQL through postgres.js, with SQL migration files |
| MCP | The official TypeScript SDK over Streamable HTTP, at `/mcp` |
| Sign-in | [Better Auth](https://better-auth.com), built in: passkeys and passwords for people, and OAuth for assistants. Only the plugins Homing uses are on, and the server answers only the endpoints its pages use |
| Web app | React, built with Vite, with Tailwind and shadcn/ui. It compiles to static files the server serves; the approval card shown inside assistants compiles to one self-contained HTML file |
| Search | Postgres full-text search plus `pg_trgm` for names; pgvector only when semantic search is enabled |
| Queue | Postgres (`SKIP LOCKED`) |
| Space tree | Plain tables with recursive queries |
| Credentials | Encrypted in Postgres; the key is kept outside the database |
| Model access | A thin provider layer: Anthropic, OpenAI, or any OpenAI-compatible local endpoint |
| Deployment | Docker Compose: one Homing image plus Postgres. Each release publishes the image for amd64 and arm64 |

- The server code runs without a build step. Only the web app has one, and it runs when the image is built.
- One image runs every component. A setting chooses its role (everything, MCP and web, or workers), so an installation can be split later without code changes. Heavy parsing runs in worker processes.
- Each of Homing's transactions turns off PostgreSQL's JIT compilation and plans every query for its own values. Row-level security makes the planner overestimate costs, so JIT compiled queries that run in milliseconds, for up to a second, and plans cached for any values made context and search 2 to 3 times slower.
- No Redis, search engine, vector database or graph database. One is added only if a benchmark shows Postgres falls short. For search, the fallback is a ranking extension inside Postgres, such as ParadeDB's `pg_search`, not a new service.
- Graphile Worker and pgvector are preferred, not committed, until they are tested.
- Homing is a server, even for one person. There is no embedded or single-binary variant in v1.

## Background work

Background work runs through a durable job queue in the same database. Workers run in the same deployment, which gives retries, concurrency control and recovery without microservices.

Jobs come in two kinds:

- **Internal jobs** (upkeep, indexing, extracting) run at least once and must be safe to repeat.
- **Publishing actions** (sending, posting, creating external records) run at most once. The attempt is recorded before acting. If the outcome is unknown, Homing never retries blindly: it checks the destination, or marks the action as uncertain and asks.

Each routine run is a job, recording who it acted for, which connection it used, what it did and which proposals it created.

## Data and security

**Every row is scoped.** Every stored row, including index entries and jobs, carries `space_id`, and `private_to` when it belongs to a private side. Jobs also record the person or space they act for.

**Row-level security is on from day one.** Homing decides what actions are authorized. PostgreSQL independently enforces who can access protected data. Normal requests and routines never bypass that protection.

- It uses the same access table and content visibility as the application, including the exceptions for guidance and proposals.
- A private item replaces a shared one only for its owner, and only through its explicit link to the item it replaces (`supersedes`), so a newer item never hides anything on its own. Shared knowledge published as a copy links to its private origin (`published_from`), which from then on shows only as the copy; changing it makes a private update of the copy, and sharing that replaces the copy for everyone.
- A skill's files are items on its page, each with its path, so a SKILL.md folder is stored as it was imported. For now Homing keeps only text files up to 512 KB, small enough to search, and doesn't follow links.
- Each guidance item records whether it reaches down, and a read-only policy lets shared guidance through to the spaces below, closed ones included. Private guidance needs no exception, since its owner can open its space. A trigger checks every write to a guidance or skill page: it must be a person editing directly, shared guidance needs an admin, and each page holds only its own kind of item. Only the web app and the command line mark an edit as direct, so a new path can't change guidance by accident.
- An include is a row of its own: the space whose guidance includes it, its side, and the space or skill page it points to. Removing one keeps the row, with who removed it. Row-level security shows a row where its space's guidance is seen, and only to someone who can open what it points to, and a trigger gives every write the same check as a guidance page, refusing what the writer can't open before anything else, so a refusal says nothing about it. Assembling guidance takes the includes of each space that applies at that space's level, then reads what they point to as the reader, under the ordinary policies, so an include never widens what anyone sees. It follows one step only, which is why a cycle can't loop, a rule that arrives twice is kept where it's most specific, and someone's own include of what the space also includes for everyone waits while that one is there. Each include is looked at only in the spaces that apply, before its access is checked. For a space's admins, a function returns its includes for everyone that they can't open, only their id, kind, author and date, and another stops one.
- A proposal to include something keeps what it points to in a table beside it, which row-level security shows only to someone who can open it, so an admin deciding a member's request never sees it. A proposal to stop including names the include, and what it says about it comes from the include itself.
- A proposal is on the private side of the person it's for. Assistants make them, and only that person decides one: editing directly, once, and within a week, which a trigger checks. Approving makes the change as that person, so it passes the same checks as a direct edit, at that moment, and records the decision in the same transaction. Leaving a space ends the person's access to the proposal too, so that decision is recorded before the change.
- A member's change to shared rules is a request: a proposal on the member's side that they send, which then any admin of the space sees and decides, the same way. Row-level security shows a sent request to the space's admins, and the trigger checks the decider is an admin at that moment.
- A plan, several related changes decided at once, is one proposal whose change lists its steps, each as its own proposal would hold it, and the space it creates, if any. A constraint keeps it to whole steps of the kinds a plan holds, at least two changes, and a new space only open to everyone where the plan waits, and never a request. Leaving a space is never a step. Proposing it checks each step with the code that proposes it alone. Reading it works each step out as it is now, with why it can't be made, if it can't. Approving does that again, compares what each step was shown with what's there, and runs each step's own code in order, as the person, in the transaction that decides it, so a refusal anywhere undoes the rest and names the step. Homing makes no external changes yet, so every step is inside that one transaction.
- In Claude.ai the person can also decide on a card in the conversation, an MCP App. The card's buttons reach Homing over the assistant's own connection, through tools the assistant keeps from the model. So Homing relies on the assistant for that, offers the card only to assistants checked to do it, and records which assistant's card a decision came through. Every other assistant gives the person the link.
- One restricted database role handles normal operations. Each request or routine sets its person or space for the transaction, and background workers get no elevated access.
- A separate admin role is used only for migrations and narrowly defined housekeeping, such as deletion cascades and access-table updates. The normal role can't write the access table, and changes spaces and memberships only through database functions that check the caller's rights.
- It covers sensitive data: content, sources, credentials and search data. Purely technical tables don't need the same policies.
- Sign-in has its own database role and schema. It can't read space data, and Homing's role can't read passwords, passkeys or sessions. An account has the same id as its person, and only accepting an invite creates both.
- The application still filters explicitly. Row-level security catches missing filters. It is not protection against a fully compromised application.

## Export and import

A space's export is a zip, read in one snapshot as the person who asks for it, so row-level security keeps everyone else's private side out underneath Homing's own filters. It goes down only through spaces the person can open, and only sources kept in those spaces come along. Items, tasks and spaces carry their own dates, as the app shows them. What happened to a page itself before the person could see anything on it stays out: its archive history starts when they could first see it, counting something shared from someone's own side from when it was shared, and a page archived before then shows as archived since then, by nobody named. In knowledge, a reference such as `page:…` to anything left out keeps its words and loses the reference; rules and skills' files stay word for word, and plain Homing addresses stay as written.

```
homing.json                    the manifest, compact JSON, the only file import reads
knowledge/                     an OKF v0.2 bundle
  index.md                     okf_version, then the space's overview, tasks, sources, pages and spaces
  log.md                       what changed, by day, newest first
  <page>.md                    one concept per page
  overview.md, tasks.md
  sources/<id>.md              one concept per source
  <space>/                     each space below, the same way
guidance/
  AGENTS.md                    the space's rules
  skills/<name>/               SKILL.md folders as they were saved
  private-skills/<name>/       the person's own skills
  <space>/                     each space below, the same way
```

The manifest has `format: "homing-export"`, `version: 1`, the instance's address, when it was exported and by whom, and then flat lists by current ID: `people`, `spaces`, `spaceArchives`, `pages`, `items`, `revisions`, `sources`, `links`, `gathered`, `pageArchives`, `tasks` and `includes`. People are keys that hold only within the export, `person-1` and so on, each with a name, or null for someone the exporter no longer shares a space with; never an account's id or email. Whoever did something is an author: `by` is `person`, `agent` (with the agent's name, and the person it acted for) or `routine`. An item has its kind, body, visibility (`shared`, or `private` to the exporter), author, when it was created and last written, what it supersedes, `onlyHere` for a rule, the sources it cites in the export, `sourcesElsewhere` for those it rests on that are kept in other spaces, and the private item it was published from when that is the exporter's own. An include has the space whose guidance it's in, its visibility, whether it waits, and what it brings in: `rules` with a space's ID or `skill` with a skill's page when that's in the export, or `elsewhere` with the space's name, and the skill's, when it isn't. Includes are read as the exporter, so row-level security and Homing's own filter both keep out anyone else's own and any of something they can't open. Removed includes aren't exported. Members, proposals and credentials aren't exported, and Homing keeps no live external records yet.

Each page is a concept with its type (`Page` when it has none), `title` on one line, its id under `homing`, `generated` with the last writer as an OKF actor (`human:<name>`, `<assistant>/homing` for an agent, `process:homing` for a routine), and `sources` pointing to their concepts, cited as footnotes keyed by source id. Items keep their ids in comments, private ones say whose they are, ones resting on sources elsewhere say so, replaced ones follow under Earlier, and an archived page has `status: deprecated`. A space's AGENTS.md lists what its guidance includes under Also included, linking to the rules or the skill when they're in the bundle, and saying when they aren't. A skill's file that wouldn't stay in its folder on every system, with a backslash, a colon, `.` or `..` in its path, is left out of `guidance/`, though the manifest has it. A test checks the knowledge folder against OKF §11 on every change.

The zip is written with Node's own zlib, each file compressed into memory of its own. A big space is tens of thousands of files, so past 65,535 the zip ends with ZIP64's records, which common unzip tools read. Other requests keep being answered while an export is made: the manifest is built and written a few thousand rows at a time, small files are compressed a few hundred at a time, and a file over 1 MB, such as `homing.json`, is compressed off the main thread. Each person makes one export at a time, and Homing two at once, each until its zip has been sent, or for at most five minutes. On the big sample, about 100,000 files, an export peaks at about 1 GB, and nothing else waits more than about a tenth of a second.

Import reads only `homing.json`, from a zip of at most 100 MB, at most 32 MB unpacked, with at most 250,000 files, and nothing else in the zip is unpacked. The zip arrives first, within two minutes, one at a time from each person and a few at once, and only then waits its turn: Homing reads one export at a time, for a preview or an import, and writes it. An export is read in a worker thread of its own, with at most 768 MB of memory and a minute, so one made to be heavy only stops that worker while Homing keeps answering, and `homing.json` may hold at most 2,000,000 objects and lists, counted before any is built. The worker checks the manifest whole before anything is shown: format and version, every field's type, people and authors, and that everything points to something in the export, in an order that holds. Text is held to what Homing keeps: knowledge 20,000 characters, rules 4,000, the overview 2,000, titles 200, page types 40, skills' files 512 KB with one file at each place, and a skill's name in lowercase words, as its SKILL.md says. Spaces' names have no control or format characters, as Homing's own don't, rules and skills' files have none that hide or turn text around, such as direction overrides and tag characters, and spaces side by side have different names. Names of people and agents are shown plainly instead: on one line, without control characters or format characters that hide or turn text around, keeping the joiners, direction marks and soft hyphens languages need, as people may give them when they sign up. The preview stores nothing. It names what rules refer to in at most 80 characters, shows at most 1,000,000 characters of rules, and is turned into JSON in the worker, at most 5 MB of it, so whatever an export holds, what reaches the app stays small. It returns a SHA-256 of `homing.json`, and the import is refused unless its file has the same. Links in text are found with words that hold no brackets, so finding them takes time in step with the text. Importing gives everything a new ID, since keeping IDs where they're free would mean looking for them among others' rows, which row-level security hides and which could leak, and points references in knowledge, rules and skills' files to the new ones; in rules and files, one to something the export doesn't hold stays as written. Things written in the same millisecond keep their order.

One database function, `import_bundle`, then writes it all in one transaction, as the person editing directly. It runs with the database's own rights, but creates the new spaces itself, with the person as their only admin and member, and writes only into them: every row has to land in a space it made and point only to rows it made, or nothing is kept. Each row says which space it goes in, and nothing is joined to find it: spaces are checked against those just made, the composite keys keep items and collections in their page's space and a replacement on its page, and what rows point to is checked against the import's own lists, so writing takes time in step with the export's size. The checks on each row written keep their plans while it runs, rather than being planned for each row as Homing's other queries are. Times are kept, never later than now. Nobody here is recorded as having made or written any of it: `created_by` and `written_by` stay empty, and an `imported` column on each row holds the import, the ID in the export, and who did it as the export says, by kind, person key and name, for as long as the text is theirs. A change here moves them into the history with the earlier text, and a shared copy of an imported item keeps both. The checks that keep agents from rewriting what people wrote count an imported person as a person, and `sourcesElsewhere` counts among an item's hidden sources, so sharing it is never treated as resting only on what everyone sees. An earlier version is private whenever its item is or it was. `imports` records who imported what, when and from where, for whoever can open the space. Includes come in through the same check as any include, as guidance the person writes directly, with who added each and when as imported provenance, `added_by` empty, and only those of something the import made: an include in a space it didn't make, or of something it didn't bring, stops it. Those of something outside the export are left out, after the preview names them. Each space comes in archived or not, with when and by whom, and page archives come in with their imported authors, but the space archive history doesn't: each entry is visible only to whoever archived or reopened the space, so imported it would show to nobody, or be credited to the importer.

Creating the spaces takes the lock that creating spaces and changing who is in them take everywhere, sign-ups included, and the import holds it until it's done. On a laptop, 63 MB of small items, 125,000 of them, is read in about a second and written in about 8 seconds, and the big sample's 49 MB, with 31,000 items and 99,000 sources, in about 4.5, while creating a space elsewhere waits. A small server is likely two to three times slower, so an import takes at most 32 MB of `homing.json`, about 60,000 items, which holds the lock for about 4 seconds on a laptop and likely 10 or so there. A bigger space is still exported whole, and can be imported in parts, by exporting the spaces below it. An import that takes longer than the database's 30 seconds for a statement is refused, with nothing created.

## Self-hosting

Self-hosting is part of the product, not something users piece together: HTTPS, MCP authentication, OAuth callbacks, migrations, upgrades, backup and restore. A full backup includes the encryption key. A Markdown export is not an operational backup.

Migrations run as a separate step before the server starts, so the running server never holds the admin role. When the server starts and nobody looks after the instance yet, it prints the setup link for the first account. The link works once, for an hour, and only a hash of its token is kept.

Every assistant, Claude Code included, connects over OAuth to `/mcp`. It names itself with a client metadata document at its own address, so nobody registers clients, and the person signs in and allows it on Homing's own pages. Only assistants from sites the instance trusts can connect, Claude's and ChatGPT's unless it says otherwise, because each one can send people back to its own addresses. Its tokens are for `/mcp` only and are checked against Homing's signing keys locally; a token bound to the assistant's key (DPoP) also needs a fresh proof from that key. On every request Homing checks that the person hasn't disconnected the assistant, because a token alone would keep working until it expires. Disconnecting also deletes its refresh tokens and unused authorization codes. Dynamic client registration stays off until a client we test needs it.

People join through invites from the instance admin. Email is optional, over SMTP. With it, an invite can be sent by email, which verifies the address it is accepted with, and someone who can't sign in gets a one-time sign-in link at their verified address. Without it, whoever runs the server makes that link with the command line. Either way the link only signs the person in, once, so they can add a new passkey.

Until the web app and assistants can, the command-line tool also sets up spaces and imports skills. It is a stand-in, not the intended way to use Homing.

The command line and the database credentials are operator access. The command line takes any person's id without sign-in, and any connection with the credentials can mark itself as a person editing directly, so either can act as anyone, including changing guidance. An agent that can run commands where Homing runs, such as Claude Code on the same machine, has that access too. Once there is sign-in, a direct edit needs a signed-in person, and the command line keeps only what setting up an instance needs.

## Toward a hosted version

Homing is designed so it could run as a managed service, without building that in v1. Roots are organizational boundaries, not tenant isolation. A hosted service would also need identities, credentials, storage, indexes and execution kept separate per tenant.
