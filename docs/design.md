# Design

How Homing's screens look and behave. People work with Homing through their assistant, and use the app to explore, understand, correct and manage what Homing knows. Every screen follows this page.

## Principles

- Every element says something. If it doesn't, it goes.
- One job per page, with one obvious main action.
- Never more than needed, always enough to finish.
- The essentials come first, and details are there on request, but an important consequence is never hidden.
- A decision shows the exact change word for word, set apart from the rest, with who wants it and where it applies.
- Anything that shares or removes says what will happen before you confirm.
- Who sees something is never a guess. Every page says who sees it, and what's only yours carries a label.
- It works with nothing in it and with years of knowledge. An empty screen says how to start, and a long list pages, sorts and filters, offering only filters that match something.
- It works on a phone, with a keyboard and with a screen reader, to WCAG 2.2 AA.
- Quietly polished. The interface does the work, and illustrations give it character.

## Voice

Words on screens follow the repository's writing rules in [AGENTS.md](../AGENTS.md). They are also confident and considerate: not cute, and not technical unless they have to be.

- Explain what people can do, what will happen, and what matters to their decision. Leave out the machinery behind it.
- Everyday words: "Connect Claude to Homing?", never OAuth, scope or client.
- Say whether something is proposed, waiting for approval, or done.
- Answer the worry someone actually has, as "Being invited gives them no access to your spaces" does.

## Tagline

> **A home for everything worth knowing.**
> Homing brings together what you and your AI assistants learn, keeps it useful as life and work evolve, and lets you share it with the people who matter.

The headline never mentions AI, so the sentence under it goes with it wherever someone meets Homing for the first time.

## Logo

<img src="design/logo.svg" alt="The folded paper bird" width="96">

The mark is the folded paper bird: flat facets in two sages, with a peach beak. It's the pencil bird simplified so it holds up at 16 px and in a browser tab. The vector is [`docs/design/logo.svg`](design/logo.svg).

- Next to the name it sits at 1.4 times the text height, with "Homing" in Figtree semibold. That pair signs every page.
- The mark alone is for places where the name is already clear, such as the browser tab.
- On dark surfaces its facets lighten, through the `mark-light` and `mark-dark` tokens. Otherwise it is never recolored, stretched, outlined or rotated.
- The pencil bird is the mascot for drawings, and the mark is the signature. One doesn't replace the other.

## Look

Paper to read on, a linen shelf for your spaces, sage for what you can act on, and peach only for what's yours alone. Light only for now; dark mode comes later through the same tokens.

| Token | Value | Used for |
|---|---|---|
| `background` | `#F5F5F2` | The page, paper |
| `card` | `#FFFFFF` | What you read or act on, a step up from the page; fields and outline buttons |
| `muted` | `#EFEBE4` | A step down from the page, for quieter groups |
| `shelf` | `#EDE7DD` | The sidebar, linen |
| `foreground` | `#1F1C18` | Text |
| `muted-foreground` | `#5C554C` | Secondary text |
| `border` | `#E4DDD2` | Edges, only where a step in tone can't do it, such as the approval card on an assistant's own background |
| `input` | `#9B9083` | Field and checkbox edges, 3:1 against the card |
| `primary` | `#3E6B4D` | Sage, the main action, with white text |
| `primary-ink` | `#29513A` | Sage text on a sage tint |
| `accent` | `#E3EDE4` | A sage tint for what's selected or under the pointer |
| `private` | `#F8DFD1` on `#873C1F` | "Only you" |
| `change` | `#E3EDE4` | The exact change being decided |
| `wash` | `#E9A98F` | Peach, for small accents |

Surfaces differ by a step in tone, never by lines or shadows. Only what floats over the page, such as a menu or a dialog, casts a shadow. There are no labels above headings, and facts are said in a sentence, "Updated by Cara Lund on 14 October", never strung together with dots.

Figtree is the only typeface, and it ships with the app. A screen in the app has a 34 px title. A decision, and each page outside the app, has one heading at 24 px, because it is a sentence saying who wants what. Section headings and the exact change are 18 px, running text 16 px, secondary text 14 px, and small labels such as "Only you" 12 px. That is the whole scale. Hierarchy comes from it, two weights and the muted color, never from another size, capitals or letter-spacing. Running text is in full ink, and the muted color is for what's secondary. Corners start at 14 px, and buttons and fields are pills.

## Components

