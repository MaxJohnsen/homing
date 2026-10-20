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
```

`--models` takes other models from [OpenRouter's list](https://openrouter.ai/api/v1/models), `--only b1,b3` some of the benchmarks, `--runs` the number of runs and `--concurrency` how many conversations run at once. Every run drops and remakes the database `homing_bench`, or the one `HOMING_BENCH_DB` names, which must start with `homing_bench`.

Each conversation is one line in `results/<phase>.jsonl`: the tools called with their arguments, Homing's answers (shortened), the model's answer, tokens, time and cost. A run skips what already has a result there, so a stopped run continues without paying for anything twice.

### Spending

Every model call passes the guard in `budget.ts` first. It reserves the call's worst case: its input at the dearest input price that could apply, cache writes included, and all of `max_tokens` at the output price. If what's spent, plus every call under way, plus that worst case would pass USD 50, or the run's `--max-spend`, the call isn't made and the run stops.

What each call cost, as OpenRouter reports it, goes into `bench/.spend.json` at once. The file is outside git and is never reset: a rerun adds to it, and a call a crash interrupted counts at its worst case. The key's own usage is also read at the start and end of every run and every 50 calls, and the run stops if it has grown by more than USD 50 since the first run.

The key is read from its file when the first call is made and only ever sent in the Authorization header. Errors and results pass through a filter that removes anything shaped like a key. `node --test bench/budget.test.ts` tests the guard with made-up prices and a stand-in for OpenRouter, without spending anything.

## How they work

**A world per conversation.** Each conversation starts from a new world, made through Homing's own operations (`homing.ts`), so nothing one conversation saves shows up in another. Ana Berg works at Acme, a consultancy, with her colleague Cara Lund. Acme's client Northwind is relaunching its website, in a space below Northwind, and Fjord Bank is a closed client space only Ana has. Her personal space holds a kitchen renovation and her running. There are shared and private rules, a status report skill, about 30 pages written by both of them, things Ana's assistant saved for her alone, two private tasks and a shared one, and a rule her assistant proposed that she hasn't decided yet. Her assistant connects over OAuth the way Claude or ChatGPT does, and acts as her over MCP.

**The conversation** (`agent.ts`). The model gets Homing's tools from `tools/list` as functions. The harness forwards each call to Homing and returns its answer, for up to 10 model calls. The system prompt is a plain assistant's, "You are a helpful assistant. Today is Tuesday, 20 October 2026.", plus Homing's MCP instructions in the variants that have them. When a change was asked for and the model stops without making one, usually to ask permission, the user replies once with "Yes, please go ahead." The results say how often that was needed.

**Variants** (`variants.ts`) change only how Homing is presented, never Homing:

| Benchmark | Variants |
|---|---|
| 1. MCP reliability | `mcp-only`: the tools and their descriptions. `instruction`: the same, with Homing's MCP instructions, which hold its one recommended instruction, in the system prompt. |
| 2. Tool design | `act`: Homing's five tools. `dedicated`: each of `act`'s 11 actions is a function of its own, with `act`'s description of it and that action's own input, and the harness turns each call back into `act`. Homing's words that point to `act` point to the matching function instead. Both with the instructions. |
| 3. Context size | `core`: `context` without what's relevant to the request. `relevant`: `context` as Homing gives it, the core plus up to 10 matching items, one line each. `full`: that, plus the pages those items are on, in full, up to five. All with the instructions. |

**Checks** (`benchmarks.ts`) are deterministic, and no model judges another. A question counts as answered when the model asked Homing and its answer has the expected facts, matched by patterns such as "1 March" written any of the usual ways. A change counts as done when Homing's database shows it afterwards: the item saved in the right space, the task due on Friday, the proposal with the right rule, item or person. Benchmark 2 also records whether the first write was the expected tool and action, and whether Homing accepted it the first time. Benchmark 1 has two control questions Homing has nothing to do with, to see whether the instruction makes a model call it anyway.

**Models.** Claude Sonnet 5.5 and GPT-6.1 Sol, each maker's current everyday model, released a day apart and priced the same, USD 2 per million input tokens and 10 per million output tokens. They are what most people would use in Claude or ChatGPT. Each runs at its API's default reasoning, served by its own maker where OpenRouter can.

**Like the apps.** The system prompt and the newest message are marked for Anthropic's prompt cache, as Claude's apps do; OpenAI caches without being asked. Functions are sent with `strict: false`. Without it, GPT models call functions strictly, filling every optional field: GPT-6.1 Sol always sent `context` a made-up `space`, such as `" "` or `"personal"`, which Homing refuses (see [results.md](results.md)).

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
