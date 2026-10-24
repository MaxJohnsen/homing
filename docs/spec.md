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
- **Round trip.** A space is exported, imported and exported again, and the two exports must say the same: its knowledge, who sees what, how things hang together, sources, history, rules, skills and tasks, and who did what. Only IDs, what records the import, and includes of guidance outside the export, which can't come back, may differ.

## 1. Spaces and access

You can see a space's shared side if you have access to the space, and you always see your own private side. Access flows down the tree. Guidance is the one thing that reaches further.

**The access rule.** Everything in a space records its space and, when it is private, whose it is (`private_to`). You can see an item if you can access its space and it is either shared or yours.

- Access comes from memberships, parents and closed spaces. Homing keeps it in a derived access table, updated in the same transaction as the change, so removing someone takes effect immediately. Every query, search and job checks it.
- Only a space's admins create spaces under it. A child space passes the parent's shared guidance on to its own members, so creating one, and choosing its admins, delegates who receives that guidance.
- Guidance is the one exception. A shared rule is also visible in every space below its own that it reaches, rule by rule, never the whole guidance page. Private and *only here* rules stay where they are, private guidance reaches down only for its owner, and knowledge never reaches down. An include (§2) doesn't widen it: what it brings in is seen only by those who can access where it's set. Because the exception is part of the rule, `context`, `search` and `read` always agree.

**Knowledge is shared with a space, not with individual members.** Published knowledge is seen by current and future members.

- Adding a member, or making someone an admin of a child space, is a sharing decision, and the interface makes that explicit.
- Only people change who has access. Admins add people who already use Homing, directly in the app or by approving what their assistant proposes. An assistant names someone the person shares a space with by name, asking which when a name fits several, and anyone else by email. It never learns whether an email has an account: that shows only where the person decides. A space always keeps an admin.
- A new member sees the knowledge, not the original sources.
- A group that needs a restricted history uses a separate space.

**Your personal tree is private.** Spaces you create under your personal space are only yours. Nobody else can be given access, everything in them is on your private side, and Homing never suggests sharing there. Creating a space asks: "Just me, or with others?"

**Assistants can suggest a space.** When a project or an area of life keeps coming up and no existing space or collection fits, an assistant can suggest a space for it. The suggestion is a proposal (§6) with the space's name, where it sits and who will see it, and the person can change these before creating it. A space the person asks for is created at once when only they will have it. A space's name is seen by everyone who can open it, so a space others would see, or a new name for one, needs the person to create it or approve it. A declined suggestion isn't made again, and creating a space never moves or shares anything.

**Making a space collaborative** is a deliberate conversion. Inviting someone to a space in your personal tree starts it, or you can start it directly. Homing:

- moves the space and everything under it out of your personal tree, as a new root or under a shared space you choose;
- shows who will gain access;
- keeps all existing content on your private side, so the conversion exposes nothing;
- keeps what flows from bound places private until sharing is declared;
- lists the guidance that will stop applying, and offers to add it to the space (shared) or include it (only for you);
- keeps a link to the former parent, visible only to you;
- offers to prepare suggested shared knowledge for review.

**Archiving a space** takes finished work out of everyday attention. An archived space and its children leave daily context and their routines and upkeep pause, but they stay searchable and can be reopened. A person archives a space, and agents can suggest it, though not again once the person has kept it open. Archiving never deletes anything.

- A space's admins archive and reopen it. A space only you have is archived as soon as you ask your assistant, the way renaming it is; one others have waits for an admin's approval.
- A space in an archived one is archived with it, as far as each person can see. Archiving passes down only through spaces you can open, so the members of a closed space never learn of an archived space above it. Only the admins of the space that was archived reopen it.

## 2. Guidance

Guidance is rules and skills. It applies down the tree, the more specific rule wins, requirements always apply, and only people change it.

**Stored like knowledge.** Guidance uses the same pages and content as knowledge (§3), with its own rules for who may write it, how far it reaches and how it loads. There are two reserved page types, fixed when the page is created:

