# Specification

How Homing must behave. The [concept](concept.md) explains the idea. This document makes it precise: the promises Homing keeps, how each part works, and what is still open. How it is built is described in the [architecture](architecture.md).

Each section opens with the short version. The details follow for those who need them.

## Guarantees

These hold for everything that passes through Homing, whatever the implementation.

1. **Nothing is published without authorization.** Homing never shows information to people who aren't authorized to see it, especially across clients. Publishing actions run at most once. If the outcome is unknown, Homing checks or asks instead of retrying.
2. **Every operation is checked for permission,** whatever a model asks for.
3. **Untrusted input is contained** by limiting what an agent can do, not by trusting how it reads.
4. **Only people change guidance.** Ingested content can never change rules, skills or permissions, and neither can an agent acting in your name without your explicit approval.
5. **Credentials never reach a model.** Personal connections are never shared, and Homing never silently switches identity.
6. **Mandatory guidance is never dropped** to save space.
7. **Everything records where it came from:** its sources, or the person or agent who wrote it.
8. **Records stay authoritative where they live.** Changes go back to their home system, under that system's permissions. Private notes are never written back.
9. **Homing is fully usable through MCP alone.** Every write names its destination.
10. **Spaces are portable.** Export and re-import keep a space's knowledge intact. Credentials and live external records are not exported.

For its own routines, guarantee 1 holds by design: runs are scoped before they start, and content carries its sources (§5, §8). For external agents such as Claude or ChatGPT, Homing checks every action performed through it and asks before anything unauthorized. It cannot know what an agent saw elsewhere, and doesn't pretend to.

The guarantees hold for everything that goes through Homing. Whoever can reach the server itself, such as its database or its administration tools, has operator access and can act as anyone. That is outside the guarantees, so agents must never be given it.

Two release tests make guarantees 2 and 10 concrete:

- **Leak test.** Two people in different client spaces, each with shared and private knowledge, try to read and write across clients through every storage path. The test runs through Homing and directly against the database with Homing's filters bypassed, so the database is shown to refuse on its own.
- **Round trip.** A space is exported and re-imported, and must come back intact.

## 1. Spaces and access

You can see a space's shared side if you have access to the space, and you always see your own private side. Access flows down the tree. Guidance is the one thing that reaches further.

**The access rule.** Everything in a space records its space and, when it is private, whose it is (`private_to`). You can see an item if you can access its space and it is either shared or yours.

- Access comes from memberships, parents and closed spaces. Homing keeps it in a derived access table, updated in the same transaction as the change, so removing someone takes effect immediately. Every query, search and job checks it.
- Only a space's admins create spaces under it. A child space passes the parent's shared guidance on to its own members, so creating one, and choosing its admins, delegates who receives that guidance.
- Guidance is the one exception. A shared rule is also visible in every space below its own that it reaches, rule by rule, never the whole guidance page. Private and *only here* rules stay where they are, private guidance reaches down only for its owner, and knowledge never reaches down. Because the exception is part of the rule, `context`, `search` and `read` always agree.

**Knowledge is shared with a space, not with individual members.** Published knowledge is seen by current and future members.

- Adding a member, or making someone an admin of a child space, is a sharing decision, and the interface makes that explicit.
- A new member sees the knowledge, not the original sources.
- A group that needs a restricted history uses a separate space.

**Your personal tree is private.** Spaces you create under your personal space are only yours. Nobody else can be given access, everything in them is on your private side, and Homing never suggests sharing there. Creating a space asks: "Just me, or with others?"

**Making a space collaborative** is a deliberate conversion. Inviting someone to a space in your personal tree starts it, or you can start it directly. Homing:

- moves the space and everything under it out of your personal tree, as a new root or under a shared space you choose;
- shows who will gain access;
- keeps all existing content on your private side, so the conversion exposes nothing;
- keeps what flows from bound places private until sharing is declared;
- lists the guidance that will stop applying, and offers to add it to the space (shared) or include it (only for you);
- keeps a link to the former parent, visible only to you;
- offers to prepare suggested shared knowledge for review.