[shadcn/ui](https://ui.shadcn.com) in its Maia style, on [Base UI](https://base-ui.com), lives in `web/src/components/ui` and takes its colors from the tokens in `web/src/styles.css`. Add one with `npx shadcn@latest add <name>` from the repository root. Homing's own components sit next to it: the wordmark, the proposed change, "Only you", where a rule applies, and the rules that already apply.

- One primary button per view, for the main action. Everything else is an outline button. A list where each row is a decision of its own, such as what's waiting on Home, gives each row its own primary Review.
- Main buttons on pages are 44 px tall and fill the width on a phone, with the main action on top.
- "Only you" is always a label. Color supports it but never carries it alone.
- Writing says who will see it before you save: "Only you", or "Everyone in Northwind", with how many people that is now and that anyone who joins later sees it too. New writing starts as only yours, and the button names who will see it, such as "Share with Northwind".
- A long list shows fifty at a time and says where you are: "Showing 1–50 of 1,240 pages".
- A settled decision keeps showing the change, greyed, so it's clear what happened.
- The change being decided is always shown in full, never cut short, because approving runs exactly what was shown. A short rule is set large; a longer one at reading size, keeping its line breaks.

## Layout

### The app

- A sidebar on the linen shelf holds the mark and name, search, Home with how many changes wait for you, and your spaces as a tree with your personal space first, with New space under them. Your name sits at the bottom and opens your account, Looking after Homing if you do, and signing out. On a phone the sidebar folds into a menu.
- With more than twelve spaces, the sidebar also shows the ones you opened lately and finds one by name, and the tree opens only along where you are.
- Home leads with what needs you: at most three changes waiting, and the rest in a list grouped by space. Then what changed, each leading with the change itself, grouped by day, a few at a time with a way to all of them. Your own requests come last. The sidebar lists your spaces, so Home doesn't; on a phone it shows the ones you opened lately.
- Someone who has just joined sees a welcome on Home instead, with the welcome drawing. It helps them connect an assistant first, then write something or start a space.
- A space says under its name where it sits and who it's shared with: "In Acme. Shared with its 4 members, not with everyone in Acme." Its parts are Overview, Knowledge, Guidance, Tasks and Members, and Settings for its admins, starting with its name. For a space in your personal space, Settings also has Share with others: it asks where the space goes and who has access, says that everything in it stays yours until you share it, and lists the rules from your personal space that stop applying, to keep for yourself there, add for everyone, or let go. Then it opens the space's Members. A space you shared this way says in its Settings where it came from, to you only.
- On Members, admins add someone by email from "Add someone", saying first what they'll see. Each member's menu makes them an admin or a member, or removes them, and anyone can leave a space from their own. Each of these asks first, in place, saying what changes, including access someone keeps through a space above, and the list then says what was done. Someone with access through a space above is changed there.
- Starting a space asks its name and who it's for. Just for you, it goes in your personal space, where nobody else can ever be added. With others, it's a space of its own, or goes in a shared space you're an admin of, open to everyone there, with how many people that is, or only to the people you add. It says what that means before it's created, then opens the new space. Admins also start one from the space it goes in.
- The overview is a map: what someone wrote about the space, its collections and what's active, with what's waiting there, recent decisions, what's next and the spaces inside it alongside.
- Knowledge has three views: pages, collections and sources. Pages can be searched within the space, filtered by the types that exist and sorted, and archived ones show on request.
- A page leads with what's known and says under its title who sees it. Something shared from someone's own side says who shared it and when. Each item opens, when you ask, to its sources, earlier versions and who wrote it. When sources disagree, the reading view says so. When your private update replaces a shared item for you, it stands in that item's place and the page says what others still see. Your own items offer "Share with Acme" in their details, and a newer version of something shared offers it where it says what others still see; sharing opens in place with what the decision page shows, then the item joins the shared side. Long pages can be searched within. The collections a page is in, and the pages that mention it, sit beside it.
- Items are Markdown. Headings in them take the section size, and a picture shows as a link, because loading it would tell its site who reads the page.
- A collection is a page like any other, with the pages it gathers after its own knowledge.
- A source opens in a view of its own, because it's evidence, not a page: what Homing kept of it, the pages that use it, and the original, opened through your own access.
- Guidance keeps rules and skills apart. Rules show what's set in this space, what reaches it from elsewhere and where from, and what applies only to you, with how they combine on request. A skill opens like a page: what it does, its instructions and files, and what it replaces.
- Search is on every screen and finds what assistants find: pages, sources, rules, skills and spaces, narrowed after searching.
- Looking after Homing is only for whoever does, from the menu under their name: inviting people first, then whether email works, and who uses this Homing. It says that looking after Homing gives no access to anyone's spaces.
- Your account lists your connected assistants first, with the address for connecting another, then how you sign in. Disconnecting an assistant and removing a passkey ask first, in place, and the last way to sign in can't be removed.
- Decisions open inside the app, as one centered column with a single heading that says who wants what, where. A suggested space is decided the same way, with the fields of New space and the assistant's reason, and so is a space the person asked for that others would see, which says why it waits. Once decided, it says where the space is and who has it. Home and the space's overview list both with what's waiting. Sharing something asks "Share this with Acme?" and shows exactly what everyone there would see, on which page, how many people that is, and what it rests on that they can't see, such as one of your emails or another client, which stays yours: they see the text and that you shared it. Sharing again shows what everyone sees now above what it changes to, and a page only you have says its title is shared too. The buttons are "Share with Acme" and "Don't share"; once shared, it says so and links to the page, where the item says who shared it and when, and its owner still sees their own sources, marked "Only you". A change of members asks it as a question, such as "Add Cara Lund to Acme?", with the assistant's reason, who it's about, and what it shares or stops sharing with them. For an email nobody uses Homing with, or someone the person no longer shares a space with, it says why it can't be approved, and offers only to decline. When an assistant proposes a rule change, its link opens the decision, after signing in if needed. A new rule shows where it applies and the rules already there; a change shows the rule now above its new wording; a removal says where it stops applying. If the rule changes while the page is open, approving shows it again instead. A member's change to shared rules comes as a request: they send it from the same page, which then says whose decision it waits for, and an admin sees who asked and why.

### Outside the app

- The mark and name sit top left.
- Sign-in asks for the email first, then the passkey or password, and the email field offers saved passkeys directly. Every email gets the same next step, so the page never says whether an account exists. On a desktop the form is on the left and the illustration on the right, with the tagline; on a phone only the form shows, starting near the top.
- Joining has the same layout, with the welcome drawing. The setup link creates the first account, and an invite everyone else's: it says who sent it, starts with the address it was sent to, and offers a password instead of a passkey. A link that no longer works says what to do instead.
- "Can't sign in?" leads to a page that sends a sign-in link to a verified email, or, without email, says to ask whoever runs Homing. It reads the same whether or not the account exists.
- Connecting an assistant is a decision page: "Connect Claude to Homing?", the site it says it comes from, what it can read and save, that changing rules or sharing knowledge needs your approval, and Connect Claude or Cancel.
- Sign-in with Google or Microsoft uses the providers' own marks, as their guidelines ask.

## Illustrations

Every drawing says something about Homing, with the same few objects:

| Concept | Drawn as |
|---|---|
| An assistant | The paper bird, Homing's mascot. It carries what it learned to where it belongs |
| A space | A box on a shelf |
| Knowledge | Index cards |
| Only yours | A closed notebook |
| Rules | A note pinned to the wall |
| Kept current | An old date crossed out, with a new card beside it |

Drawings are scenes with people, in colored pencil, in sage, peach and warm grey, light and airy. They appear only on welcome, onboarding, success and empty pages, never on approvals or routine screens. They're drawn on pure white and shipped with a transparent background, so they sit on any surface without a box. No robots, brains, bees, hexagons or screens.

The bird always looks like its character sheet, [`docs/design/paper-bird.jpg`](design/paper-bird.jpg): sage wings, a peach beak and belly, a small dark eye, the same folds. Every drawing with the bird is generated with the sheet as a reference, in this style:

> Soft colored-pencil drawing with gentle visible pencil texture, rounded friendly shapes, a muted pastel palette of sage green, soft peach and warm gray, light and airy. Plenty of empty space, nothing cropped. Pure flat white background. No text, no logos, no screens.

On the sign-in page the bird flies in over the top right of the sign-in card, carrying a written note: knowledge brought to the person signing in.

## The approval card

Inside an assistant the approval card takes the host's colors, font and corners, and keeps sage for the main action. In a dark host the sage turns lighter and more saturated, so the main action never looks disabled. It shows the same parts as the decision page, sized for a chat, and is built as one self-contained HTML file.

- A change that needs no approval, such as a space only the person will have, which they asked their assistant for, shows what was done, with the space's name set apart, and opens it in Homing. A refused change says nothing changed.
- A space the assistant suggests on its own, or one the person asked for that others would see, shows the same fields as New space, already filled in, with the assistant's reason for a suggestion. The person can rename it, move it or change who has it before choosing Create space or Don't create, and a suggestion says first that the assistant won't suggest that name again if they don't. Once decided, it says what happened.
- The assistant can draw the card again later, so it always shows how things stand now, and a decided change stays greyed with its outcome.
- Only assistants checked to keep the model from pressing its buttons show it, Claude first. The others give the person a link to the decision page.

## The landing page

homing.place introduces Homing to someone meeting it for the first time. It is a site of its own, never part of Homing, so a self-hosted Homing doesn't carry it.

It reads like a picture book, one chapter per idea.

- The cover and the ending are centered: the drawing, the title or closing line, and the way in. Everything between them sits in one column with one left edge for headings, text and product fragments. Nothing in a chapter is wider or narrower than that column.
- Each chapter has one picture, never two: a drawing centered above the column, or a product fragment below the text. They alternate down the page. All drawings share one maximum height, and none is cropped.
- Chapters alternate between the paper page and the muted band.
- Every drawing shows the one idea of its chapter: knowledge scattered and explained again, and one card shared while the notebook stays. The product fragments show spaces and who reaches them, and a rule waiting for a person to approve it. The bird opens the page flying home to its loft with a card, as a homing pigeon would, and ends it asleep in its box.
- Because it introduces rather than asks for a decision, its type is larger: the title, chapter headings, one larger line at 22 px, body text at 18 px and small notes at 15 px. Product fragments keep the app's own scale.

## Working on screens

`npm run dev:web` serves every screen with sample data, and its start page lists them, each state at its own address. The real pages come from Homing itself: run `npm run build:web`, then start the server. The landing page is `/landing` there, and `npm run build:site` builds homing.place as static files.

The app was first designed as a clickable prototype with sample data. It's a starting point, not a specification. Each change to a screen follows this page, says in its pull request where it differs from the prototype and why, and is looked at with an empty Homing and one with years of knowledge, on a desktop and a phone.
