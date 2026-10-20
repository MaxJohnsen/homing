# Benchmark results

Benchmarks 1 to 3 from the [spec](../docs/spec.md#benchmarks), run on 20 October 2026 against Homing as it is on main ([98a6ae2](https://github.com/MaxJohnsen/homing/commit/98a6ae2); nothing in its MCP tools has changed since). Claude Sonnet 5.5 and GPT-6.1 Sol, through OpenRouter, each did every task three times in every variant: 648 conversations, for USD 7.93. How they were run, and every prompt, is in the [README](README.md).

## What it means for Homing

**Models call Homing reliably when a request is about the user's work.** Both models asked Homing in all 240 conversations about Ana's work, with Homing's tools alone and with its instruction, and did 92 to 98% of the tasks. The rest failed on references and spaces, below, not on whether Homing was called.

**The recommended instruction didn't make them more reliable here, and one line of it works against Homing.** It made `context` the first call every time (Claude started with it 83% of the time without it), and it made both models call Homing for questions that have nothing to do with it: 9 of 12 control questions with it, against 1 of 12 without. It also says "when the user wants a new rule, show them the exact text and ask them to add it". GPT-6.1 Sol took that literally in 3 of the 15 conversations where the user asked it for a new rule with the instruction, and told the user to add it in Homing themselves, instead of proposing it with `act`, as the spec (§2) and `act`'s own description say.

**Five tools hold up.** Splitting `act` into one function per action changed nothing that matters (benchmark 2): tasks done went from 92% to 96% for Claude and from 90% to 86% for GPT, both within the spread between runs. Homing never refused an `act` payload for its shape, in any of the 648 conversations, including the 169 `act` calls of benchmark 2, and no model used `remember` where `act` was needed or the reverse. The 11 refused `act` calls were all about references, the same in both variants.

**What goes wrong is references and spaces.** Homing refused 93 of the 2,399 calls the models made, in 51 of the 648 conversations:

- 35 tried `replaces` on an item a person wrote. Agents never supersede what people wrote (spec §3), and the models then saved a new item beside it, as Homing's answer asks. But `remember` describes `replaces` as the way to update anything no longer true, and nothing tells the model who wrote an item before it tries.
- 37 paired a reference with the wrong space. 33 were an item or page from Website relaunch given with Northwind's space: Northwind's `context` and `search` include the spaces below it, so that's where the models found them, and `remember` then needs the space the page is really in. The other 4 tried to remove a personal rule "in" the space whose `context` showed it. In every case the reference already names its space.
- 12 gave a name where a reference was expected, such as `space: "Website relaunch"` or `"Personal"`, and 6 gave a page's reference as the space.

These cost turns. Telling Homing that Northwind's IT lead is leaving and who takes over failed in 7 of 12 conversations, every time by running out of the 10 model calls after a few of these refusals, 4 times with the change already saved.

**Tasks and proposals can't be found by searching.** For "Mark my task about the revised timeline as done", `search` finds nothing and `context` without a space lists candidate spaces. Claude opened spaces until it found the task, 6 of 6 times; GPT asked which space, 6 of 6 times, and the canned "go ahead" didn't answer that. Withdrawing a proposal went the same way once. The same task named with Gunnar ("I sent Gunnar the revised timeline…") was done every time, because his name finds the right space.

**More context saves calls, not quality, at this size** (benchmark 3). All three sizes gave complete answers, 180 of 180, because the models read what was missing. Giving more up front saved calls and time: Claude answered from the first `context` alone in none of 30 conversations with the core, 8 with the relevant items, and 16 with the full pages, and made 4.6, 3.8 and 2.9 Homing calls on average. GPT read more in every variant, 6.4, 5.8 and 4.7 calls. Cost per conversation stayed about the same, since fewer input tokens were also less often cached. Homing's own time was 0.1 to 0.2 seconds a conversation, the models' 7 to 17 seconds.

**GPT calls functions strictly unless told not to.** Sent Homing's tools as they are, without `strict: false`, GPT-6.1 Sol filled every optional field, so `context` always got a made-up space such as `" "` or `"personal"`, which Homing refuses. In 7 conversations it made 64 calls, Homing refused all 64, and it never did a task. With `strict: false` it leaves optional fields out, as the rest of these results show. An MCP client chooses this, and we couldn't see what ChatGPT does. A client that calls strictly needs every optional field to accept null, which Homing's don't.

### Worth deciding

These are suggestions from the results. None is built here.

1. Reword the instruction's line on rules to say "propose it with `act`, and the user approves the exact text", and consider narrowing "At the start of a task, call `context`" to tasks about the user's work.
2. Let a reference decide its space: `remember` with a page or item, and `guidance.propose` with a rule, could take the space from the reference, or accept the space it was shown in.
3. Make tasks and proposals searchable, or have `context` without a space match them.
4. Say in `remember` that `replaces` is for what agents wrote, and show who wrote each item where pages are read.
5. Consider adding the top few relevant pages in full to `context`, bounded, which answers part of the spec's open question on a default context budget.
6. Accept null for optional fields, for clients that call functions strictly. Check what ChatGPT does when #30 resumes.

## Benchmark 1: MCP reliability

In the tables, a rate is over all three runs, with the lowest and highest single run in brackets. Tokens are input and output per conversation, latency is the mean with the median in brackets, and cost is OpenRouter's.

Do models use Homing when they should, with its tools alone (`mcp-only`) and with its recommended instruction (`instruction`)? 20 tasks about Ana's work, which need Homing to answer or to do, and 2 control questions that don't. "Asked Homing" and the task columns leave out the controls.

| Variant | Model | Asked Homing | context first | Task done | Without "go ahead" | Reads | Saves | Governed | Homing on controls |
|---|---|---|---|---|---|---|---|---|---|
| mcp-only | claude-sonnet-5.5 | 100% (100–100) | 83% (80–85) | 98% (95–100) | 98% (95–100) | 100% (100–100) | 94% (83–100) | 100% (100–100) | 1/6 |
| mcp-only | gpt-6.1-sol | 100% (100–100) | 100% (100–100) | 95% (95–95) | 95% (95–95) | 100% (100–100) | 83% (83–83) | 100% (100–100) | 0/6 |
| instruction | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 98% (95–100) | 98% (95–100) | 100% (100–100) | 94% (83–100) | 100% (100–100) | 3/6 |
| instruction | gpt-6.1-sol | 100% (100–100) | 100% (100–100) | 92% (85–95) | 92% (85–95) | 97% (90–100) | 89% (83–100) | 83% (75–100) | 6/6 |

| Variant | Model | Homing calls | Model calls | Tokens in / out | Cached input | Latency | Cost each | Cost |
|---|---|---|---|---|---|---|---|---|
| mcp-only | claude-sonnet-5.5 | 3.0 | 3.3 | 23,114 / 504 | 90% | 7.4 s (5.9) | $0.0131 | $0.86 |
| mcp-only | gpt-6.1-sol | 3.2 | 3.7 | 15,320 / 224 | 87% | 8.6 s (6.9) | $0.0084 | $0.56 |
| instruction | claude-sonnet-5.5 | 3.0 | 3.3 | 24,800 / 529 | 90% | 8.0 s (7.3) | $0.0135 | $0.89 |
| instruction | gpt-6.1-sol | 3.6 | 4.3 | 19,559 / 270 | 90% | 11.9 s (10.9) | $0.0095 | $0.63 |

Per task, conversations that did it:

| Task | mcp-only, claude-sonnet-5.5 | mcp-only, gpt-6.1-sol | instruction, claude-sonnet-5.5 | instruction, gpt-6.1-sol |
|---|---|---|---|---|
| budget | 3/3 | 3/3 | 3/3 | 3/3 |
| golive | 3/3 | 3/3 | 3/3 | 3/3 |
| who-gunnar | 3/3 | 3/3 | 3/3 | 3/3 |
| why-azure | 3/3 | 3/3 | 3/3 | 3/3 |
| fjord-renewal | 3/3 | 3/3 | 3/3 | 3/3 |
| carpenter | 3/3 | 3/3 | 3/3 | 3/3 |
| my-tasks | 3/3 | 3/3 | 3/3 | 3/3 |
| report-format | 3/3 | 3/3 | 3/3 | 3/3 |
| call-prep | 3/3 | 3/3 | 3/3 | 2/3 |
| migration-owner | 3/3 | 3/3 | 3/3 | 3/3 |
| moved | 3/3 | 3/3 | 3/3 | 3/3 |
| remind | 3/3 | 3/3 | 3/3 | 3/3 |
| tick-off | 3/3 | 3/3 | 3/3 | 3/3 |
| invoices | 3/3 | 3/3 | 3/3 | 3/3 |
| new-contact | 2/3 | 0/3 | 2/3 | 1/3 |
| quote | 3/3 | 3/3 | 3/3 | 3/3 |
| bullet-rule | 3/3 | 3/3 | 3/3 | 1/3 |
| share-hint | 3/3 | 3/3 | 3/3 | 3/3 |
| add-cara | 3/3 | 3/3 | 3/3 | 3/3 |
| spain | 3/3 | 3/3 | 3/3 | 3/3 |
| percent | 3/3 | 3/3 | 3/3 | 0/3 |
| translate | 2/3 | 3/3 | 0/3 | 0/3 |

Why the others weren't done:

| Reason | mcp-only, claude-sonnet-5.5 | mcp-only, gpt-6.1-sol | instruction, claude-sonnet-5.5 | instruction, gpt-6.1-sol |
|---|---|---|---|---|
| asked Homing anyway | 1 | 0 | 3 | 6 |
| asked the user back | 0 | 0 | 0 | 1 |
| did it, but ran out of turns before answering | 1 | 2 | 1 | 0 |
| made no change | 0 | 0 | 0 | 2 |
| ran out of turns | 0 | 1 | 0 | 2 |

## Benchmark 2: Tool design

Do models build `act`'s payloads as well as they use dedicated tools, one per action, and do they choose correctly between `remember` and `act`? "Made a change" is any call to `remember` or `act`; whether that was the right tool, and whether Homing accepted it the first time, is counted among those. The 7 conversations whose first change wasn't the expected one were all GPT saving a note that the old CMS or the kitchen was done before archiving it, which does no harm. Claude's misses on tell-team came from the space refusals above: it spent its turns getting the space right, then ran out of them or stopped to ask before proposing the share.

| Variant | Model | Made a change | Right tool first | Accepted first time | All writes made | Task done | Without "go ahead" | Homing calls | Tokens in / out | Latency | Cost each | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| act | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 84% (82–88) | 96% (94–100) | 92% (88–94) | 92% (88–94) | 3.6 | 29,642 / 553 | 9.1 s (7.7) | $0.0145 | $0.74 |
| act | gpt-6.1-sol | 90% (82–94) | 91% (88–94) | 89% (86–94) | 90% (82–94) | 90% (82–94) | 84% (76–88) | 3.3 | 19,711 / 237 | 11.7 s (11.1) | $0.0084 | $0.43 |
| dedicated | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 82% (82–82) | 100% (100–100) | 96% (88–100) | 96% (88–100) | 3.9 | 31,869 / 573 | 9.6 s (7.6) | $0.0151 | $0.77 |
| dedicated | gpt-6.1-sol | 86% (82–88) | 93% (93–93) | 89% (87–93) | 86% (82–88) | 86% (82–88) | 80% (76–82) | 3.0 | 18,428 / 220 | 9.8 s (8.8) | $0.0079 | $0.40 |

Per task, conversations that did it:

| Task | act, claude-sonnet-5.5 | act, gpt-6.1-sol | dedicated, claude-sonnet-5.5 | dedicated, gpt-6.1-sol |
|---|---|---|---|---|
| rule-private | 3/3 | 2/3 | 3/3 | 3/3 |
| rule-shared | 3/3 | 3/3 | 3/3 | 3/3 |
| rule-remove | 2/3 | 2/3 | 2/3 | 0/3 |
| rule-change | 3/3 | 3/3 | 3/3 | 3/3 |
| publish | 3/3 | 3/3 | 3/3 | 3/3 |
| add-member | 3/3 | 3/3 | 3/3 | 3/3 |
| make-admin | 3/3 | 3/3 | 3/3 | 3/3 |
| create-space | 3/3 | 3/3 | 3/3 | 3/3 |
| archive-space | 3/3 | 3/3 | 3/3 | 3/3 |
| share-task | 3/3 | 3/3 | 3/3 | 3/3 |
| archive-page | 3/3 | 3/3 | 3/3 | 3/3 |
| withdraw | 3/3 | 3/3 | 3/3 | 2/3 |
| rename | 3/3 | 3/3 | 3/3 | 3/3 |
| remind | 3/3 | 3/3 | 3/3 | 3/3 |
| note | 3/3 | 3/3 | 3/3 | 3/3 |
| done | 3/3 | 0/3 | 3/3 | 0/3 |
| tell-team | 0/3 | 3/3 | 2/3 | 3/3 |

Why the others weren't done:

| Reason | act, claude-sonnet-5.5 | act, gpt-6.1-sol | dedicated, claude-sonnet-5.5 | dedicated, gpt-6.1-sol |
|---|---|---|---|---|
| Homing refused every try | 1 | 0 | 0 | 0 |
| asked the user back | 0 | 3 | 0 | 6 |
| did it, but ran out of turns before answering | 2 | 0 | 0 | 0 |
| made no change | 0 | 2 | 0 | 1 |
| made the wrong change | 1 | 0 | 0 | 0 |
| ran out of turns | 0 | 0 | 2 | 0 |

## Benchmark 3: Context size

How much should `context` give: the core alone, the core plus the relevant items (Homing as it is), or that plus the pages those items are on, in full? Every question has facts on one or two pages; "Facts found" counts them in the answers.

| Variant | Model | Facts found | Complete answers | Homing calls | Model calls | Tokens in / out | Cached input | Latency | Cost each | Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| core | claude-sonnet-5.5 | 100% | 100% (100–100) | 4.6 | 3.5 | 25,507 / 665 | 90% | 8.6 s (6.9) | $0.0154 | $0.46 |
| core | gpt-6.1-sol | 100% | 100% (100–100) | 6.4 | 4.5 | 20,954 / 598 | 89% | 17.0 s (12.5) | $0.0134 | $0.40 |
| relevant | claude-sonnet-5.5 | 100% | 100% (100–100) | 3.8 | 3.2 | 23,543 / 610 | 88% | 7.9 s (6.4) | $0.0152 | $0.45 |
| relevant | gpt-6.1-sol | 100% | 100% (100–100) | 5.8 | 4.4 | 20,923 / 556 | 88% | 16.0 s (11.0) | $0.0137 | $0.41 |
| full | claude-sonnet-5.5 | 100% | 100% (100–100) | 2.9 | 2.8 | 21,164 / 534 | 84% | 7.1 s (6.4) | $0.0157 | $0.47 |
| full | gpt-6.1-sol | 100% | 100% (100–100) | 4.7 | 3.8 | 19,759 / 530 | 84% | 15.1 s (10.7) | $0.0148 | $0.44 |

Every task was answered completely in every run and variant, by both models.

## Limitations

- **API models aren't the apps.** Claude.ai and ChatGPT add their own system prompts, other tools that compete for a request, such as web search and memory, and their own handling of MCP: how tools are named, whether functions are called strictly, and in Claude.ai, Homing's approval card. These runs use a plain system prompt, Homing's tools only, and links instead of the card. They validate neither the ChatGPT app and its connector nor Claude.ai.
- **One turn.** The user says one thing, plus "Yes, please go ahead." once if no change was made. A real user would answer a question, which would turn most "asked the user back" failures into successes.
- **Requests that point at Homing.** Every task is about Ana's work and names its people and clients, and there are only two controls. That 100% asked Homing says little about vaguer requests, or about requests where other tools compete.
- **One small world.** About 30 pages, and questions with one clear subject each. Context size at thousands of pages is untested, and there the full variant would cost more.
- **Patterns, not judgment.** An answer can match a fact's pattern and still be wrong, or say it in a way the pattern misses. A sample of answers read by hand matched what the patterns found.
- **One model per maker, three runs.** Each at its API's default reasoning and temperature, in October 2026. The ranges are the lowest and highest of the three runs, not confidence intervals. The strict-mode finding rests on 7 conversations and 10 single calls.

## Spending

| Phase | Conversations | USD |
|---|---|---|
| Smoke runs, to check the harness, including the 7 strict-mode conversations above and 2 with Claude Haiku 5.5 | 30 | 0.41 |
| Single calls to understand the strict-mode failure | 10 calls | 0.03 |
| Pilot | 44 | 0.67 |
| Full run | 648 | 7.93 |
| **Total** | | **9.04** |

The ledger counts USD 9.0376 over 2,807 model calls, every one with its cost from OpenRouter, and the key's own usage grew by exactly the same since the first run. The cap was USD 50; no call came near it.

**The plan, from the pilot.** The pilot cost, per conversation, USD 0.014 (Claude) and 0.008 (GPT) in benchmark 1, 0.017 and 0.010 in benchmark 2, and 0.024 and 0.025 in benchmark 3. That projected USD 10 for the full set, three runs of every task, variant and model, well under the USD 45 planned, so nothing was trimmed. The full run had a limit of USD 20 of its own.