**Archiving a space** takes finished work out of everyday attention. An archived space and its children leave daily context and their routines and upkeep pause, but they stay searchable and can be reopened. A person archives a space, and agents can suggest it. Archiving never deletes anything.

## 2. Guidance

Guidance is rules and skills. It applies down the tree, the more specific rule wins, requirements always apply, and only people change it.

**Stored like knowledge.** Guidance uses the same pages and content as knowledge (§3), with its own rules for who may write it, how far it reaches and how it loads. There are two reserved page types, fixed when the page is created:

- A **guidance page.** One per space, with one item per rule. A rule is a requirement or a preference, and can be marked *only here*. It exports as AGENTS.md.
- A **skill page.** Instructions plus files such as references and scripts, kept as a SKILL.md folder in the [Agent Skills](https://agentskills.io/specification) format, so it comes back out as it went in. It can be served as `skill://` resources. Homing makes skills available; whether an agent can run a skill's scripts depends on its client.

Homing picks the rules that apply and puts them in order, and requirements always load. Skills are picked by relevance.

**How it flows.**

- Guidance applies to its space and everything below it, unless it is marked *only here*.
- It reaches everyone in a child space, including people who can't access the parent. A closed space blocks inherited membership, not guidance. When you edit shared guidance, Homing tells you it also applies to child spaces, including closed ones you can't access, and that *only here* prevents it. It reveals nothing about those spaces.
- Your personal space's own guidance follows you everywhere. Spaces under your personal space behave like any other.
- An include pulls in other guidance by link. It expands only for readers who can access what it points to, and never grants access.

**Precedence.**

- Homing picks the rules that apply and orders them from least to most specific, with requirements marked. Personal-space guidance counts as the least specific.
- The more specific preference wins, and between equally specific preferences the private one wins. A preference never wins over a requirement.
- Homing doesn't judge whether two rules contradict each other, because that means interpreting their text. The agent does, and Homing can't guarantee it notices every contradiction.
- If two requirements conflict, the agent stops the affected action, tells the user which rules conflict, and can propose a fix.
- When someone adds a rule, they see the rules that already apply there.
- Skills are matched by name. A skill in a more specific space replaces an inherited one with the same name, personal skills are the least specific, and between equally specific skills the private one wins.

**Only people change guidance.** Agents act in your name through MCP, so your identity alone doesn't prove that *you* decided. Every write to a guidance or skill page, including its files and settings, passes one check in the store: it must be a direct edit by an authorized person, or an approved proposal (§6). That covers imports, MCP, background workers and any path added later. When you ask an agent to add a rule, you confirm the exact text.

Shared guidance is changed by the space's admins, and other members can propose changes. Private guidance is changed by its owner.

**Always live.** There is no version pinning. History and rollback are kept, and each run uses one consistent snapshot.

**It improves through use.** Three things lead to a proposed change: a correction, a contradiction with knowledge, and repeated failures. After a correction, the agent asks "just this time, or always?". "Always" becomes `guidance.propose` with the exact text, which works from any MCP client. Homing may learn to propose less without asking.

## 3. Knowledge

Knowledge is built from sources into pages of small, sourced items. Homing keeps it organized on its own, but only evidence changes what it says.

> Knowledge is structured only as much as necessary to maintain, retrieve and share it reliably.

**Three building blocks.**

| Block | What it is |
|---|---|
| Source | Where knowledge came from: a reference, permitted excerpts and its audience. It arrives from a place (§7), through your own connection, from an agent's report, or from you directly. |
| Page | One subject in one space, with a free-text type such as person, decision or meeting. Guidance names the types a space prefers. |
| Content | The knowledge itself, as Markdown items. Each item has its own visibility, sources, author (a person or an agent), protection and history, and can be superseded. |

There is no claim extraction, no fact keys and no automatic dependencies between items in v1. Keys can be added later if real use needs them.

**One page per subject, seen differently by each person.** Each person sees one assembled page: the shared items plus their own private ones, with no trace of anyone else's. A page has no side of its own. Its title and overview are built only from what the viewer can see, so a private page never shows up in search, links, counts or suggestions. One page per subject is the goal, not a guarantee. A duplicate is safer than a wrong merge.

**Small items where useful.** Anything that can go out of date, such as a date, an owner, a status, a decision, a commitment or a contact, is its own item with its own sources, so it can be updated alone. Background and reasoning stay as prose. Agents choose sensible boundaries, and ideas are marked as ideas.

**When a page is created.** When guidance names its type, when a person asks, or when an agent judges that someone would look the subject up by name. A subject coming up again is a signal, not a rule. Someone who only appears in sources doesn't get a page until they matter, so a mailbox with 20,000 contacts doesn't produce 20,000 pages.

**Knowledge without a home stays in its source.** Excerpts remain searchable, and when a subject earns a page, the page is built from them. Nothing is dumped on the overview.

**The overview is a map.** It holds a short summary of the space's current state, plus a list of its active pages that Homing generates. It is never an index written by an agent.

**Collections group pages without a second hierarchy.** Any page can gather other pages in its space, which makes it a collection, such as "2027 planning". A page can still hold knowledge of its own.

- Gathering is its own kind of link. Mentioning a page doesn't put it in a collection.
- A page can be in several collections, or in none. Collections don't nest, so a collection can't be gathered into another.
- People and assistants add and remove pages within the rights they already have.
- Collections follow the access rule like any page. Each person sees only the pages they can see, in lists and counts too, and gathering a page never changes who can see it.

**Upkeep.** Homing keeps improving how knowledge is organized and presented, while its meaning stays grounded in evidence. The agent doing the upkeep (Homing's own model, or an external agent if there is none) proposes operations from a fixed set. Homing applies them, checking permissions and protection and recording history. Every operation preserves visibility and provenance, and every operation can be undone.

| Operation | Rule |
|---|---|
| Write or update an item | Only from evidence. New evidence updates only the items it affects. The agent finds them; there is no automatic dependency chain. |
| Supersede an item | When evidence justifies it, such as an explicit change or a decision by someone with authority. The old item is kept as "was true until…". Newer isn't automatically right, so when it's unclear, both are marked uncertain. A private update can replace shared knowledge in your own view without changing what others see, and it shows that others still see the earlier version. Homing suggests sharing meaningful updates when appropriate. |
| Improve wording | Items written by agents only, and always regenerated from the item's sources, never from its previous text, so errors can't compound. |
| Combine duplicates | Keep one item, citing both sources. |
| Create, split or move | Items written by agents only. Text written by a person stays where it is and gets a link. |
| Mark pages as the same subject | Automatic when identifiers match. Otherwise the pages are marked "possibly the same". |
| Archive a page | Only with evidence that it is no longer active, such as a finished project or someone who has left. Age is not evidence. |

Upkeep runs when new evidence arrives, and in a periodic tidy pass per space that handles splits, duplicates, contradictions and inactive pages. The space's routine tidies the shared side, and each person's routine tidies their own private items.

**Text written by people is protected.** Agents never rewrite or supersede it. They can record conflicting evidence beside it, point out the difference and propose a change, but only a person decides whether it still holds. Agents keep what agents wrote up to date.

**Conflicts are marked uncertain,** never silently resolved.

**History.** What used to be true stays available. Superseded items and archived pages leave everyday context but remain searchable, so `read` can answer "Gunnar, project manager 2027–2029". Stable knowledge isn't obsolete: a page about Gunnar can stay current for years without changing. Not being relevant right now isn't a state, because ranking handles it.

- Every revision keeps the visibility of its item.
- When a source must be deleted, its excerpts go, including from history, along with any item that rests only on it. Prose that depended on it is flagged for regeneration, and text written by people is never silently overwritten.

**What is stored.** Knowledge, not conversation history. By default a source is a reference plus an excerpt, and a full copy is kept only when it is necessary and permitted. Content is Markdown, backed by one transactional store that nobody edits directly. Relationships come from explicit links between pages, not from things appearing together.

**Export** is an open bundle, compatible with the Open Knowledge Format where possible: pages, content, sources, links, stable IDs and history.

## 4. People and identity

Someone who uses Homing has an account. Everyone else is a page. Matching people across systems is conservative.

- **An account** belongs to someone who uses Homing. Its identifiers are the ones its provider verifies, plus the ones the person confirms. Connecting Gmail proves control of that account, not of every alias. Addresses only seen in messages are suggestions.
- **Everyone else is a page,** like any other subject. There is no contact database and no global person registry.
- **Identifiers are items with a structured value:** system, tenant, type and value, such as `slack · acme-workspace · U123`. They are the one structured key in knowledge, because routing depends on deterministic matching. They are indexed for matching, and visibility applies during matching: a private phone number never helps anyone else identify Gunnar. The strength of a match follows from the identifier's type.

**Matching is conservative.**

- An unambiguous ID in the right system and tenant matches automatically.
- An email address is a strong signal, not proof. Names and roles are weak signals, and aren't identifiers.
- Uncertain matches stay separate, and duplicates are tolerated.
- Merging is logical. Pages marked as the same subject are shown as one page to anyone who can see both. Nothing moves, so private items and history are untouched, and removing the link undoes it.
- Knowledge is never combined across spaces. Pages in different spaces that share an identifier are linked only for people who can access both.

**Signing in.** People sign in to Homing itself, and their assistants act as them.

- Joining is by invite only. When Homing starts and nobody looks after it yet, it shows a one-time setup link for the first account. That account is the instance admin: it invites people, but gets no access to anyone's spaces.
- A passkey is offered first, and a password is optional. The instance admin signs in only with passkeys. A person can add more ways to sign in to their account, and accounts are never joined because an email address matches.
- Recovery goes to the person's own verified email, which only they can change. Without email, whoever runs the server helps. Nobody, the instance admin included, can sign in as someone else.

## 5. Sharing

Homing learns privately by default and shares automatically only when sharing is already authorized. Otherwise it asks, once per clearly defined scope.

**Sources never change audience; knowledge is published from them.**

- Publishing creates or updates shared knowledge that stays linked to its private origin (`published_from`). The link is lineage, not sync. When your private version changes, you get a suggestion, unless a binding already covers the update. What others see never changes by itself.
- Others see who published something and when. They don't see the source, its sender or its subject. A source that is itself shared is cited normally.
- In your own view, the private and shared versions show as one while they agree, and the difference shows when they don't.
- Something you wrote yourself, such as a note or a draft page, simply moves to the shared side when you share it.

**Publishing checks the content's sources, not just who publishes.** Content that cites sources the destination's audience isn't authorized for never publishes automatically, and the approval says so: "includes information from Beta". Content with unknown sources never publishes automatically either. Provenance travels with the content, so the check still holds weeks later.

**Audience informs; authorization decides.** A source's audience is who could see it in its own system. Adapters report it when they can: an email's visible recipients, a channel's or DM's members, a meeting's attendees. Otherwise it is unknown, and the content stays private to whoever connected or supplied it. Audience alone never authorizes sharing, even when everyone in a space could already see the source, because the shared side also serves future members. Audience makes suggestions useful ("Ola was on this thread") and detects material changes.

**Homing only interrupts when a deliberate decision is needed:**

- an **approval,** when something is about to reach people who aren't authorized yet;
- a **suggestion,** when private knowledge would genuinely help a space. This happens in every ordinary space, even one with a single member, because the shared side serves future members too. It never happens in your personal tree.

**Ask once per clearly defined scope, not per fact.** For a thread or a channel, the choice is:

- **Share what's there now.** A one-time approval, and the default.
- **Keep learning from it.** A binding, which is ongoing and revocable.

**Two kinds of advance permission.**

- A **binding** lets knowledge flow from a place into a space. A place is a mailbox folder, a channel, a drive folder or a single thread. A thread is a place because it keeps receiving messages; a single email is a source.
  - A binding needs access to the place, admin rights on the space, and an explicit, recorded declaration that sharing with current and future members is authorized. Without the declaration, ingestion stays private.
  - Bindings across organizations get a stronger warning.
  - A binding is not a blanket waiver. It never overrides restrictions a source carries, such as a sensitivity label or a "do not forward" marking, and a material change in audience, like a new participant from another organization, pauses it.
  - Preferences about what to extract are not security boundaries.
- A **standing authorization** pre-approves a defined kind of action, such as replies within one thread or tasks in one Asana project.

An authorized person can create either one directly in the web app. When an agent suggests one, it becomes a proposal. Both paths are recorded the same way, both kinds can be revoked, and agents only suggest them when they can be clearly defined.

## 6. Proposals and approvals

Whenever Homing needs a person to decide, it creates a proposal: an exact change, waiting for the authorization it needs.

Homing is designed to be used through ordinary AI conversations, and everything can be started from any MCP client. Agents save and organize knowledge on their own. Changes to guidance, sharing and access are decided by people: you confirm the exact change in the conversation when the client can support that securely, and otherwise on a small confirmation page.

One concept covers guidance changes, sharing suggestions, publishing approvals, updates to published knowledge, and the catch-up when a space becomes collaborative. A proposal holds the change, why it was made (a correction, new evidence, an agent), its deciders and its state (open, approved, rejected or expired).

- **Approving runs exactly what was shown.** If the underlying thing changes first, the proposal is shown again.
- **Approval never grants permissions the approver doesn't have.** Every boundary a change crosses needs its own authorization, possibly from different people. Publishing your private knowledge to Acme needs your consent to disclose it and someone's right to publish in Acme. The owner approves disclosure first, so nobody else sees private content before its owner has agreed.
- **Only the proposer and the deciders can see a proposal.**
- **Direct edits skip proposals.** An authorized person editing in the web app simply saves. Both paths use the same checks and the same history.
- **An approval only counts through a channel the agent can't speak for.** An agent saying "the user approved" is never an approval.

**Approvals are the exception, not the routine.** They appear where you work: in chat when possible, otherwise in an inbox and a daily digest. Each one shows what, to whom and where it came from. They are grouped by destination, and single items can be excluded. If nobody answers, knowledge stays private, important items surface in context, and actions never run. Approval fatigue is tracked as a metric.

## 7. Connections and records

Spaces point to places; people hold keys. Records stay in the system where they live, and Homing reads them live.

| Concept | What it is |
|---|---|
| Connection | A key: credentials for one account in one system. It belongs to a person, or to a space for shared automation. It is encrypted and never visible to a model. |
| Place | A space's pointer to where things live: system, tenant and resource, such as "Acme's Asana, project Website". A place can be bound to its space (§5). |

- **Places are matched to keys automatically,** by stable IDs and a per-action check: can this connection do this here? Your own connection comes first, then an authorized space connection, and otherwise Homing asks. One connection can serve many spaces, and a space can use many connections.
- **Connection status is informative.** A missing connection is shown when it matters and never blocks other work.
- **Homing never needs exclusive control of an integration.** Agents can bring their own access, such as an organization's connectors, with no mode switch. What they report back is marked as agent-reported and stays private, and context says plainly what Homing can and can't reach. Only work Homing does itself needs a Homing key.

**Records.**

- Every record lives in one system, behind one record interface. Homing's own tasks are one system and Asana is another. Building for two from day one keeps the interface from becoming Asana-shaped.
- Homing's own tasks are deliberately minimal, so you can capture actions without another product: a title, a description, open or done, an optional due date, an optional assignee, space and visibility, and optional provenance. Recurrence, reminders, multiple assignees and project management are not part of v1.
- External records are read live through a connection that reaches the place, with a short-lived cache and no mirror in v1. The cache is reused only through the same connection, and Homing's access check runs before anything is served from it. Permission changes made in the external system take effect when the cache expires; no cache can do better without checking live. When a system is down, cached data is shown with its age. A persistent index is a later optimization.
- Freshness is shown honestly, not promised. Binding a place doesn't settle record permissions, because they can differ per item.
- **Annotations** are your notes on any record: items attached to a record instead of a page, with the same visibility, history and protection. They are never written back.

## 8. Routines

A routine is work that happens on its own. It always acts for a person or a space, never as "the system", and never beyond what a person has authorized.

**Two kinds.** System routines are built in and part of v1: capturing from connected sources, routing, triage and knowledge upkeep. They are what "learns automatically" depends on. User routines, such as "a status report every Friday", come later, along with external triggers and pluggable runtimes.

**What a routine is.** An owner, a trigger, a skill, a space and an output. Each run records who it acted for, which connection it used, what it did and which proposals it created. Triggers can come from Homing's schedule, from connection events, or from an external scheduler calling "run routine X". Homing orchestrates, and a pluggable runtime does the work.

**Every routine belongs to a person or a space. There is no system identity.**

- It works within its owner's current permissions, checked at every operation.
- Every external action goes through a specific authorized connection.
- It acts on its own within authorization a person has granted, and creates proposals beyond it. It can never approve anything or expand its own authority.
- It never inherits.

| | Person routine | Space routine |
|---|---|---|
| Reads | Every space its owner can access | Only its space, the guidance that reaches it, and its bound places |
| Uses | Its owner's connections | Only the space's connections, never a personal one |
| Lives in | The owner's personal space | The space |
| When people leave | Stops acting where its owner lost access, falls back to the personal space for routing, and tells its owner | Keeps running, and the space's admins are accountable for it |

A space routine never reads anyone's private side: if an automation needs your mailbox, it belongs to you. System routines are ordinary routines. Capturing from your mailbox is a routine you own, created when you connect it. Capturing from a bound place through a space connection is owned by the space.

**Private work is automatic; publishing isn't.** A person routine updates its owner's private knowledge, notes and tasks across all their spaces without asking. Weekly planning across clients is an ordinary person routine, and its results stay private. A routine publishes automatically only when both the action and every input are authorized for the destination. Being scoped to a space isn't enough: a private email about Acme doesn't become shareable because the routine runs in Acme.

**Containment.** A routine that reads untrusted input runs where all its tools come from Homing. A run that holds outside tools falls outside containment, and its output counts as agent-reported.

**Housekeeping isn't a routine.** Indexing, deletion cascades and cache expiry are deterministic code. They use no connections, never publish and run under the same access rules; only narrowly defined housekeeping gets elevated database access ([architecture](architecture.md)). Anything that uses a connection or interprets content with a model, including upkeep, is a routine with an owner. Embeddings follow the space's model setting.

**Routing.**

- Sources from bound places go to their space.
- Other sources land in your personal space. What they teach about other spaces goes on your private side there, citing them.
- One source can inform many spaces, and none of them is primary.
- Routing rules are guidance.
- Unclear knowledge waits quietly. An unclear action makes the agent ask.

## 9. Context

One `context` call gives an agent what it needs to start: the rules that apply, a map of the space, and what is relevant to the task.

| Layer | Contents |
|---|---|
| Core: stable for a person in a space until something changes | Identity and role, the rules that apply, the space overview, and a skill index |
| Relevant: adapts to the request | Relevant pages, decisions, records, recent changes, applicable skills, pending proposals and other important items |

Full details are available on demand.

- **Resolve, then assemble.** `context` takes a free-text request and, optionally, a space. Without a space, Homing works out the people, messages, records and topics involved, using the same matching as routing. If several spaces fit, it returns the candidates.
- **Local assembly never waits on external systems.** Guidance, overviews and indexed knowledge are assembled locally. Live lookups, such as external records or sources not yet indexed, go through `search` and `read`, or run under a strict time limit. The two are measured separately.
- **Retrieval uses structure but doesn't depend on it.** Candidates come from links and from content search in parallel and are ranked together, so retrieval still works when links are missing or wrong. Access is a filter, never a ranking signal. Relevance ranks first, and relationships, authority, freshness, closeness of the space and recency adjust it. Archived spaces and pages and superseded items are left out unless the request is about them or about the past.
- **Untrusted content is marked,** for example a client's email.

## 10. The agent interface

Agents use five MCP tools, to be refined by benchmark 2. `remember` changes your private state; `act` does everything else.

| Tool | Purpose |
|---|---|
| `context` | Resolve the space and assemble context, including pending proposals |
| `search` | Search everything you are authorized to see |
| `read` | Get details, including action schemas, proposals and skills |
| `remember` | Create or update your private state: knowledge, notes, annotations, identifiers and private tasks |
| `act` | Change an external system, publish, or make a governed change: `mail.send`, `asana.create_task`, `knowledge.publish`, `guidance.propose`, … |

The line between `remember` and `act` is where a change happens and whom it affects:

- "Remember to follow up with Gunnar on Friday" → `remember` creates a private task. Marking it done is `remember` too.
- "Create that task in my Asana project" → `act`, because it changes an external system.
- "Share the deadline with Ola" → `act`, because it publishes.
- "Always format my reports this way" → `act guidance.propose`.

More about the tools:

- `remember` needs no approval, but it still has permissions. It can't overwrite text people wrote, change guidance, or write to anyone else's private side.
- `remember` puts knowledge on the page for its subject: an existing page when there is one, a new one when the subject deserves it, and otherwise the space's notes, which upkeep can reorganize later. Sources can be kept on their own as evidence. An agent's own words are never treated as a source.
- `act` returns one of three outcomes: done, waiting for approval (with a form or a link), or blocked. Approval is never a tool.
- Every write can, and should, cite its sources.
- A new system adds actions to `act`, never new tools. `act` validates arguments, authorization and approvals.
- Whether an action publishes depends on its effect, not its name. A draft in a shared mailbox counts as publishing.
- The identity used for outgoing actions comes from your preference or from asking, never from the space.

**Clients.**

- There are three levels of integration: MCP only, which works whenever the client calls the tools; MCP plus one recommended instruction, which is more consistent; and native integration, where context loads reliably and sessions are captured through hooks. The recommended instruction is part of Homing's MCP instructions, so clients that show those follow it without setup.
- With native integration, Homing learns from conversations automatically unless you say "don't keep this". Otherwise it learns through `remember`. It keeps the knowledge, not the transcript, and background learning never depends on the chat client.
- Space detection is a suggestion that asks when unsure. Git remotes are hints. There is no hidden "current space".
- Homing requires no repository structure, local workspace or separate chat app. Prompts and MCP Apps are enhancements.
- Every assistant connects over OAuth and acts as the person who signed in and allowed it. A person sees their connected assistants and can disconnect any of them, which takes effect at once. Claude.ai and ChatGPT need a public HTTPS address, so an install reachable only locally needs a tunnel to serve them.

## 11. Models, distribution and other instances

Homing works without an AI model, and learns in the background when it has one. It is open source, self-hosted first, and can work with other Homing instances.

**Rules are code; models interpret.** Permissions, inheritance, publishing, storage, search, identity matching and applying upkeep are plain code. Extracting knowledge, proposing upkeep, ambiguous routing and part of contradiction detection use a model.

**The model is optional.**

- The core works without one. Guidance and context are deterministic, knowledge is read and written through MCP, search needs no embeddings, and people and external agents keep knowledge up to date. Without a model, Homing learns only through agents.
- Setup asks one question: which provider should Homing use for background learning (Claude, OpenAI, a local model…)? Cost and data-handling controls are part of that setup. A deployment sets a default, and a space can override it, for example with "no model processing".
- Identifier matching runs before any model, so a source that matches a space with no model processing is never sent to one. A source from an unknown sender is processed under the setting of the space where it lands, usually your personal space.
- "No model processing" governs only Homing's own inference, not what external assistants do. Self-hosting doesn't keep data local if the model is an external API. Setup states both limits plainly.

**Capabilities are independent.** Each one adds to the core, and none depends on another.

| Capability | Adds |
|---|---|
| Connections | Live records, planning across systems, actions |
| Model | Background learning: extracting knowledge, upkeep, triage, ambiguous routing |
| Client integrations | Automatic context loading and session capture |
| Routines | Scheduled and event-driven work |

**Distribution.** Open source under AGPL-3.0, and self-hosted first. The same codebase can run privately or as a managed service with the same features, and hosting is a convenience, never a dependency. The intent is that every feature stays open. Contributors sign an agreement that allows relicensing ([CONTRIBUTING](../CONTRIBUTING.md)). Self-hosting is part of the product: HTTPS, authentication, upgrades, backup and restore work out of the box.

**Other instances.** Instances are independent but can work together. Content from another instance stays authoritative there and is never copied automatically.

| Approach | Status |
|---|---|
| Several MCP servers in one assistant, each instance separate | Works in v1 |
| Your Homing as a gateway: connect another instance once, then search, context and records work across both, with no syncing | The goal, later |
| True federation: instances synchronize knowledge, identities and updates | Postponed, if ever |

When instances work together:

- The remote instance resolves its own guidance for you, including its requirements. Yours adds your personal guidance and private notes on top, and your notes stay on your instance. The remote space's rules beat your defaults, as usual.
- The remote instance enforces its own permissions and publishing. Each connection needs its own authorization, and tokens are never forwarded.
- What you learn from a remote instance is a source like any other: private unless sharing is authorized. Guidance from another root never silently becomes global.
- Identifiers are qualified by instance from day one.

## Benchmarks

To run before building more than is needed.

0. **Small items vs. a plain wiki.** Feed the same sources over simulated weeks into a plain agent-maintained wiki and into pages of small, sourced items kept by the upkeep operations. Compare correctness, staleness, drift, traceability and cost. Add structure only where it wins.
1. **MCP reliability.** How consistently Claude and ChatGPT call Homing on realistic prompts, with MCP only and with one recommended instruction.
2. **Tool design.** Whether agents build `act` payloads correctly compared with dedicated tools, and whether they choose correctly between `remember` and `act`.
3. **Context size.** Core only, core plus relevant summaries, and core plus full pages, compared on quality, number of calls, latency and tokens.
4. **Retrieval.** Links plus full-text search, with and without semantic search, with row-level security on.
5. **Planning latency.** Weekly planning across 5 to 10 external systems. At 15 to 30 seconds, add caching or indexing.
6. **Prompt-cache reuse** across clients.

## Workflows checked against the design

Morning email triage, shared project knowledge and cross-client weekly planning all fit the design without new concepts, and each has been walked through the data model. None has run end to end yet.

## Open questions

- **Context.** Should the guidance that applies be precompiled per person and space, and how is it invalidated? What is the default context budget?
- **Knowledge.** How is it tracked that a source is still available and still permitted? How should active knowledge work: finding gaps, then investigating them on your private side?
- **Sharing.** Audience reporting for systems beyond email, chat and meetings, such as Asana and Drive, which count as unknown until then. If a private source is deleted, does knowledge published from it stay, flagged "source removed"? Leaning towards yes, because a person vouched for it.
- **Interface.** How should client integrations work, starting with a Claude Code plugin?
- **Connections.** How does OAuth to external systems work across tenants? Which adapters come first: APIs, MCP clients, local bridges such as iMessage on a Mac, webhooks? Should there be one Connections screen plus status in each space?
- **Records.** Which write operations come first? Calendars: availability, opt-in "busy" blocks, and what event titles reveal. The planning skill: deadlines, priorities, effort, availability, dependencies and private notes.
- **Routines.** What is the minimal runner for v1 (scheduling, retries, history), and later the full orchestration engine?

## Deferred

Waiting for a real need:

- Whether a link between spaces needs the other side to accept it.
- Custom record types, and structured fields on page types.
- Spaces as members, "everyone" as a member, synced membership, and membership expiry.
- Guidance that follows a space's members into other trees.
- Sessions that serve several people at once.
- What happens to private sides when someone leaves.
- Retention, legal holds and audit rights.
- Treating other restructuring, such as moving a space between shared parents or un-closing it, as sharing.
