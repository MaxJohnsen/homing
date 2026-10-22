# Benchmarks

Benchmarks 0 to 4 from the [spec](../docs/spec.md#benchmarks): how knowledge should be kept as it grows, whether models call Homing when they should, whether they build `act`'s payloads as well as they use dedicated tools, how much `context` should give, and how well search finds things. Benchmark 1 also has harder conversations, which ask whether models use Homing when it helps and leave it alone otherwise. In 1 to 3, real models talk to a local Homing through its real MCP tools, and the harness checks what happened. Benchmark 4, [below](#benchmark-4-retrieval), asks Homing's search directly, and benchmark 0, [further down](#benchmark-0-small-items-or-a-wiki), compares ways of keeping knowledge. The results are in [results.md](results.md).

The models cost money, so CI never runs this.

## Running them

You need what the tests need, the database from `docker compose up -d db`, and an OpenRouter key on one line in `~/.config/homing/.openrouter`.

```
npm run bench -- show                   # what the models see, without calling any
npm run bench -- smoke --max-spend 0.5  # one conversation per benchmark, to check the harness
npm run bench -- pilot --max-spend 3    # a few per benchmark, variant and model
npm run bench -- run --max-spend 45     # everything, three runs, continuing where it stopped
npm run bench -- report                 # the tables in results.md, from results/full.jsonl
npm run bench -- run --phase rerun --only b1,b2 --max-spend 6   # a run of its own, after a change
npm run bench -- report rerun           # its tables
npm run bench -- compare full rerun     # the first run's failures beside the rerun's
```

`--models` takes other models from [OpenRouter's list](https://openrouter.ai/api/v1/models), `--only b1,b3` some of the benchmarks, `--runs` the number of runs, `--variants` some of the variants, `--tasks` some of the tasks, `--concurrency` how many conversations run at once and `--phase` the name of a run whose results are kept apart, in `results/<phase>.jsonl`. Benchmark 1's harder conversations are `--only b1-hard`. Every run drops and remakes the database `homing_bench`, or the one `HOMING_BENCH_DB` names, which must start with `homing_bench`. Run the tests with a database of their own, such as `HOMING_TEST_DB=homing_test_bench`, since they drop theirs too.

Each conversation is one line in `results/<phase>.jsonl`: the tools called with their arguments, Homing's answers (shortened), the model's answer, tokens, time and cost. A run skips what already has a result there, so a stopped run continues without paying for anything twice.

### Spending

Every model call passes the guard in `budget.ts` first. It reserves an estimate of the call's worst case: its input, counted high at about two characters a token, at the dearest input price that could apply, cache writes included, and all of `max_tokens` at the output price. The input count is an estimate, not a guarantee; the key's own usage, below, is the check behind it. What's spent is the ledger's total or the key's usage since the first run, whichever is more. If that, plus every call under way, plus this call's worst case would pass USD 60, or the run's `--max-spend`, the call isn't made and the run stops.

The ledger is `~/.config/homing/bench-spend.json`, next to the key and outside every checkout, so a new checkout or a rerun adds to the same total. What each call cost, as OpenRouter reports it, goes into it at once. A call whose cost isn't known counts at its worst case: one that failed on the way, a crash interrupted, or that came back without a usable answer or a cost. Only a request OpenRouter refused itself, with a 4xx answer and no cost, counts as free. A run holds a lock on the ledger from before it remakes the database to its end, so a second run is refused instead of spending at the same time or dropping the first one's database.

The key's own usage is read at the start and end of every run and every 50 calls. The run stops if it has grown by more than USD 60 since the first run, or if it can't be read. A model whose prices are missing or negative on OpenRouter's list, such as its routers, isn't called at all, and neither is anything when `--max-spend` isn't a number of zero or more.

The key is read from its file when a call is made and only ever sent in the Authorization header. Errors and results pass through a filter that removes it, and anything shaped like a key. The guard's tests, in `budget.test.ts`, run with the other tests: they use made-up prices, made-up keys and a stand-in for OpenRouter, so they spend nothing and never read the real key.

## How they work

**A world per conversation.** Each conversation starts from a new world, made through Homing's own operations (`homing.ts`), so nothing one conversation saves shows up in another. Ana Berg works at Acme, a consultancy, with her colleague Cara Lund. Acme's client Northwind is relaunching its website, in a space below Northwind, and Fjord Bank is a closed client space only Ana has. Her personal space holds a kitchen renovation and her running. There are shared and private rules, a status report skill, about 30 pages written by both of them, things Ana's assistant saved for her alone, two private tasks and a shared one, and a rule her assistant proposed that she hasn't decided yet. Her assistant connects over OAuth the way Claude or ChatGPT does, and acts as her over MCP.

**The conversation** (`agent.ts`). The model gets Homing's tools from `tools/list` as functions. The harness forwards each call to Homing and returns its answer, for up to 10 model calls. The system prompt is a plain assistant's, "You are a helpful assistant. Today is Tuesday, 20 October 2026.", plus Homing's MCP instructions in the variants that have them. When a change was asked for and the model stops without making one, usually to ask permission, the user replies once with "Yes, please go ahead." The results say how often that was needed. In benchmark 1's harder conversations the user can say up to three things, one after another, scripted in advance, and each gets up to 10 model calls and its own "go ahead".

**Variants** (`variants.ts`) change only how Homing is presented, never Homing:

| Benchmark | Variants |
|---|---|
| 1. MCP reliability | `mcp-only`: the tools and their descriptions. `instruction`: the same, with Homing's MCP instructions, which hold its one recommended instruction, in the system prompt. |
| 1, harder conversations | `mcp-only`, `old-instruction` and `instruction`: the tools alone, with Homing's MCP instructions as they were before 21 October, and as they are now. All three with four other tools beside Homing's. |
| 2. Tool design | `act`: Homing's five tools. `dedicated`: each of `act`'s actions is a function of its own (11 on 20 October, 13 on 21 October), with `act`'s description of it and that action's own input, and the harness turns each call back into `act`. Homing's words that point to `act` point to the matching function instead. Both with the instructions. |
| 3. Context size | `core`: `context` without what's relevant to the request. `relevant`: `context` as Homing gives it, the core plus up to 10 matching items, one line each. `full`: that, plus the pages those items are on, in full, up to five. All with the instructions. |

**Checks** (`benchmarks.ts`) are deterministic, and no model judges another. A question counts as answered when the model asked Homing and its answer has the expected facts, matched by patterns such as "1 March" written any of the usual ways. A change counts as done when Homing's database shows it afterwards: the item saved in the right space, the task due on Friday, the proposal with the right rule, item or person. Benchmark 2 also records whether the first write was the expected tool and action, and whether Homing accepted it the first time. Benchmark 1 has two control questions Homing has nothing to do with, to see whether the instruction makes a model call it anyway.

**Harder conversations** (`harder.ts`) ask whether a model uses Homing when it makes the answer or the action better, and leaves it alone otherwise. Every conversation also offers four other tools, as a chat app would (`others.ts`): a web search, a calendar, an email inbox and a notes app, which answer from canned data about Ana's week. There are 41 conversations of five kinds: requests that may or may not be about Ana's work, questions Homing has nothing to do with, conversations of three turns, requests that belong to another tool, to Homing or to both, and two people's assistants working together. Each thing the user says is labeled: Homing helps, it doesn't, or either is fine, such as a follow-up the conversation may already answer.

They are scored by what the user said, a turn at a time. Homing counts as used in a turn when any of its tools was called. "Used when it helps" is the share of the turns where it helps in which it was used, "left alone otherwise" the share of the turns where it doesn't in which it wasn't, and "precision" the share of the turns where it was used in which it helps. Whether the task was done is scored on its own, as in benchmark 1: the facts in each turn's answer, what Homing's database shows afterwards, and whether a turn that belongs to another tool used it. A conversation that calls Homing when it needn't can still do its task; it costs time and tokens instead.

**Two people together** (`together.ts`). Ana's and Cara's assistants connect over OAuth, each as its own person, and talk with them in four conversations of their own. Ana's assistant saves what Mona in legal decided about the cookie banner and proposes sharing it, which Ana approves, and keeps Ana's worry about it private. Cara's assistant finds what was shared, keeps a private note of Cara's on the same subject, and asks for a rule for everyone on the relaunch. Cara is a member, so that is a request: she sends it and Ana, the admin, approves it. Then each assistant is asked about the banner again. The harness approves as each person through the app's decision API, with what the decision page shows them, as their click would. It also reads the page about Mona as each assistant, where each of them has a private note: each must see the shared items and their own note, never the other's. Leaks are checked word for word, in every tool result and every answer of one person's assistant, against every text private to the other: items, page titles, tasks, sources, spaces only they have, and proposals nobody else was sent, as well as the words only one of them uses, such as the Lindqvist agency in Ana's worry. There must be none.

**Models.** Claude Sonnet 5.5 and GPT-6.1 Sol: the newest of Anthropic's Sonnet and of OpenAI's Sol models on OpenRouter's list on 20 October 2026, each in the middle of its maker's range there (between Haiku and Opus, and between Luna and Astra), at the same price, USD 2 per million input tokens and 10 per million output tokens. Each runs at its API's default reasoning, served by its own maker where OpenRouter can.

**Caching and strict mode.** The system prompt and the newest message are marked for Anthropic's prompt cache; OpenAI cached long prompts on its own, as the cached-token counts show. Functions are sent with `strict: false`. Sent through OpenRouter without a `strict` field, GPT-6.1 Sol called them as if they were strict: it filled every optional field, and always sent `context` a made-up `space`, such as `" "` or `"personal"`, which Homing refuses. With `strict: false` it left them out. That is what we saw, in 7 conversations and 10 single calls (see [results.md](results.md)); whether to send `strict` is each client's choice.

**Changed along the way.** Smoke runs of 30 conversations in all came before the pilot, and three things changed after them. Functions got `strict: false`, as above. A reminder saved in the personal space now counts as done: Claude Haiku 5.5 saved one there in the first smoke run, and a reminder works from there. And the task share-task was reworded. It first said "Share my task about the revised timeline with the rest of the team.", which doesn't say which team, and `search` can't find tasks: both GPT conversations asked which space and didn't share it, and Claude searched space after space, once only after the "go ahead". The first wording is kept as share-task-vague, which isn't in the results of 20 October and runs from the rerun of 21 October on. After the full run, the patterns for a few facts were made stricter for the next run; scoring the stored answers again with them changes 4 fact counts, where the old pattern took "follow up by email" for "Gunnar prefers email", and no result. For the rerun, archive-page also counts as done when archiving the page waits for Ana's approval: since #90, a page in a space others can open is archived once the user approves, even one only they see. How the harder conversations' checks changed after their smoke run, pilot and full run is in [results.md](results.md#changed-along-the-way).

## Prompts

### 1. MCP reliability

| Task | Kind | Prompt |
|---|---|---|
| golive | answer | When does the Northwind website relaunch go live? |
| budget | answer | What's the budget for the website relaunch? |
| who-gunnar | answer | Who is Gunnar Holm again? |
| why-azure | answer | Why did we go with Azure for Northwind's hosting? |
| fjord-renewal | answer | When does the Fjord Bank contract renew? |
| carpenter | answer | When is the carpenter starting on my kitchen? |
| my-tasks | answer | What tasks do I have for the website relaunch? |
| report-format | answer | How should I write my status reports for clients? |
| call-prep | answer | Help me prepare for my call with Gunnar tomorrow. |
| migration-owner | answer | Who owns the content migration on the relaunch? |
| moved | save | Gunnar just told me the relaunch moves to 15 March. Can you note that? |
| remind | save | Remind me to call Gunnar about the budget on Friday. |
| tick-off | save | I sent Gunnar the revised timeline this morning, so you can tick that off. |
| new-contact | save | FYI, Per Hansen is leaving Northwind at the end of November. Ola Nordmann takes over hosting and DNS. |
| invoices | save | Kari Lie at Fjord Bank told me today that they want monthly invoices from January. Keep that in mind. |
| quote | save | Erik the carpenter's quote went up to 92,000 NOK. |
| bullet-rule | governed | From now on, I want my Northwind status reports as bullet points. |
| share-hint | governed | Share Gunnar's hint about the budget with the rest of the team. |
| add-cara | governed | Add Cara to the Fjord Bank space. |
| spain | governed | Set up a space for planning my trip to Spain next spring. It's just for me. |
| percent | control | What's 15% of 2,400? |
| translate | control | How do I say 'see you next week' in Norwegian? |

### 1, harder conversations

"Homing helps" is the label of each thing the user says, in order: whether what Homing knows makes the answer or the action better. A request Homing can't improve is labeled no even when it touches Ana's life, such as the pace for her marathon goal, which the question already gives. report-structure is labeled yes because Acme has a skill for exactly this, though the question reads as general. "Other tool" is the tool the request belongs to, which must be used for it to count as done. The other tools know Ana's calendar for the week, four emails, among them Gunnar's about the budget and his answer about the timeline, three notes, and what a web search finds about the weather, WCAG and Azure's prices.

| Task | Kind | Homing helps | Other tool | What the user says |
|---|---|---|---|---|
| bank-signoff | ambiguous | yes |  | What was that thing with the bank again, about who signs off on bigger orders? |
| deadline | ambiguous | yes |  | When's the deadline again? |
| report-structure | ambiguous | yes |  | What's a good structure for a status report? |
| azure-or-aws | ambiguous | yes |  | Should we go with Azure or AWS? |
| cookie-who | ambiguous | yes |  | Who do I talk to about the cookie thing? |
| kitchen-guy | ambiguous | yes |  | Did the guy doing my kitchen say when he starts? |
| ttl | ambiguous | no |  | What does a DNS TTL do, and what should it be before a migration? |
| pace | ambiguous | no |  | What pace per kilometer do I need for a 3:45 marathon? |
| notice-period | ambiguous | no |  | What's a typical notice period in a consulting contract? |
| headless | ambiguous | no |  | What's the difference between a headless CMS and a traditional one? |
| percent | unrelated | no |  | What's 15% of 2,400? |
| translate | unrelated | no |  | How do I say 'see you next week' in Norwegian? |
| capital | unrelated | no |  | What's the capital of Australia? |
| berlin-wall | unrelated | no |  | What year did the Berlin Wall fall? |
| palindrome | unrelated | no |  | Write a Python function that checks whether a string is a palindrome. |
| git-undo | unrelated | no |  | How do I undo my last git commit but keep the changes? |
| friendlier | unrelated | no |  | Make this sound friendlier: 'Send me the report by Friday.' |
| fahrenheit | unrelated | no |  | What's 72 °F in Celsius? |
| sky | unrelated | no |  | Why is the sky blue? |
| synonyms | unrelated | no |  | Give me three synonyms for 'important'. |
| let-const | unrelated | no |  | In JavaScript, what's the difference between let and const? |
| mortgage | unrelated | no |  | Explain what a mortgage is in two sentences. |
| football | unrelated | no |  | How many players does a football team have on the pitch? |
| compound | unrelated | no |  | If I put 10,000 in at 5% a year, compounded yearly, what do I have after three years? |
| migration-follow-up | multi-turn | yes, either, yes |  | When does the Northwind relaunch go live? → And who's doing the content migration? → OK. Remind me to check in with her about it on Thursday. |
| change-of-mind | multi-turn | yes, yes, either |  | Remind me to call Gunnar about the budget on Friday. → Actually, make that Monday instead. → And does he prefer calls or email? |
| budget-math | multi-turn | no, yes, yes |  | What's 15% of 450,000? → Is that more or less than what Gunnar hinted the budget might grow by? → OK. Note that I want to ask him for the full amount he hinted at. |
| birthday | multi-turn | no, no, no |  | Help me write a short birthday message for my sister Ingrid. → Make it a bit funnier. → Perfect. Now translate it into Norwegian. |
| email-draft | multi-turn | yes, no, yes |  | Draft a short email to Gunnar saying the relaunch might slip by two weeks. → Make it a bit more formal. → Thanks, I've sent it. Keep a note that I told him today. |
| dns-handover | multi-turn | yes, no, yes |  | Who at Northwind owns hosting and DNS? → What does a DNS TTL do, by the way? → Got it. Per is leaving at the end of November, and Ola Nordmann takes over. Note that. |
| calendar-tomorrow | competing | no | `calendar_list_events` | What's on my calendar tomorrow? |
| gunnar-replied | competing | no | `email_search` | Did Gunnar reply to my email about the timeline? |
| rain | competing | no | `web_search` | Will it rain in Oslo tomorrow? |
| wcag-ratio | competing | no | `web_search` | Search the web for the contrast ratio WCAG 2.1 AA requires for normal text. |
| azure-price | competing | no | `web_search` | What does a basic Azure App Service plan cost per month? |
| oat-milk | competing | no | `notes_save` | Add oat milk to the shopping list in my notes. |
| meeting-prep | competing | yes | `calendar_list_events` | Help me prepare for my 13:00 meeting tomorrow. |
| budget-email | competing | yes | `email_search` | Gunnar emailed me about the budget. What did he say? Keep anything important for the project. |
| wcag-project | competing | yes |  | Does the relaunch have to meet WCAG, and when is the audit? |
| kari | competing | yes |  | Who is Kari Lie? |
| together | together | yes, every turn |  | Four conversations, below. |

The four conversations of together, in order, with what the harness does between them:

| Who | What they say |
|---|---|
| Ana | Mona Lie approved the cookie banner today, on one condition: the reject button must be as visible as the accept button. Save that for the relaunch and share it with the team. → One more, just for me, don't share it: I think her condition costs us a week, and the Lindqvist agency's estimate looks too optimistic. |
| | Ana approves sharing what Mona decided, and nothing that holds her worry. |
| Cara | What's the latest on the cookie banner for the relaunch? → Keep a private note for me, not for the team: I'll ask Lars whether the Osprey component can show both buttons equally. → Make it a rule for everyone on the relaunch: any change to the cookie banner needs Mona's approval before it goes live. |
| | Cara sends her request; it must reach Ana, who approves it; it must then apply to both. |
| Ana | I'm about to change the cookie banner text. Anything I should keep in mind? |
| Cara | Summarize what we know about the cookie banner so far. |

### 2. Tool design

| Task | Expected | Prompt |
|---|---|---|
| rule-private | `act` guidance.propose | From now on, always write my status reports for Northwind as bullet points. |
| rule-shared | `act` guidance.propose | Make it a rule for everyone in Acme: never send prices to a client by email. |
| rule-remove | `act` guidance.propose | Remove my rule about keeping answers short. I don't want it anymore. |
| rule-change | `act` guidance.propose | Change Acme's status report rule so the date goes last in the title instead of first. |
| publish | `act` knowledge.publish | Share Gunnar's hint about the budget with everyone on the Northwind team. |
| add-member | `act` members.change | Add Cara to the Fjord Bank space. |
| make-admin | `act` members.change | Make Cara an admin of Northwind. |
| create-space | `act` space.create | Create a space for our new client Polar Freight under Acme, for the whole team. |
| archive-space | `act` space.archive | The kitchen renovation is finished. Archive that space. |
| share-task | `act` task.share | Share my task about sending Gunnar the revised timeline with everyone in the website relaunch. |
| share-task-vague | `act` task.share | Share my task about the revised timeline with the rest of the team. From the rerun of 21 October on. |
| withdraw | `act` proposal.withdraw | Withdraw the rule I proposed about sending status reports on Fridays. |
| archive-page | `act` page.archive | Archive my old CMS notes page, that system is gone. |
| rename | `act` space.rename | Rename my Running space to Marathon 2027. |
| remind | `remember` | Remind me to follow up with Gunnar on Friday. |
| note | `remember` | Note that the relaunch budget went up to 500,000 NOK. |
| done | `remember` | Mark my task about the revised timeline as done. |
| tell-team | `remember`, then `act` knowledge.publish | Tell the whole Northwind team that the relaunch moved to 15 March. |

### 3. Context size

| Task | Prompt |
|---|---|
| relaunch-status | Give me the full status of the Northwind website relaunch: go-live date, budget, who owns what, and the open risks. |
| gunnar | What do I know about Gunnar Holm? |
| azure | Why did Northwind choose Azure for hosting, and what was the alternative? |
| steering | What came out of the steering group meeting on 14 October, and when is the next one? |
| fjord-terms | Summarize the terms of the Fjord Bank contract. |
| migration | How far along is the content migration, and what's slowing it down? |
| before-launch | What still has to happen before the relaunch can go live? |
| kitchen | When does Erik start on the kitchen, and what did he quote? |
| sign-off | Who has to sign off on a 250,000 NOK change order at Fjord Bank? |
| who-to-ask | Who at Northwind should I talk to about the cookie banner, and who about DNS? |

## Benchmark 4: retrieval

Whether `search` and `context` find what a person asks about, and nothing they mustn't see, compared with BM25, semantic search, a hybrid of the two, and a model that writes the search words. Every approach runs as the person, with row-level security on.

```
npm run bench:retrieval -- run                    # every approach that needs no model
npm run bench:retrieval -- pilot --max-spend 0.2  # embeddings and interpretation for a few queries, and the projected cost
npm run bench:retrieval -- run --max-spend 3      # everything, paying only for what isn't cached
npm run bench:retrieval -- run --approaches bm25  # some approaches again, keeping the others' results
npm run bench:retrieval -- report                 # the tables, from results/retrieval.jsonl
npm run bench:retrieval -- privacy                # whether others' private items change the ranking a person sees
npm run bench:retrieval -- latency --max-spend 0.05   # how long a query's embedding and an interpretation take
npm run bench:retrieval -- synthetic              # a database with one space of 176,000 items, for timing
npm run bench:retrieval -- scale homing_bench4_scale --repeat 1 --timeout 30000   # latency there, or in a big sample's database
```

It uses the database `HOMING_BENCH_DB` names, `homing_bench4` by default, and serves Homing on `HOMING_BENCH_PORT`, 4431 by default. Paid calls go through the same guard and ledger as the other benchmarks. Embeddings are cached in `results/retrieval-embeddings.cache.json`, which git ignores, and the search words each model wrote are kept in `results/retrieval-interpretations.json`, so a rerun pays for nothing twice.

**The world** (`retrieval-set.ts`) is a consultant's working life after a few months, made through Homing's own operations. Ana Berg runs Acme with her colleague Cara Lund. Acme's client Northwind has two projects, a website relaunch and a data platform, as spaces below it. Fjord Bank is a closed client space only Ana is in, written in Norwegian, and Polar Freight a closed one only Cara is in. Havbris is a finished client, archived. Ben Dahl at Beta added Ana to Beta's own space. Ana's personal space holds her taxes, insurance and doctor, with spaces for a kitchen renovation, her running and her apartment. About 50 pages hold the facts the questions ask about, with sources, tasks, rules and two skills. Some facts were replaced, such as the relaunch's go-live date and the carpenter's quote, and two pages are archived. Cara and Ben keep private items on pages Ana can see, and private pages of their own. Around them are about 480 pages and 300 sources of everyday notes in both languages, from templates with a fixed seed, which never answer a question: 537 pages, 1,805 items with their titles, and 312 sources in all.

**The queries** are 126, written with their labels before any approach ran: 17 in Norwegian, 16 in English, 12 asked in the other language than the answer, 20 with exact identifiers (invoice and ticket numbers, error codes, versions, room numbers, a policy number), 19 whose words don't match the notes (a deadline that is only a date, synonyms, paraphrase), 12 vague ones, 12 that should match nothing of Ana's, 12 about what only Cara or Ben sees or what's in Polar Freight, and 6 about the past. Each names the pages, items, sources, tasks or skills that answer it, and some accept any one of several. A line found counts for an expected page when it is on that page; an expected item counts only itself, or its page's title while it is current.

**The approaches** all answer the same queries, given as the user asked them:

| Approach | What it is |
|---|---|
| search | Homing's `search` tool, over MCP |
| context | Homing's `context` tool without a space, over MCP: its telling words, its choice of space, and the lines it shows as matching |
| telling | the ranking `context` uses, read deeper: `search` on the telling words, without what's archived or no longer true |
| tokens | `search` with the query split by PostgreSQL's parser, as the notes are, instead of by letters and digits |
| bm25 | BM25 instead of `ts_rank`, with document frequencies, the number of documents and their average length counted over only what the user can see, in SQL, without an extension |
| bm25-pruned | the same, but a word in more than half of the user's documents doesn't make a document a candidate, though it still counts in the score |
| bm25-telling, bm25-all-words | the same, ranking for `context`: on its telling words, and on every word, without the stopword and short-number rules |
| bm25-tokens | BM25 with the query split as in tokens |
| bm25-global | BM25 with the statistics over every row, whoever can see it, as a shared index would keep them |
| semantic | embeddings by `baai/bge-m3` or `openai/text-embedding-3-small`, compared in SQL with a dot product over arrays, since pgvector isn't installed here |
| hybrid | search or BM25 fused with semantic by Reciprocal Rank Fusion |
| interpreted | one call to Claude Haiku 5.5 or GPT-6 Luna per query, which writes the search words in both languages, then `search` or BM25 with them |

Everything but the MCP tools runs as Ana in her own transaction under row-level security, the way Homing's own queries run, and keeps `search`'s rules: pages found once, and items no longer true last. The prototype ranking with `ts_rank` returns exactly what `search` returns for all 126 queries, which the run checks.

**Scoring.** Recall at 5 and 10 and the mean reciprocal rank are over the lines each approach returns, in order. A question that should match nothing counts as right when the approach says nothing matches. A privacy failure is any line Ana can't see, or any word only others have written, such as "Lindqvist", in what the tools answered. Before trusting that, the run checks that row-level security hides from Ana exactly what the access rule, written out by hand for this world, says it should, and that the check catches Cara's items in Cara's own search. Since every approach runs under row-level security, this confirms row-level security here; the approaches' own privacy is measured by the statistics test below. Stale lines are superseded items and what's on archived pages or in archived spaces, counted in the first 10 for questions that aren't about the past. Latency is the median of three runs after a warm-up. `--results` writes to another results file, such as for a rerun that shouldn't replace the published one. For `context`, the run also records whether it picked the space the answer is in, or one above it, or listed it among others.

**Privacy of statistics** (`retrieval-privacy.ts`). After Ana's results are recorded, Cara writes 200 private items, each with three of the words Ana's queries use, in Polar Freight and on her own side of the relaunch. Ana's first ten results, with their scores, are compared before and after, for `ts_rank`, BM25 over what Ana sees, and BM25 over everyone.

**Scale** (`retrieval-scale.ts`). The big sample, and one synthetic space of 16,000 pages with 176,000 items of about 4 KB and 32,000 sources, a tenth of the items Cara's own. The synthetic words are drawn so a word's share falls with its rank, as in real text, from common English and Norwegian words, a consultant's words, names and 30,000 made-up words for the long tail. Twelve queries, six whole requests and six sets of keywords such as assistants write, are timed as Ana, with a limit per statement, after `ANALYZE`, since a freshly made sample is planned badly until it's analyzed. `search` is also timed without row-level security, with its own access filters, which return the same: that's what it would take if PostgreSQL could use the full-text index under the policies.

## Benchmark 0: small items or a wiki

Which keeps knowledge more useful as it grows from sources and from work over many sessions: Homing's small items with their sources and fixed upkeep operations, or a wiki the model rewrites freely? It measures facts, and also whether the reasons, the alternatives rejected, what's open and a long document survive.

```
HOMING_BENCH_DB=homing_bench0 npm run bench:upkeep -- pilot --max-spend 3   # two weeks and two sessions of each
HOMING_BENCH_DB=homing_bench0 npm run bench:upkeep -- run --runs 1 --max-spend 13
HOMING_BENCH_DB=homing_bench0 npm run bench:upkeep -- run --runs 2 --keepers sonnet --work-approaches wiki,homing --max-spend 10.6
HOMING_BENCH_DB=homing_bench0 npm run bench:upkeep -- run --runs 2 --keepers haiku --scenarios mail --max-spend 1.7
npm run bench:upkeep -- judge --phase full --max-spend 0.8                     # grades what code can't check
npm run bench:upkeep -- report                                                 # the tables, from results/upkeep-*-full.jsonl
npm run bench:upkeep -- verify                                                 # the rebuilt work against the work saved
```

`--runs` runs up to that run, skipping what's done; `--keepers`, `--scenarios`, `--approaches` and `--work-approaches` pick some of them. Every paid call goes through the same guard and ledger as the other benchmarks. Each week's store, and each arm's work after its last session, is kept in `results/upkeep-stores/`.

Two scenarios, written with their ground truth before any approach ran, in `upkeep-mail.ts` and `upkeep-work.ts`:

**Learning from email.** Eight weeks of Ana's mail, 157 messages in Norwegian and English, from 24 August to 18 October 2026: Northwind's website relaunch, Fjord Bank's renewal and portal pre-study, Havbris ending its agreement, her kitchen, a half marathon and her mother's birthday, with 63 newsletters, notifications and adverts. Facts change: the go-live moves, the DNS owner leaves, the invoicing is reversed, a colleague writes the wrong date and is corrected, a hinted budget increase isn't the one approved. The mail also carries reasons and open questions. It's learned from twice a week, 16 batches. At the end of each week, 11 to 39 questions with a known answer that week are asked.

**Work over many sessions.** Ana analyzes which commerce platform Northwind should choose for a spare parts shop, in five sessions a week apart. Each session starts fresh, and the model alternates: Claude Sonnet 5.5 in sessions 1, 3 and 5 of odd runs, GPT-6.1 Sol in 2 and 4, and the other way round in even runs. Nineteen findings arrive between sessions, among them a corrected price, a cut budget and an integration estimate that sinks an option. The user asks for a research brief, a comparison, a revisit of option B and a recommendation, and a presentation outline, then edits one slide and one section, and in session 5 asks where things stand. Some things are said only in the conversation: a remark not for the brief, a criterion dropped, and three things to do next time.

**The approaches.** The same model, the same mail or findings and, for the mail, the same instructions about what to keep.

| | Learning from email | Work over sessions |
|---|---|---|
| Wiki | Markdown pages the model writes whole or edits in part, with an index and a log, citing emails in footnotes, as in [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f). It sees every page and the new mail. | Ana's wiki of Markdown files: the world of benchmarks 1 to 3 as files, which the assistant lists, reads, searches, writes whole or edits in part, with each file's earlier versions kept, as git would. Its conventions come in the system prompt, as a schema file would give them. |
| Items with upkeep | Homing's pages of small items. The model proposes operations from the spec's fixed set, and code applies them: adding, replacing and correcting items, archiving a page and keeping sources through Homing's own functions, and merging, splitting and moving items, marking conflicts uncertain and pages as the same subject in bench code, as spec §3 describes them. It sees every current item and the new mail. | Homing as it is, over MCP, as the assistant Ana connected, Claude or ChatGPT, with Homing's instructions. |
| Items, added only | The same items, only ever added. It sees the pages' titles and the new mail. | The same Homing, but `remember` can't replace or update. |

Scenario 2 runs each approach with and without a session record: at the end of sessions 1 to 4, the user asks the assistant to save a short record of what was worked on, decided, open and next.

**Checks** are code wherever they can be. For the mail, a week's questions are answered in one call by Claude Sonnet 5.5, the same for every store, from everything the store holds: the wiki's pages, or each page's current items with the emails they cite and their dates, and what's no longer true. Facts are matched by patterns, such as "15 March" written any of the usual ways. An answer is right when it has the current fact, stale when it gives an earlier one instead, and wrong otherwise. Code also checks whether the store still has each current fact, whether the claim that holds it cites an email that supports it, and what share of claims cite any email: a wiki line, or an item. A fact lost is one that was right in a week and wrong in a later week while the answer stood still. For the work, code checks 27 facts in the work after each session, outdated values shown without a word marking them outdated, whether a session read the work before changing it, what it sent to be written and how many lines changed, whether it did what was said only in conversation, and the facts in session 5's answer.

**The judge**, Gemini 4 Argon, a third maker's model, grades only the answers about reasons and what's open, and session 5's answer, against rubrics written before any approach ran. An element counts when the answer says it; some say what a good answer must not say, such as an open question that was settled.

**Added after run 1**, and computed for every run alike from what the results keep. Every store's answers reached the ceiling, so `upkeep-stale.ts` reads each week's kept store: code finds current claims about a fact that changed which hold its old value and not its new one, and the judge decides whether each presents the old value as current. For the work, `upkeep-replay.ts` rebuilds it after each session from the calls the results keep, which matches every page and file saved (`npm run bench:upkeep -- verify`), so its checks can be computed again: whether an edit of one slide landed in the outline itself, whether a note on Composa landed with Composa's analysis, and outdated values in the work outside session records, each decided by the judge. After review, a later session also counts as having seen the work when a `search` or `context` answer before its first write showed one of its items, and the sample the authoring agent graded against the judge is in `results/upkeep-hand-check.json`.
