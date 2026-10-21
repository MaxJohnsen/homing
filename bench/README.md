# Benchmarks

Benchmarks 1 to 3 from the [spec](../docs/spec.md#benchmarks): whether models call Homing when they should, whether they build `act`'s payloads as well as they use dedicated tools, and how much `context` should give. Real models talk to a local Homing through its real MCP tools, and the harness checks what happened. The results are in [results.md](results.md).

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

`--models` takes other models from [OpenRouter's list](https://openrouter.ai/api/v1/models), `--only b1,b3` some of the benchmarks, `--runs` the number of runs, `--concurrency` how many conversations run at once and `--phase` the name of a run whose results are kept apart, in `results/<phase>.jsonl`. Every run drops and remakes the database `homing_bench`, or the one `HOMING_BENCH_DB` names, which must start with `homing_bench`. Run the tests with a database of their own, such as `HOMING_TEST_DB=homing_test_bench`, since they drop theirs too.

Each conversation is one line in `results/<phase>.jsonl`: the tools called with their arguments, Homing's answers (shortened), the model's answer, tokens, time and cost. A run skips what already has a result there, so a stopped run continues without paying for anything twice.

### Spending

Every model call passes the guard in `budget.ts` first. It reserves an estimate of the call's worst case: its input, counted high at about two characters a token, at the dearest input price that could apply, cache writes included, and all of `max_tokens` at the output price. The input count is an estimate, not a guarantee; the key's own usage, below, is the check behind it. What's spent is the ledger's total or the key's usage since the first run, whichever is more. If that, plus every call under way, plus this call's worst case would pass USD 50, or the run's `--max-spend`, the call isn't made and the run stops.

The ledger is `~/.config/homing/bench-spend.json`, next to the key and outside every checkout, so a new checkout or a rerun adds to the same total. What each call cost, as OpenRouter reports it, goes into it at once. A call whose cost isn't known counts at its worst case: one that failed on the way, a crash interrupted, or that came back without a usable answer or a cost. Only a request OpenRouter refused itself, with a 4xx answer and no cost, counts as free. A run holds a lock on the ledger from before it remakes the database to its end, so a second run is refused instead of spending at the same time or dropping the first one's database.

The key's own usage is read at the start and end of every run and every 50 calls. The run stops if it has grown by more than USD 50 since the first run, or if it can't be read. A model whose prices are missing or negative on OpenRouter's list, such as its routers, isn't called at all, and neither is anything when `--max-spend` isn't a number of zero or more.

The key is read from its file when a call is made and only ever sent in the Authorization header. Errors and results pass through a filter that removes it, and anything shaped like a key. The guard's tests, in `budget.test.ts`, run with the other tests: they use made-up prices, made-up keys and a stand-in for OpenRouter, so they spend nothing and never read the real key.

## How they work

**A world per conversation.** Each conversation starts from a new world, made through Homing's own operations (`homing.ts`), so nothing one conversation saves shows up in another. Ana Berg works at Acme, a consultancy, with her colleague Cara Lund. Acme's client Northwind is relaunching its website, in a space below Northwind, and Fjord Bank is a closed client space only Ana has. Her personal space holds a kitchen renovation and her running. There are shared and private rules, a status report skill, about 30 pages written by both of them, things Ana's assistant saved for her alone, two private tasks and a shared one, and a rule her assistant proposed that she hasn't decided yet. Her assistant connects over OAuth the way Claude or ChatGPT does, and acts as her over MCP.

**The conversation** (`agent.ts`). The model gets Homing's tools from `tools/list` as functions. The harness forwards each call to Homing and returns its answer, for up to 10 model calls. The system prompt is a plain assistant's, "You are a helpful assistant. Today is Tuesday, 20 October 2026.", plus Homing's MCP instructions in the variants that have them. When a change was asked for and the model stops without making one, usually to ask permission, the user replies once with "Yes, please go ahead." The results say how often that was needed.

**Variants** (`variants.ts`) change only how Homing is presented, never Homing:

| Benchmark | Variants |
|---|---|
| 1. MCP reliability | `mcp-only`: the tools and their descriptions. `instruction`: the same, with Homing's MCP instructions, which hold its one recommended instruction, in the system prompt. |
| 2. Tool design | `act`: Homing's five tools. `dedicated`: each of `act`'s actions is a function of its own (11 on 20 October, 13 on 21 October), with `act`'s description of it and that action's own input, and the harness turns each call back into `act`. Homing's words that point to `act` point to the matching function instead. Both with the instructions. |
| 3. Context size | `core`: `context` without what's relevant to the request. `relevant`: `context` as Homing gives it, the core plus up to 10 matching items, one line each. `full`: that, plus the pages those items are on, in full, up to five. All with the instructions. |

**Checks** (`benchmarks.ts`) are deterministic, and no model judges another. A question counts as answered when the model asked Homing and its answer has the expected facts, matched by patterns such as "1 March" written any of the usual ways. A change counts as done when Homing's database shows it afterwards: the item saved in the right space, the task due on Friday, the proposal with the right rule, item or person. Benchmark 2 also records whether the first write was the expected tool and action, and whether Homing accepted it the first time. Benchmark 1 has two control questions Homing has nothing to do with, to see whether the instruction makes a model call it anyway.

**Models.** Claude Sonnet 5.5 and GPT-6.1 Sol: the newest of Anthropic's Sonnet and of OpenAI's Sol models on OpenRouter's list on 20 October 2026, each in the middle of its maker's range there (between Haiku and Opus, and between Luna and Astra), at the same price, USD 2 per million input tokens and 10 per million output tokens. Each runs at its API's default reasoning, served by its own maker where OpenRouter can.

**Caching and strict mode.** The system prompt and the newest message are marked for Anthropic's prompt cache; OpenAI cached long prompts on its own, as the cached-token counts show. Functions are sent with `strict: false`. Sent through OpenRouter without a `strict` field, GPT-6.1 Sol called them as if they were strict: it filled every optional field, and always sent `context` a made-up `space`, such as `" "` or `"personal"`, which Homing refuses. With `strict: false` it left them out. That is what we saw, in 7 conversations and 10 single calls (see [results.md](results.md)); whether to send `strict` is each client's choice.

**Changed along the way.** Smoke runs of 30 conversations in all came before the pilot, and three things changed after them. Functions got `strict: false`, as above. A reminder saved in the personal space now counts as done: Claude Haiku 5.5 saved one there in the first smoke run, and a reminder works from there. And the task share-task was reworded. It first said "Share my task about the revised timeline with the rest of the team.", which doesn't say which team, and `search` can't find tasks: both GPT conversations asked which space and didn't share it, and Claude searched space after space, once only after the "go ahead". The first wording is kept as share-task-vague, which isn't in the results of 20 October and runs from the rerun of 21 October on. After the full run, the patterns for a few facts were made stricter for the next run; scoring the stored answers again with them changes 4 fact counts, where the old pattern took "follow up by email" for "Gunnar prefers email", and no result. For the rerun, archive-page also counts as done when archiving the page waits for Ana's approval: since #90, a page in a space others can open is archived once the user approves, even one only they see.

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
