# Benchmark results

Benchmarks 1 to 3 from the [spec](../docs/spec.md#benchmarks). The first run, on 20 October 2026, found where assistants stumble; [#95](https://github.com/MaxJohnsen/homing/pull/95) fixed what it found, and a rerun of benchmarks 1 and 2 on 21 October checked the fixes. How they were run, and every prompt, is in the [README](README.md).

## Rerun of benchmarks 1 and 2, 21 October 2026

The same prompts, models, settings and three runs as the first run, against main at [b44ad36](https://github.com/MaxJohnsen/homing/commit/b44ad36), plus share-task-vague, the first wording of share-task, which failed in the first smoke runs: 480 conversations, for USD 5.47. Since the first run, #95 let a reference decide its space, made tasks and proposals searchable, said `replaces` is for what assistants wrote, showed who wrote each item, and reworded the instruction's line on rules. `act` also gained three actions (`space.share`, `space.export` and `plan.propose`), and since #90 archiving a page in a space others can open waits for the user's approval. The first run's limitations, below, hold for this one too.

### What it means for Homing

**The fixes worked.** Homing refused none of the 1,448 calls the models made, against 93 of 1,551 in the first run, and every failure the first run traced to references and spaces is gone. Tasks done in both benchmarks rose from 96% to 100% for Claude and from 91% to 98% for GPT, and in benchmark 2 Homing accepted every write the first time, where before it accepted 82 to 89%.

| Failure in the first run | First run, Claude | First run, GPT | Rerun, Claude | Rerun, GPT |
|---|---|---|---|---|
| Refused: `replaces` on what a person wrote | 17 | 18 | 0 | 0 |
| Refused: a reference with another space | 25 | 12 | 0 | 0 |
| Refused: a name or a page where a space was expected | 11 | 7 | 0 | 0 |
| Refused: something else | 3 | 0 | 0 | 0 |
| Conversations with a refused call | 29 of 234 | 22 of 234 | 0 of 240 | 0 of 240 |
| Mark a task done by what it's about (done) | 6 of 6 | 0 of 6 | 6 of 6 | 6 of 6 |
| …calls to Homing it took, mean | 7.7 | 2.3 | 3.0 | 4.0 |
| Share a task, not saying where (share-task-vague) | not run | not run | 6 of 6 | 6 of 6 |
| Withdraw a proposal (withdraw) | 6 of 6 | 5 of 6 | 6 of 6 | 6 of 6 |
| Northwind's IT lead is leaving (new-contact) | 4 of 6 | 1 of 6 | 6 of 6 | 6 of 6 |
| …ran out of turns | 2 of 6 | 5 of 6 | 0 of 6 | 0 of 6 |
| A new rule, with the instruction: told the user to add it | 0 of 15 | 3 of 15 | 0 of 15 | 0 of 15 |

Class by class:

- **`replaces` on what a person wrote.** Models tried `replaces` 70 times in the first run and 12 times in this one, each time on Erik's quote, which Ana's assistant had written, and Homing accepted all 12. For "the relaunch moves to 15 March", which a person wrote, they saved the new date beside the old one, 12 times of 12.
- **References and spaces.** Models named a reference and gave a space as well in 156 writes in the first run, and in 2 now; they leave the space out and let the reference decide. Nobody gave a name or a page where a space was expected.
- **Tasks and proposals.** `search` finds them now. Marking the timeline task done took Claude 3.0 calls to Homing instead of 7.7, and GPT found the task every time instead of asking which space. The vague share-task, which GPT never did in the smoke runs and Claude did only by opening space after space, was done 12 times of 12.
- **Running out of turns.** Without the refusals, telling Homing that Northwind's IT lead is leaving was done 12 times of 12, never out of turns.
- **The rule line.** Reworded to "propose it with `act` and guidance.propose, and they approve the exact text", it no longer reads as "add it yourself": GPT proposed the rule all 15 times.

**What is left.**

- **The instruction still pulls Homing into unrelated questions.** With it, GPT called Homing for both control questions every time, 6 of 6, as in the first run, and Claude 1 of 6, against 3 before. Without it, neither did. Its first line, "At the start of a task, call `context`", is the next thing to fix.
- **A new miss, from more information.** Asked to share Gunnar's hint "with everyone on the Northwind team", GPT now sees in `search` that the hint is in Website relaunch, a space below Northwind. In 4 of its 6 conversations it saved a copy in Northwind and proposed sharing the copy instead. Sharing the hint where it is would have reached the same people, since Website relaunch isn't closed, but nothing told the model so. Claude shared the original 6 times of 6.
- **archive-page needed a new check.** Since #90, archiving Ana's page in Website relaunch, which others can open, waits for her approval. Scored with the old check, which wanted the page archived at once, all 12 failed, each having proposed it as Homing asked. The check now accepts the waiting proposal, and those 12 were run again with it, for USD 0.15, and passed.

**Cost and time hardly changed.** Input tokens per conversation rose by up to a fifth, with longer tool descriptions and the new actions, while Claude made fewer calls to Homing: 2.8 instead of 3.6 per conversation with `act`. Cost per conversation stayed within a quarter of a cent of the first run's.

### Benchmark 1: MCP reliability

| Variant | Model | Asked Homing | context first | Task done | Without "go ahead" | Reads | Saves | Governed | Homing on controls |
|---|---|---|---|---|---|---|---|---|---|
| mcp-only | claude-sonnet-5.5 | 100% (100–100) | 80% (80–80) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 0/6 |
| mcp-only | gpt-6.1-sol | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 0/6 |
| instruction | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 1/6 |
| instruction | gpt-6.1-sol | 100% (100–100) | 100% (100–100) | 98% (95–100) | 98% (95–100) | 97% (90–100) | 100% (100–100) | 100% (100–100) | 6/6 |

| Variant | Model | Homing calls | Model calls | Tokens in / out | Cached input | Latency | Cost each | Cost |
|---|---|---|---|---|---|---|---|---|
| mcp-only | claude-sonnet-5.5 | 2.8 | 2.9 | 24,262 / 452 | 90% | 6.5 s (5.6) | $0.0126 | $0.83 |
| mcp-only | gpt-6.1-sol | 2.7 | 3.4 | 16,728 / 183 | 89% | 9.8 s (9.2) | $0.0078 | $0.52 |
| instruction | claude-sonnet-5.5 | 2.9 | 3.1 | 27,366 / 520 | 91% | 7.9 s (7.4) | $0.0139 | $0.92 |
| instruction | gpt-6.1-sol | 3.5 | 4.2 | 23,313 / 250 | 91% | 12.0 s (10.9) | $0.0100 | $0.66 |

Every task was done in every conversation except these: report-format, once by GPT with the instruction, whose answer left out that reports are in English; and the controls, percent and translate, where with the instruction GPT asked Homing all 6 times and Claude once, for translate.

### Benchmark 2: Tool design

| Variant | Model | Made a change | Right tool first | Accepted first time | All writes made | Task done | Without "go ahead" | Homing calls | Tokens in / out | Latency | Cost each | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| act | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 2.8 | 29,333 / 455 | 7.7 s (7.2) | $0.0123 | $0.66 |
| act | gpt-6.1-sol | 100% (100–100) | 87% (83–89) | 100% (100–100) | 100% (100–100) | 96% (94–100) | 96% (94–100) | 3.4 | 23,664 / 225 | 15.2 s (10.3) | $0.0092 | $0.50 |
| dedicated | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 100% (100–100) | 2.7 | 28,750 / 437 | 7.0 s (6.6) | $0.0124 | $0.67 |
| dedicated | gpt-6.1-sol | 100% (100–100) | 91% (89–94) | 100% (100–100) | 100% (100–100) | 96% (94–100) | 96% (94–100) | 3.3 | 23,340 / 213 | 12.2 s (11.2) | $0.0091 | $0.49 |

Every task was done in every conversation except GPT's 4 copies of Gunnar's hint, above, 2 in each variant. Where GPT's first write wasn't the expected one, 12 times, it saved a note first: before archiving the page or the kitchen space, as in the first run, and the 4 copies of the hint. `act` and the dedicated tools did equally well again.

### Spending

| Phase | Conversations | USD |
|---|---|---|
| Rerun of benchmarks 1 and 2 | 480 | 5.25 |
| archive-page under the old check, run again after it changed | 12 | 0.14 |
| A call whose cost OpenRouter didn't report, counted at its worst case | | 0.07 |
| **Total** | | **5.47** |

The rerun had a limit of USD 6.50 of its own. The ledger's total is now USD 14.50 over 4,576 model calls, against the cap of USD 50; the key's own usage since the first run is USD 14.30.

## First run, 20 October 2026

Benchmarks 1 to 3, run against Homing as it was on main ([98a6ae2](https://github.com/MaxJohnsen/homing/commit/98a6ae2)). Claude Sonnet 5.5 and GPT-6.1 Sol, through OpenRouter, each did every task three times in every variant: 648 conversations, for USD 7.93.

### What it means for Homing

**Models call Homing reliably when a request is about the user's work.** Both models asked Homing in all 240 conversations about Ana's work, with Homing's tools alone and with its instruction, and did 92 to 98% of the tasks. The rest failed on references and spaces, below, not on whether Homing was called.

**The recommended instruction didn't make them more reliable here, and one line of it works against Homing.** It made `context` the first call every time (Claude started with it 83% of the time without it), and it made both models call Homing for questions that have nothing to do with it: 9 of 12 control questions with it, against 1 of 12 without. It also says "when the user wants a new rule, show them the exact text and ask them to add it". GPT-6.1 Sol took that literally in 3 of the 15 conversations where the user asked it for a new rule with the instruction, and told the user to add it in Homing themselves, instead of proposing it with `act`, as the spec (§2) and `act`'s own description say.

That doesn't show the instruction is useless, and the spec's "more consistent" (§10) stays as it is on this evidence. Without the instruction, both models already called Homing every time, so there was no room to be more consistent. Vaguer requests, or other tools competing for them, may show a difference these didn't.

**Five tools hold up.** Splitting `act` into one function per action changed nothing that matters (benchmark 2): tasks done went from 92% to 96% for Claude and from 90% to 86% for GPT, both within the spread between runs. Homing never refused an `act` payload for its shape, in any of the 648 conversations, including the 169 `act` calls of benchmark 2, and no model used `remember` where `act` was needed or the reverse. The 11 refused `act` calls were all about references, the same in both variants.

**What goes wrong is references and spaces.** Homing refused 93 of the 2,399 calls the models made, in 51 of the 648 conversations:

- 35 tried `replaces` on an item a person wrote. Agents never supersede what people wrote (spec §3), and the models then saved a new item beside it, as Homing's answer asks. But `remember` describes `replaces` as the way to update anything no longer true. `read` of an item says who wrote it, but page reads, `context` and `search` don't, and the models went by those.
- 37 paired a reference with the wrong space. 33 were an item or page from Website relaunch given with Northwind's space: Northwind's `context` and `search` include the spaces below it, so that's where the models found them, and `remember` then needs the space the page is really in. The other 4 tried to remove a personal rule "in" the space whose `context` showed it. In every case the reference already names its space.
- 12 gave a name where a reference was expected, such as `space: "Website relaunch"` or `"Personal"`, and 6 gave a page's reference as the space.
- The last 3: two tried to share an item that can't be shared, one Ana's own overview and one a reference the model had pieced together from two others, and one tried to gather a page into a collection in another space.

These cost turns. Telling Homing that Northwind's IT lead is leaving and who takes over failed in 7 of 12 conversations, every time by running out of the harness's 10 model calls after a few of these refusals, 4 times with the change already saved.

**Tasks and proposals can't be found by searching.** For "Mark my task about the revised timeline as done", `search` finds nothing and `context` without a space lists candidate spaces. Claude opened spaces until it found the task, 6 of 6 times; GPT asked which space, 6 of 6 times, and the canned "go ahead" didn't answer that. Withdrawing a proposal went the same way once. The same task named with Gunnar ("I sent Gunnar the revised timeline…") was done every time, because his name finds the right space.

**More context saves calls, not quality, at this size** (benchmark 3). All three sizes gave complete answers, 180 of 180, because the models read what was missing. Giving more up front saved calls: Claude answered from `context` alone, without `read` or `search`, in none of 30 conversations with the core, 8 with the relevant items, and 16 with the full pages, and made 4.6, 3.8 and 2.9 Homing calls on average. GPT read more in every variant, 6.4, 5.8 and 4.7 calls. Whether it saves time isn't shown: the mean fell a little from core to full, from 8.6 to 7.1 seconds for Claude and from 17.0 to 15.1 for GPT, but Claude's median was the same for relevant and full, 6.4 seconds, and the spread is wide. Cost per conversation stayed about the same, since fewer input tokens were also less often cached. Homing's own time was 0.1 to 0.2 seconds a conversation, the models' 7 to 17 seconds.

**Sent without a `strict` field, GPT called functions as if they were strict.** Through OpenRouter, GPT-6.1 Sol filled every optional field of functions sent without `strict`, so `context` always got a made-up space such as `" "` or `"personal"`, which Homing refuses. In 7 conversations it made 64 calls, Homing refused all 64, and it never did a task. With `strict: false` it left optional fields out, as the rest of these results show. That is what we saw; we didn't find it described by OpenAI or OpenRouter. Whether to send `strict` is each client's choice, and we couldn't see what ChatGPT does. A client that calls strictly would need every optional field to accept null, which Homing's don't.

#### Worth deciding

These are suggestions from the results. None is built here.

1. Reword the instruction's line on rules to say "propose it with `act`, and the user approves the exact text", and consider narrowing "At the start of a task, call `context`" to tasks about the user's work.
2. Let a reference decide its space: `remember` with a page or item, and `guidance.propose` with a rule, could take the space from the reference, or accept the space it was shown in.
3. Make tasks and proposals searchable, or have `context` without a space match them.
4. Say in `remember` that `replaces` is for what agents wrote, and show who wrote each item where pages are read.
5. Consider adding the top few relevant pages in full to `context`, bounded, which answers part of the spec's open question on a default context budget.
6. Accept null for optional fields, for clients that call functions strictly. Check what ChatGPT does when #30 resumes.

### Benchmark 1: MCP reliability

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

### Benchmark 2: Tool design

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

### Benchmark 3: Context size

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

### Changed along the way

Smoke runs of 30 conversations came before the pilot, and three things changed after them: functions got `strict: false`; a reminder saved in the personal space counts as done; and share-task was reworded. It first said "Share my task about the revised timeline with the rest of the team.", which doesn't say which team. Both GPT conversations asked which space and shared nothing, since `search` can't find tasks, and Claude searched space after space. That is a second case of tasks that can't be found by searching, which these results don't count. The first wording is kept for the next run as share-task-vague. The [README](README.md#how-they-work) has the details.

### Limitations

- **API models aren't the apps.** Claude.ai and ChatGPT add their own system prompts, other tools that compete for a request, such as web search and memory, and their own handling of MCP: how tools are named, whether functions are called strictly, and in Claude.ai, Homing's approval card. These runs use a plain system prompt, Homing's tools only, and links instead of the card. They validate neither the ChatGPT app and its connector nor Claude.ai.
- **One turn.** The user says one thing, plus "Yes, please go ahead." once if no change was made. A real user would answer a question, which would turn most "asked the user back" failures into successes.
- **Requests that point at Homing.** Every task is about Ana's work and names its people and clients, and there are only two controls. That 100% asked Homing says little about vaguer requests, or about requests where other tools compete.
- **One small world.** About 30 pages, and questions with one clear subject each. Context size at thousands of pages is untested, and there the full variant would cost more.
- **Patterns, not judgment.** An answer can match a fact's pattern and still be wrong, or say it in a way the pattern misses. A sample of answers read by hand matched what the patterns found. A few patterns were loose, such as one that took any mention of email for "Gunnar prefers email"; they are stricter for the next run, and scoring the stored answers again with them changes 4 fact counts and no result.
- **A limit of 10 model calls.** The harness ends a conversation after 10 model calls. That limit is behind 7 of the 12 failures of the task about Northwind's IT lead, 4 of them after the change was saved; a client that lets a model go on would have done more of them.
- **The full variant's extra reads.** In benchmark 3's full variant, the harness reads the pages it adds itself. Those reads aren't counted as Homing calls, though their time is in the latency.
- **One model per maker, three runs.** Each at its API's default reasoning and temperature, in October 2026. The ranges are the lowest and highest of the three runs, not confidence intervals. The strict-mode finding rests on 7 conversations and 10 single calls.

### Spending

| Phase | Conversations | USD |
|---|---|---|
| Smoke runs, to check the harness, including the 7 strict-mode conversations above and 2 with Claude Haiku 5.5 | 30 | 0.41 |
| Single calls to understand the strict-mode failure | 10 calls | 0.03 |
| Pilot | 44 | 0.67 |
| Full run | 648 | 7.93 |
| **Total** | | **9.04** |

The ledger counts USD 9.0376 over 2,807 model calls, every one with its cost from OpenRouter, and the key's own usage grew by exactly the same since the first run. The cap was USD 50; no call came near it. The ledger has since moved to `~/.config/homing/bench-spend.json`, outside every checkout, with that history in it.

**The plan, from the pilot.** The pilot cost, per conversation, USD 0.014 (Claude) and 0.008 (GPT) in benchmark 1, 0.017 and 0.010 in benchmark 2, and 0.024 and 0.025 in benchmark 3. That projected USD 10 for the full set, three runs of every task, variant and model, well under the USD 45 planned, so nothing was trimmed. The full run had a limit of USD 20 of its own.