- A **guidance page.** One per space, with one item per rule. A rule is a requirement or a preference, and can be marked *only here*. It exports as AGENTS.md.
- A **skill page.** Instructions plus files such as references and scripts, kept as a SKILL.md folder in the [Agent Skills](https://agentskills.io/specification) format, so it comes back out as it went in. It can be served as `skill://` resources. Homing makes skills available; whether an agent can run a skill's scripts depends on its client.

Homing picks the rules that apply and puts them in order, and requirements always load. Skills are picked by relevance.

**How it flows.**

- Guidance applies to its space and everything below it, and wherever its space's rules are included, unless it is marked *only here*, which keeps it out of includes too.
- It reaches everyone in a child space, including people who can't access the parent. A closed space blocks inherited membership, not guidance. When you edit shared guidance, Homing tells you it also applies to child spaces, including closed ones you can't access, and that *only here* prevents it. It reveals nothing about those spaces.
- Your personal space's own guidance follows you everywhere. Spaces under your personal space behave like any other.
- An include pulls in guidance from elsewhere by link, below.

**Includes.** A space's guidance can include another space's rules, or a single skill, by link instead of by copy, so what it brings in stays as it's set where it lives.

- Including a space brings in its rules that reach beyond it: its shared rules, and the reader's own private rules there, never those marked *only here*. Including a skill brings that one skill. Single rules aren't included.
- It brings in what is set in that space, not what the space inherits or includes itself. Includes don't chain, so two spaces that include each other each get the other's own rules once, and nothing loops.
- It expands for each reader when guidance is read, only if they can access what it points to. Someone who can't sees nothing of it, not even that it's there. It never grants access, and a change where it's set applies everywhere it's included.
- The one exception is the space's admins, who look after its shared guidance: for an include for everyone that they can't access, they see that it's there, whether it's rules or a skill, and who added it when, never what it points to, and they can stop including it. So an include never outlives everyone who could remove it.
- An include is for everyone in the space or only for you, and like a skill it applies in its space and the spaces below. One for everyone can point only to shared guidance, so what only you have can be included only for you. Something included for everyone isn't included again just for you, and including it for everyone replaces your own include of it. Anyone else's own include of it waits: they see it marked as waiting, it brings nothing more, and it applies again if the one for everyone is stopped, which stops it only for those who don't include it themselves. Guidance that already applies, such as a space above or your personal space, isn't included again.
- An include is guidance, changed like a rule. Proposing one shows the rules or skill it would bring in, as they are now, and approving it runs exactly that. An admin deciding a request who can't access what it points to sees nothing of it: they can only decline one to include it, and can approve one to stop including it.

**Precedence.**

- Homing picks the rules that apply and orders them from least to most specific, with requirements marked. Personal-space guidance counts as the least specific.
- An included rule counts as set in the space that includes it, after the rules inherited from above and before the space's own: inherited, then included, then local. A rule that reaches a space more than one way counts once, where it is most specific.
- The more specific preference wins, and between equally specific preferences the private one wins. A preference never wins over a requirement.
- Homing doesn't judge whether two rules contradict each other, because that means interpreting their text. The agent does, and Homing can't guarantee it notices every contradiction.
- If two requirements conflict, the agent stops the affected action, tells the user which rules conflict, and can propose a fix.
- When someone adds a rule, they see the rules that already apply there.
- Skills are matched by name. A skill in a more specific space replaces an inherited one with the same name, personal skills are the least specific, and between equally specific skills the private one wins. An included skill counts as set in the space that includes it, and a skill with its name set there wins.

**Only people change guidance.** Agents act in your name through MCP, so your identity alone doesn't prove that *you* decided. Every write to a guidance or skill page, including its files, settings and includes, passes one check in the store: it must be a direct edit by an authorized person, or an approved proposal (§6). That covers imports, MCP, background workers and any path added later. When you ask an agent to add a rule, you confirm the exact text.

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

**No sections.** A page is its items in order. Headings inside an item give longer prose its structure, and a sprawling page is split into pages that a collection gathers. A coherent document isn't split just because it's long.

**Substantial work stays whole.** People and assistants develop long documents, research and analyses over many sessions, often with different assistants. The next session carries the work on without losing its structure, reasoning, references or history. A document kept in Homing stays intact, and can be read, edited and exported as a whole. One whose home is elsewhere, such as a repository or a drive, stays there, and Homing works with it rather than copying it. In Homing, a document is an item on a page, or a few, with no building block of its own, and it is read as written, with its structure. Part of it can be changed without sending the rest: changing a passage, such as one section, is an update or a replacement like any other, allowed where they are and recorded in its history. It's made to the text as it is then, so a change made meanwhile is never undone. Such a document is deliberate work, which upkeep leaves whole (below).

**When a page is created.** When guidance names its type, when a person asks, or when an agent judges that someone would look the subject up by name. A subject coming up again is a signal, not a rule. Someone who only appears in sources doesn't get a page until they matter, so a mailbox with 20,000 contacts doesn't produce 20,000 pages.

**Knowledge without a home stays in its source.** Excerpts remain searchable, and when a subject earns a page, the page is built from them. Nothing is dumped on the overview.

**The overview is a map.** It holds a short summary of the space's current state, plus a list of its active pages that Homing generates. It is never an index written by an agent. The summary is optional and ordinary knowledge: anyone who may change the space's shared knowledge changes the shared summary, and assistants keep the user's own, shared later like anything else, unless the user wrote it themselves, which their assistant changes only when they ask. Someone's own summary takes the shared one's place for them only when it explicitly replaces it.

**Collections group pages without a second hierarchy.** Any page can gather other pages in its space, which makes it a collection, such as "2027 planning". A page can still hold knowledge of its own.

- Gathering is its own kind of link. Mentioning a page doesn't put it in a collection.
- A page can be in several collections, or in none. A collection can be gathered into another without making a hierarchy: each lists only the pages it gathers, and nothing passes down through it.
- People and assistants add and remove pages within the rights they already have. Like an item, putting a page in a collection is shared or only yours, and assistants do it on your private side.
- Collections follow the access rule like any page. Each person sees only the pages they can see, in lists and counts too, and gathering a page never changes who can see it.

**Upkeep.** Homing keeps improving how knowledge is organized and presented, while its meaning stays grounded in evidence. The agent doing the upkeep (Homing's own model, or an external agent if there is none) proposes operations from a fixed set. Homing applies them, checking permissions and protection and recording history. Every operation preserves visibility and provenance, and every operation can be undone.

Upkeep reorganizes, condenses or supersedes only what routines derived from sources. Everything else is deliberate work: what a person wrote, or what their assistant wrote with them in a conversation, from a fact it saved to a report, an analysis or an outline. Deliberate work stays as it is unless someone asks for a change, and where new evidence disagrees with it, upkeep records the evidence beside it and points out the difference. The two are told apart by who wrote them, on the same pages and items, so deliberate work needs no building block of its own.

| Operation | Rule |
|---|---|
| Write or update an item | Only from evidence. New evidence updates only the items it affects, and only what routines derived. The agent finds them; there is no automatic dependency chain. |
| Supersede an item | Only what routines derived, when evidence justifies it, such as an explicit change or a decision by someone with authority. The old item is kept as "was true until…". Newer isn't automatically right, so when it's unclear, both are marked uncertain. A private update replaces shared knowledge only in your own view, and only when it names the item it replaces, never because it is newer. It takes that item's place for you and says that others still see the earlier version, which you can look at, until you share it (§5). Others see no trace of it. Homing suggests sharing meaningful updates when appropriate. |
| Improve wording | What routines derived only, always regenerated from the item's sources, never from its previous text, so errors can't compound. |
| Combine duplicates | Only what routines derived: keep one item, citing both sources. Deliberate work always stays as it is, so a duplicate of it is pointed out as possibly the same, and both stay. |
| Create, split or move | What routines derived only. Deliberate work stays where it is, whole, and gets a link. |
| Mark pages as the same subject | Automatic when identifiers match. Otherwise the pages are marked "possibly the same". |
| Archive a page | Only with evidence that it is no longer active, such as a finished project or someone who has left. Age is not evidence. |

Upkeep runs when new evidence arrives, and in a periodic tidy pass per space that handles splits, duplicates, contradictions and inactive pages. The space's routine tidies the shared side, and each person's routine tidies their own private items.

**Text written by people is protected.** Agents never rewrite or supersede it, with the one exception below. They can record conflicting evidence beside it, point out the difference and propose a change, but only a person decides whether it still holds. Routines keep what they derived up to date, and assistants in a conversation keep what assistants wrote up to date; upkeep doesn't rewrite it (above). A person's assistant does so on their private side: its change to something shared is their own update of it, which the others see once they share it (§5).

**Your assistant changes your own text when you ask.** In a conversation, a person's assistant can change what the person wrote themselves, whole or a passage at a time. On their private side it changes it where it is. On the shared side the change is their own update of it, which the others see only once the person shares it (§5), and the shared text itself stays as it is. Either way it stays theirs: they remain its author, its history records that their assistant made the change, and the earlier version stays, for them to restore. Homing can't verify that the person asked, and takes the assistant's word for it. That is accepted only because the change is private, recorded and can be undone. What someone else wrote, or what was imported, never changes this way, and whether something the person wrote on their private side is no longer true stays theirs to decide. A routine never changes what a person wrote.

**Conflicts are marked uncertain,** never silently resolved.

**Archiving a page** takes it out of everyday context and the space's list of pages, and it stays searchable and can be reopened. Anyone who can write in the space archives or reopens a page directly. An assistant does so at once only for a page in a space nobody else can open, and otherwise proposes it for a person to approve, whatever is on the page. A suggestion of its own rests on evidence that the page is no longer active, and isn't made again once the person keeps the page open. It is one state for everyone who can see the page, recorded in its history, and it never deletes anything. What someone did with a page while it was theirs alone, such as archiving it, stays theirs: others see its history from when they could first see the page, so to them a page archived before then is archived since then, by nobody named.

**History.** What used to be true stays available. Superseded items and archived pages leave everyday context but remain searchable, so `read` can answer "Gunnar, project manager 2027–2029". Stable knowledge isn't obsolete: a page about Gunnar can stay current for years without changing. Not being relevant right now isn't a state, because ranking handles it.

- Every revision keeps the visibility of its item.
- Whoever may change an item, a space's overview included, can restore an earlier version. Restoring is a change of its own, recorded like any other.
- When a source must be deleted, its excerpts go, including from history, along with any item that rests only on it. Prose that depended on it is flagged for regeneration, and text written by people is never silently overwritten.

**What is stored.** Knowledge, not conversation history. What an important session worked out can be kept, and its transcript only selectively (§10). By default a source is a reference plus an excerpt, and a full copy is kept only when it is necessary and permitted. Content is Markdown, backed by one transactional store that nobody edits directly. Relationships come from explicit links between pages, not from things appearing together.

**Export.** Anyone who can open a space can export it. The export holds everything they see there and in the spaces below it they can open: the shared side, and their own private side, marked as theirs, never anyone else's. That is its pages with their types, the items on them with their sources' permitted excerpts and history, including superseded items and archived pages, the links between pages, collections, the overview, rules, skills with their files, what each space's guidance includes, and tasks. Sources kept in other spaces, such as another client's, stay there, and what rests on them says so. A space below that the person can't open leaves no trace, not even its name. Items, tasks and spaces keep their dates, but what someone did with a page while it was theirs alone, such as archiving it, stays theirs. Connections, the places they reach, their credentials and live external records are never exported: whoever imports a space connects their own. An assistant gives the person the link to download it.

- An export imports again, into this Homing or a newer one, whatever its size, up to 2 GB, the most an import takes. Homing checks each one by reading it as an import would before handing it out. A space with more is refused before anything downloads, saying so, and a big one's spaces can be exported one at a time. One holding something an import refuses, such as a rule with a character nobody sees, is refused too, saying which and what to do: retype it, or, for what's shared, ask an admin of its space to. A skill's file that would land outside its folder is left out.

- Includes come as the person sees them: those for everyone, and their own, marked as waiting where the space includes the same for everyone, never anyone else's, and never one of something they can't open, which leaves no trace. One of something in the export points to it there. One of something outside it says what it brought in, by name, so it's clear that guidance came from elsewhere.
- The bundle is readable as it is: the knowledge as Markdown in the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format), and the rules and skills beside it as AGENTS.md and SKILL.md folders.
- Everything keeps its stable ID and who did it: a person by name, told apart from others with the same name, an agent acting for them, or a space's routine. A manifest holds what importing it again needs, and importing it into a new space brings the space back intact (guarantee 10).

**Import.** A person imports an export in the web app, as a new space of their own with the spaces that came with it below it, and only they have it until they add people the usual way. Before anything is created, they see what it brings, its rules word for word, naming what they refer to, and its skills by name, because their assistants will follow them, and where the export says it came from, as what it says. Then that same export is imported, all of it, or none of it. A big one takes a while: they see how far it's got, and it carries on if they leave. Homing reads one export at a time, so one may wait its turn. Nobody sees the new spaces until everything is in, not even them. If it fails, or Homing stops on the way, what went in is taken out again, and they're told.

- What the export shared goes on the new space's shared side, and what was private becomes the person's own. Nothing goes into their personal tree.
- Everything gets a new ID, and every reference follows, in text too, rules and skills' files included. In those, a reference to something the export doesn't hold stays as written. Each thing records that it was imported, by whom, when, from where, and its ID there.
- Who did what comes along as imported provenance, by name, and nobody here is credited with it, not even with creating the spaces: an imported "Anna" is never a local Anna, nor the person importing. Sharing something imported keeps her as its author. What a person wrote stays protected from agents, as it was. What rested on sources the export didn't hold never counts as resting only on what everyone can see, and what was private before it was shared stays private.
- What the spaces include from each other comes along, for everyone or as the person's own, as it was, through the same checks as any include. An include of something outside the export can't: the preview names it, such as "Acme included the rules of Standards, which isn't in the file. They won't apply here", and it's left out.
- Whether each space is archived comes along, and so does each page's archive history, shown to each person as any page's is. A space's archive history doesn't: each entry is only for whoever archived or reopened the space, so imported it would show to nobody, or be credited to the person importing.
- An export is untrusted. One that's damaged, changed, from a newer version of the format, from an earlier one Homing no longer reads, which can be exported again, or too big is refused with nothing created, and so is one that holds more than Homing keeps, such as a rule over 4,000 characters, or that hides something in a space's name, or in a rule or a skill's file as it stands, with characters nobody sees or that turn text around. What one said before, and one that's gone, are history nobody follows, and come in as they were. Names of people and agents come in plainly, on one line, without such characters.

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

- Publishing creates shared knowledge that stays linked to its private origin (`published_from`). The link is lineage, not sync: what others see never changes by itself.
- Others see who published something and when. They don't see the source, its sender or its subject. A source that is itself shared is cited normally.
- In your own view, what you shared shows once: what everyone sees, with your own sources. Changing it is your private update of it (§3), which you get a suggestion to share, unless a binding already covers the update. Sharing it is publishing like any other, with the same checks and approvals, and replaces the earlier version for everyone, so you all see the same again.
- Something you wrote yourself, such as a note or a draft page, simply moves to the shared side when you share it.

**Publishing checks the content's sources, not just who publishes.** Content that cites sources the destination's audience isn't authorized for never publishes automatically, and the approval says so: "includes information from Beta". Content with unknown sources never publishes automatically either. Provenance travels with the content, so the check still holds weeks later. Only a source shared in the same space is one its members can always see, future members included; any other, private or another space's, even the space above, counts as one they can't.

**Audience informs; authorization decides.** A source's audience is who could see it in its own system. Connectors report it when they can (§7): an email's visible recipients, a channel's or DM's members, a meeting's attendees. Otherwise it is unknown, and the content stays private to whoever connected or supplied it. Audience alone never authorizes sharing, even when everyone in a space could already see the source, because the shared side also serves future members. Audience makes suggestions useful ("Ola was on this thread") and detects material changes.

**Homing only interrupts when a deliberate decision is needed:**

- an **approval,** when something is about to reach people who aren't authorized yet;
- a **suggestion,** when private knowledge would genuinely help a space. This happens in every ordinary space, even one with a single member, because the shared side serves future members too. It never happens in your personal tree.

**Ask once per clearly defined scope, not per fact.** For a thread or a channel, the choice is:

- **Share what's there now.** A one-time approval, and the default.
- **Keep learning from it.** A binding, which is ongoing and revocable.

**Two kinds of advance permission.**

- A **binding** lets knowledge flow from a place into a space. A place is a mailbox folder, a channel, a drive folder or a single thread. A thread is a place because it keeps receiving messages; a single email is a source.
  - It is the explicit authorization of what may reach the shared side, separate from connecting the place. Connecting something, even inside the space, never authorizes publishing what's in it, and neither does its audience.
  - A binding needs authority over the place, admin rights on the space, and an explicit, recorded declaration that sharing with current and future members is authorized. Without the declaration, ingestion stays private.
  - A bound place can be read through a connection the space owns, so automation keeps running without any one member. A connection made for the space belongs to the space, even when someone signs in with their own account to make it, which they agree to then. A personal connection never becomes the space's, and the space's own automation never uses one.
  - Bindings across organizations get a stronger warning.
  - A binding is not a blanket waiver. It never overrides restrictions a source carries, such as a sensitivity label or a "do not forward" marking, and a material change in audience, like a new participant from another organization, pauses it.
  - Preferences about what to extract are not security boundaries.
- A **standing authorization** pre-approves a defined kind of action, such as replies within one thread or tasks in one Asana project.

An authorized person can create either one directly in the web app. When an agent suggests one, it becomes a proposal. Both paths are recorded the same way, both kinds can be revoked, and agents only suggest them when they can be clearly defined.

## 6. Proposals and approvals

Whenever Homing needs a person to decide, it creates a proposal: an exact change, waiting for the authorization it needs.

Homing is designed to be used through ordinary AI conversations, and everything can be started from any MCP client. Agents save and organize knowledge on their own. Changes to guidance, sharing and access are decided by people: you confirm the exact change in the conversation when the client can support that securely, and otherwise on a small confirmation page.

One concept covers guidance changes, sharing suggestions, suggested spaces, publishing approvals, updates to published knowledge, and the catch-up when a space becomes collaborative. A proposal holds the change, why it was made (a correction, new evidence, an agent), its deciders and its state (open, approved, rejected or expired).

- **Approving runs exactly what was shown.** If the underlying thing changes first, the proposal is shown again.
- **Approval never grants permissions the approver doesn't have.** Every boundary a change crosses needs its own authorization, possibly from different people. Publishing your private knowledge to Acme needs your consent to disclose it and someone's right to publish in Acme. The owner approves disclosure first, so nobody else sees private content before its owner has agreed.
- **Only the proposer and the deciders can see a proposal.**
- **Direct edits skip proposals.** An authorized person editing in the web app simply saves. Both paths use the same checks and the same history.
- **An approval only counts through a channel the agent can't speak for.** An agent saying "the user approved" is never an approval.

- **A member asks the admins.** A change that only a space's admins may make, such as to its shared rules, becomes a request when a member wants it. The member confirms the exact request first, every admin sees it, and one admin's decision settles it. Admins are emailed when Homing sends email, the email only links to the request, and the member learns the outcome there or from their assistant.

**Ask as little as possible, but always when it matters.** The goal is fewer approvals, not faster ones.

- **Routine work doesn't ask.** Within the rights a person already has, their private work happens directly: saving and correcting knowledge, changing what they wrote when they ask their assistant to, keeping what agents wrote current, organizing collections, keeping private tasks, creating, renaming or archiving spaces only they have, and archiving pages in them.
- **What matters always asks:** sharing private information, changing guidance, adding people or changing access, archiving what others see, and external actions nobody authorized in advance. Approving is one clear action where you work: in chat when possible, and otherwise on Home in Homing. Each approval shows what, to whom and where it came from.
- **Related changes are one decision.** When one request needs several of these, such as a new space, what goes in it and a person to add, they come as one proposal that shows the whole plan, every change with its consequences, such as what the new person will see there. The person approves it as it is, or asks the assistant to revise it, which withdraws it and proposes it again; nothing can be added to it afterwards. Approving checks every change again and applies them together in one transaction: if one can no longer be made, nothing changes, and the person sees which one and why. External actions, such as a message sent through another service, are never promised to happen together unless that service supports it. A proposal has one destination, a space it may also create, and one person who decides it: changes that need different people's approval are separate proposals. Admin requests stay separate, each decided on its own, and so does including guidance from elsewhere. Routine work that needs no approval is never put in one: a space only the person will have is created at once, and what goes in it is kept on their side there until the proposal shares it. A space others would see from the start is created by the proposal, with its rules and who's in it, and what goes in it is shared once it exists.
- **Proposals can be withdrawn.** The person a proposal is for, or their assistant, can withdraw it while it waits, including a request sent to admins. Withdrawing never decides it, and admins aren't emailed again: the request's link shows that it was withdrawn. Assistants learn how a proposal ended from Homing, never from what they said before.
- **Recurring actions can be allowed in advance** with a standing authorization (§5). It is specific, understandable and revocable, and suggested only for actions people actually repeat, such as sharing the tasks you create in one space. Changing rules and adding people are never pre-approved.
- **A request in chat isn't an approval.** The assistant may be acting on something it read elsewhere, so a sensitive change waits for the person even when the assistant says they asked for it. A change to the person's own private text isn't sensitive in this sense, because it's private, recorded and can be undone (§3).

If nobody answers, knowledge stays private, important items surface in context, and actions never run. Approval fatigue is tracked as a metric.

## 7. Connections and records

Spaces point to places; people hold keys. You connect a system in the space it belongs to, and what it brings stays yours unless sharing it is authorized. Records stay in the system where they live, and Homing reads them live.

| Concept | What it is |
|---|---|
| Connection | How Homing gets in: credentials for one account in one system, such as a work Microsoft 365 account. It belongs to the person who connected it, or to a space for shared automation. It is encrypted and never visible to a model. |
| Place | What Homing reaches: a space's pointer to where things live, with system, tenant and resource, such as a mailbox or "Acme's Asana, project Website". A place someone adds for themselves is on their private side there. |
| Binding | What may be shared: an explicit authorization for knowledge from a place to reach its space's shared side (§5). |

- **You connect things where they belong.** A person adds a place from inside a space, such as their work mailbox in their company's space, through their own connection to that system. The space gives Homing the context to use it in, and is the private home for the place's settings and the sources it brings. What they add is only theirs by default, even in a space with other members, who can't discover it, its sources or what it taught them. What it brings reaches the space only by publishing or a binding (§5). For a resource meant for the whole space, such as a team's project folder, an admin with authority over it binds it to the space (§5), and can read it through a connection the space owns.
- **One way for every system.** Homing knows each system through its connector: how a person connects an account there, which kinds of places an account reaches, and how to find and read what's in them. Everything else is the same for every system: which places a request reaches, how long Homing waits, what a refusal means, what each use records, how what Homing read is set apart from its own words, and how it's kept as a source.
- **A place has a kind,** such as a mailbox, a calendar or a company in an accounting system, which says what Homing can do there. Some are the account's own, such as its mailbox, which connecting adds. Others the person chooses among those the account reaches, such as the one company a space is about. A kind may be searched live, or only read by reference and learned from, such as an accounting system's records.
- **References.** What Homing reads in a place has a reference naming its system, its place and its id there, such as `microsoft:…:…`, by the id that best survives moves. Only the place's owner gets anything by it. References to emails from before Homing had connectors, `mail:…`, keep working. Only what's shaped like a reference is one: a citation an assistant gives, such as "Microsoft: Azure pricing page", stays its own, agent-reported.
- **Who could see it.** A source Homing read itself keeps its audience where Homing knows it, such as an email's To and Cc (§5). Otherwise its audience is unknown, as it is for everything an assistant reports, and unknown is never safe to publish. A known audience never authorizes sharing on its own.
- **Places are matched to keys automatically,** by stable IDs and a per-action check: can this connection do this here? Your own connection comes first, then an authorized space connection, and otherwise Homing asks. One connection can serve many places in many spaces, and a space can use many connections.
- **One connection for every use.** The same connection and place serve reading on request, learning from what's already there (§8), learning from what arrives and, later, authorized actions. A connection is useful before Homing learns from it: the person's assistant can already search and read their mailbox through Homing (§10). Each use records which connection and place it used and what Homing did, such as searching or reading, which only its owner sees, and is kept for 90 days.
- **Revoking an account** stops everything that relies on it, in every space, at once. Knowledge already kept from it stays, and who can see it doesn't change. Removing a place from a space stops only its use there.
- **Connection status is informative.** A missing connection is shown when it matters and never blocks other work. One the system stops letting in, because its owner withdrew consent there or its sign-in expired, needs its owner: Homing stops using it, says so wherever it's shown, and doesn't try it again until they sign in again.
- **Two ways to work with an outside system, and neither replaces the other.** An assistant can use its own integrations, such as its own Outlook connector beside Homing, with nothing to set up in Homing and no mode switch. What it brings is marked agent-reported and stays private: Homing never claims to have checked the original or who could see it, and it can't watch a system it reaches only through an assistant. When the system is connected to Homing directly, Homing reads it itself, keeps knowledge current and, later, acts in it with no assistant open. Background learning and routines need that. One person can use both for the same system, and Homing keeps them apart: it never takes what an assistant reported for what it read itself. Context says plainly what Homing can and can't reach.

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
- Everything it reads or does in an outside system goes through a specific authorized connection, checked each time.
- It acts on its own within authorization a person has granted, and creates proposals beyond it. It can never approve anything or expand its own authority.
- It never inherits.

| | Person routine | Space routine |
|---|---|---|
| Reads | Every space its owner can access | Only its space, the guidance that reaches it, and its bound places |
| Uses | Its owner's connections | Only the space's connections, never a personal one |
| Lives in | The owner's private side where it was set up, by default their personal space | The space |
| When people leave | Stops acting where its owner lost access, falls back to the personal space for routing, and tells its owner | Keeps running while its own authorization holds, and the space's admins are accountable for it |

A space routine never reads anyone's private side or uses a member's connection, even one set up from that space: if an automation needs your mailbox, it belongs to you. System routines are ordinary routines. Capturing from your mailbox is a routine you own, created when you connect it, even inside a shared space. Capturing from a bound place through a space connection is owned by the space.

**Learning a source's history.** When someone connects a mailbox or another source, they choose how far back Homing learns from it, and whether it keeps learning from what arrives. The first pass uses the same connection and place as ongoing learning, never a separate import. It works through the material in the order it happened, following threads and later corrections, to reconstruct how facts, decisions, projects and relationships changed and establish what holds now. Then it carries on as ongoing learning from where it stopped, so nothing is processed twice. Age alone doesn't decide what matters: current and unfinished work gets closer attention, but an old contract can still apply. Old tasks and events are history, and aren't recreated as current unless evidence says they still are. An old request never triggers an external action. Where spaces or collections would help, it suggests them rather than creating many. The person sees how far along the pass is and can pause it, it resumes where it stopped, and its scope can change without starting over. What it learns is private by default, and nothing is published or acted on outside Homing without authorization (§5).

**Private work is automatic; publishing isn't.** A person routine updates its owner's private knowledge, notes and tasks across all their spaces without asking. Like upkeep, it changes only what routines derived, never deliberate work: what the person wrote changes only by them, or by their assistant in a conversation, when they ask (§3). Weekly planning across clients is an ordinary person routine, and its results stay private. A routine publishes automatically only when both the action and every input are authorized for the destination. Being scoped to a space isn't enough: a private email about Acme doesn't become shareable because the routine runs in Acme.

**Containment.** A routine that reads untrusted input runs where all its tools come from Homing. A run that holds outside tools falls outside containment, and its output counts as agent-reported.

**Housekeeping isn't a routine.** Indexing, deletion cascades and cache expiry are deterministic code. They use no connections, never publish and run under the same access rules; only narrowly defined housekeeping gets elevated database access ([architecture](architecture.md)). Anything that uses a connection or interprets content with a model, including upkeep, is a routine with an owner. Embeddings follow the space's model setting.

**Routing.**

- Sources from bound places go to their space.
- Other sources land on your private side of the space their place was added in, or your personal space when no other was chosen. What they teach about any space you can open goes on your private side there, citing them, so a work mailbox set up in your company's space also informs your private side of each client's space.
- One source can inform many spaces without being copied, and none of them is primary.
- Routing shares only what a binding authorizes, and sharing a parent space never lets anyone discover your private sources, their titles, excerpts or counts, or what they taught you.
- Routing rules are guidance.
- Unclear knowledge stays private, waiting quietly until it can be placed confidently. An unclear action makes the agent ask.

## 9. Context

One `context` call gives an agent what it needs to start: the rules that apply, a map of the space, and what is relevant to the task.

| Layer | Contents |
|---|---|
| Core: stable for a person in a space until something changes | Identity and role, the rules that apply, the space overview, and a skill index |
| Relevant: adapts to the request | Relevant pages, decisions, records, recent changes, applicable skills, pending proposals and other important items |

Full details are available on demand.

- **Resolve, then assemble.** `context` takes a free-text request and, optionally, a space. Without a space, Homing works out the people, messages, records and topics involved, using the same matching as routing. If several spaces fit, or one fits only loosely, it returns the candidates with the best matches and the skills that fit, which often answer the request or say which space it is about. If nothing the person can see matches, it says so.
- **Local assembly never waits on external systems.** Guidance, overviews and indexed knowledge are assembled locally. Live lookups, such as external records or sources not yet indexed, go through `search` and `read`, or run under a strict time limit. The two are measured separately. Context names the person's connected places, such as their mailboxes, for them alone, so their assistant knows what `search` and `read` reach.
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

- `remember` needs no approval, but it still has permissions. It can't change guidance, write to anyone else's private side, or overwrite text people wrote, except the person's own private text when they ask (§3). Where an agent reads a page, each item shows as written and says who wrote it, so it knows what a person wrote before it tries. An item's earlier versions read exactly as written too, so an assistant undoes a change by updating the item with one.
- `remember` puts knowledge on the page for its subject: an existing page when there is one, a new one when the subject deserves it, and otherwise the space's notes. What an assistant saves there in a conversation is deliberate work, which upkeep leaves as it is (§3). Sources can be kept on their own as evidence. An agent's own words are never treated as a source.
- `remember` can change part of an item, such as one section of a long document, without sending the rest. It names each exact passage to replace and what it becomes, and the edits are made in order, all or none, only where updating or replacing the whole item is allowed. A passage that isn't there, or is there more than once, is refused, saying which, so the agent reads the item again or includes the text around it.
- `act` returns one of three outcomes: done, waiting for approval (with a form or a link), or blocked. Approval is never a tool.
- What a person does only in Homing, such as downloading a space's export, `act` answers with the link to it.
- Connecting a system can start in conversation, such as "connect my work mailbox to Acme and learn from the last year". The assistant prepares it, and the person finishes it: signing in on the system's own page, and deciding any sharing in Homing (§6). An assistant never approves more access for itself.
- Every write can, and should, cite its sources.
- Every write names its destination: a space, or something already in one, such as an item, a page, a rule or a task, whose reference decides where the write goes. A space given as well must be that space or one whose context shows it, such as a space above it, or nothing changes. A space can also be named by its name when only one space the person can open has it, and where something is read or saved there, by a page in it. None of it reveals anything the person can't see.
- `search` also finds tasks, and the person's own proposals that are still waiting, with the space each is in.
- `search` also looks, live, in the places the person connected whose kind is searched live, such as their mailboxes, where it searches: in the space, a space above it or one below it, or anywhere without a space. Each email it finds shows its sender, date, subject and reference. A place gets a strict time limit, so a slow one never holds up the answer, which says so in one line, as it does for one that needs its owner to sign in again. `read` opens what's in any of the person's places by its reference, as the place shows it now, such as an email's text, sender, recipients, date, thread, and attachments by name. Only the place's owner gets anything from it, through their own connection: anyone else, and their assistant, learns nothing, not even that it's there.
- What comes from a place, such as an email, is set apart from Homing's own words, as quoted content from the person's place, never instructions, and nothing in it can pass for Homing's framing.
- When `remember` cites something in a place by its reference, Homing reads it itself and keeps the source: its reference, what its kind keeps, and who could see it there, where Homing knows (§7). For an email, that's its sender, date, subject and the words it rests on, with what's around them, or else its opening, from what its sender wrote. Words the email only quotes from an earlier one are kept marked as quoted, since Homing read this email and not the earlier one. The source is kept on the person's private side of the space where the place is, and isn't agent-reported, because Homing read it (§7). Like any source, it reaches others only through publishing, which shares the knowledge and never the email.
- When an agent proposes sharing something, Homing tells it who will see it: everyone who can open its space, which takes in the spaces above it, up to the first closed one. So the agent shares it where it is, rather than copying it to reach more people.
- A new system adds actions to `act`, never new tools. `act` validates arguments, authorization and approvals.
- Whether an action publishes depends on its effect, not its name. A draft in a shared mailbox counts as publishing.
- The account used for an outgoing action is the one you chose, or the only one that fits, and otherwise Homing asks. It never comes from the space, and Homing never moves to another account on its own.

**Clients.**

- There are three levels of integration: MCP only, which works whenever the client calls the tools; MCP plus one recommended instruction, which says when Homing helps, so the assistant uses it for the person's work and leaves it out of the rest; and native integration, where context loads reliably and sessions are captured through hooks. The recommended instruction is part of Homing's MCP instructions, so clients that show those follow it without setup.
- With native integration, Homing learns from conversations automatically unless you say "don't keep this". Otherwise it learns through `remember`. It keeps knowledge rather than transcripts (below), and background learning never depends on the chat client.
- Space detection is a suggestion that asks when unsure. Git remotes are hints. There is no hidden "current space".
- Homing requires no repository structure, local workspace or separate chat app. Prompts and MCP Apps are enhancements.
- Every assistant connects over OAuth and acts as the person who signed in and allowed it. A person sees their connected assistants and can disconnect any of them, which takes effect at once. Claude.ai and ChatGPT need a public HTTPS address, so an install reachable only locally needs a tunnel to serve them.

**Sessions.** Work often spans many conversations with different assistants. Homing can keep the useful context of a session: what was worked on, what changed, decisions and their reasons, open questions, and links to the pages and documents involved, so the next session, with any assistant, picks up from there. There is no mandatory chat history, and Homing keeps only what it receives. A full transcript is kept only when the client makes it available and the person allows it.

## 11. Models, distribution and other instances

Homing works without an AI model, and learns in the background when it has one. It is open source, self-hosted first, and can work with other Homing instances.

**Rules are code; models interpret.** Permissions, inheritance, publishing, storage, search, identity matching and applying upkeep are plain code. Extracting knowledge, proposing upkeep, ambiguous routing and part of contradiction detection use a model.

**The model is optional.**

- The core works without one. Guidance and context are deterministic, knowledge is read and written through MCP, search needs no embeddings, and people and external agents keep knowledge up to date. Without a model, Homing learns only through agents.
- Whoever runs Homing brings a provider's API key, in its settings. Homing isn't tied to one provider, and has sensible defaults: a capable model for understanding and upkeep, and a cheaper one for simple sorting.
- What a model writes is untrusted input, never instructions, and no model ever sees credentials (guarantees 3 and 5).
- "No model processing" governs only Homing's own inference, not what external assistants do. Self-hosting doesn't keep data local if the model is an external API. Homing states both limits plainly.

**No model processing.** A space's admins can turn model processing off. Nothing in the space, or in the spaces in it, is then ever sent to a model, through any other space, routine or source that also concerns it, and what lands there is kept without model processing.

- An admin's assistant can turn it off when they ask, since that sends nothing. Only an admin turns it back on, in Homing itself.
- A space that's off through a space above it can be kept off on its own too, so it stays off when that one is turned on.
- It stays off when the space is shared out of a personal space it was off in, and an export carries it, so the imported space keeps it off.
- Homing calls a model in one place, which refuses any call carrying content from such a space, so no caller can forget the setting. Each call names every space its content concerns: where it lands, the spaces it was matched to, those of the knowledge and rules it brings along, and any space it asks about. Calls already under way when it's turned off finish.
- Identifier matching runs before any model, so a source that matches a space with no model processing is never sent to one. A source from an unknown sender is processed under the setting of the space where it lands (§8).
- A space's settings say whether model processing is on, and which provider processes what, in plain words: "Homing sends what it learns from in Acme to OpenRouter (Claude Sonnet 5.5) to understand it."

**Costs are understandable and capped.**

- Every call is recorded: the model, what it was for, its tokens and cost, and the person and spaces it was for, never what was sent or answered. The cost is what the provider says it charged, or else what its price list says. A model whose price Homing doesn't know is never called.
- Before a call, Homing reserves its worst case against the limit that applies, counting the calls still under way, and settles what it actually cost afterwards. A call whose cost can't be known, or whose provider reports counts that can't be right, counts at its worst case.
- There is a monthly limit for ongoing learning, set by whoever looks after Homing, and a limit for each learning run. When what was spent leaves no room for the next call, learning pauses and says why, until the limit is set again, which resumes it without starting over. When only calls still under way leave no room, the next call waits for them instead.
- Homing keeps to a limit as reliably as it can, without promising precision it can't keep. A provider's own spending cap, if set, is a second guard. Benchmark spending is kept apart.
- Each person sees what learning cost for them this month and on what. Whoever looks after Homing sees the totals and the limit, person by person, never what the calls were about.

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

0. **Small items vs. a plain wiki.** Feed the same sources over simulated weeks, and a piece of work over many sessions, into a plain agent-maintained wiki and into pages of small, sourced items kept by the upkeep operations. Compare correctness, staleness, drift, traceability and cost, and whether reasons, open questions and the work as a whole survive. Add structure only where it wins.
1. **MCP reliability.** How consistently Claude and ChatGPT call Homing on realistic prompts, and leave it out where it can't help, with MCP only and with one recommended instruction.
2. **Tool design.** Whether agents build `act` payloads correctly compared with dedicated tools, and whether they choose correctly between `remember` and `act`.
3. **Context size.** Core only, core plus relevant summaries, and core plus full pages, compared on quality, number of calls, latency and tokens.
4. **Retrieval.** Links plus full-text search, with and without semantic search, with row-level security on.
5. **Planning latency.** Weekly planning across 5 to 10 external systems. At 15 to 30 seconds, add caching or indexing.
6. **Prompt-cache reuse** across clients.

The results of 0 to 4 are in [bench/results.md](../bench/results.md).

## Workflows checked against the design

Morning email triage, shared project knowledge and cross-client weekly planning all fit the design without new concepts, and each has been walked through the data model. None has run end to end yet.

Connections are to be checked against eight cases, in tests and then in the app:

1. A personal Gmail connected in your personal space teaches only you.
2. Your work mailbox, connected only for you in your company's shared space: no colleague can discover the connection, its sources or what it taught.
3. What it teaches about a client goes on your private side of that client's space, unshared.
4. A client's resource authorized for shared learning publishes within that authorization, never beyond it.
5. A space routine can't reach your mailbox, even one you set up from that space.
6. Revoking an account stops everything that relies on it, and what was already learned keeps its visibility.
7. Two years of history, then ongoing learning: nothing is processed twice, and no obsolete task comes back.
8. Someone using both their assistant's Outlook connector and Homing's own: Homing keeps the two apart, and never takes what the assistant reported for what it read itself.

## Open questions

- **Context.** Should the guidance that applies be precompiled per person and space, and how is it invalidated? What is the default context budget?
- **Knowledge.** How is it tracked that a source is still available and still permitted? How should active knowledge work: finding gaps, then investigating them on your private side?
- **Sharing.** Audience reporting for systems beyond email, chat and meetings, such as Asana and Drive, which count as unknown until then. If a private source is deleted, does knowledge published from it stay, flagged "source removed"? Leaning towards yes, because a person vouched for it.
- **Interface.** How should client integrations work, starting with a Claude Code plugin? How is a session's context captured: through client integrations, learning, or both?
- **Connections.** After Microsoft 365, how does OAuth to other systems work across tenants, and which connectors come next: APIs, MCP clients, local bridges such as iMessage on a Mac, webhooks?
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
