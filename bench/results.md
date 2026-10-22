# Benchmark results

Benchmarks 1 to 4 from the [spec](../docs/spec.md#benchmarks). The first run, on 20 October 2026, found where assistants stumble; [#95](https://github.com/MaxJohnsen/homing/pull/95) fixed what it found, and a rerun of benchmarks 1 and 2 on 21 October checked the fixes. The same day, harder conversations for benchmark 1 tested a new recommended instruction, and small reruns tested three changes to Homing's tools that they suggested. On 22 October, benchmark 4 measured retrieval: Homing's search against BM25, semantic search and query interpretation. How they were run, and every prompt and query, is in the [README](README.md).

## Retrieval, benchmark 4, 22 October 2026

Benchmark 4 asks Homing's search directly, with no model in between: 126 questions a consultant asks about her own notes, each labeled with what answers it, against `search` and `context` as on main ([15fa432](https://github.com/MaxJohnsen/homing/commit/15fa432)), BM25 over what she can see and over everyone, semantic search, a hybrid of the two, and a small model that writes the search words first. Everything runs as her, with row-level security on. The world, the questions and the scoring are in the [README](README.md#benchmark-4-retrieval), and every query with its labels in [retrieval-set.ts](retrieval-set.ts). Embeddings and search words cost USD 0.03.

### What it means for Homing

**Search finds what's asked in the notes' own words, and that's most of what's asked.** Asked in the language of the note, `search` and `context` had the answer in their first 10 lines for 91 to 100% of the Norwegian and English questions, and for all 20 with identifiers, such as "faktura 2026-0417", "rom 101" or "E42". Nothing came back that Ana mustn't see, from any approach, for any of the 126 questions: no item of Cara's or Ben's, nothing from Polar Freight, and none of the words only they wrote. That holds by construction: every approach runs under row-level security, and the run checks that it hides from Ana exactly what the access rule, written out by hand for this world, says it should. So this confirms row-level security for these cases rather than measuring the approaches; their real privacy test is the statistics, below.

**It misses when the words differ, and mostly across languages.** Ana writes about her own life in Norwegian and often asks in English, and the other way round. Of 19 questions whose words don't match the note, `search` found 10: 8 of the 10 asked in the note's language, and 2 of the 9 asked in the other. For example:

- "When does the new fridge arrive?" The note says "Hvitevarene leveres fra Elkjøp 10. november." Neither `search`, `context` nor BM25 finds it.
- "Did the guy doing my kitchen say when he starts?" `context` answers "Nothing in Homing matches", while Erik's page says "Erik begynner 3. november." It did the same for "How much will the kitchen cost?"
- "Who handles legal questions at Northwind?" The note, in English, says Mona Lie is Northwind's lawyer. No word in common.

**BM25 ranks a little better and fixes none of that.** Given the whole request, BM25 over what Ana can see had the answer in the first 10 for 85% of the questions against 80% for `search`, with a mean reciprocal rank of 0.73 against 0.66, in part because short notes of common words, such as "Can we look at the navigation together this week?", no longer come first. On `context`'s telling words it was even: 81% against 83%, 0.72 against 0.69. Across languages it found one question more than `search`, 11 of 12, and where the words differ one more, 11 of 19, but still only 2 of the 9 asked in the other language.

**The stopword and short-number rules still do a job that BM25 doesn't.** Letting `context` drop them was the point of BM25, but with every word some word always matches, so BM25 never says that nothing matches: 0 of the 12 general questions, against 6 for `context` today. A score threshold doesn't separate them either. To say nothing for 7 of the 12, BM25 also had to say it for 24 of the 103 questions that have an answer, 12 of them with the answer in its first 10.

**Per-user statistics cost time on a big Homing, and global ones leak.** BM25 needs to know how many documents the user can see, how long they are, and how many hold each word. Counted over what Ana can see, for every query, that took 268 ms at the median on the big sample, and BM25 as a whole 456 ms, with 1.6 s at p95, against 100 and 296 ms for `search` (below). On a synthetic space of 176,000 long items it took 25 s. Counted once over everyone's documents, as a shared index keeps them, they cost nothing per query, but then what others keep private moves what Ana sees. After Cara wrote 200 private items with words Ana searches for, Ana's first ten changed order for 58 of her 126 questions, and score for 66 more. With `ts_rank`, or BM25 over what Ana can see, not one changed. A word Cara writes about where Ana can't look is enough to flip Ana's two notes for "Bergen Fjordline" (below), which tells her someone has written about Bergen.

**On a very big space, search itself is slow.** In one space of 176,000 items of about 4 KB, `search` took 2.3 s at the median and `context`'s ranking 2.1 s. Part of that is a fault: the full-text index isn't used under row-level security, so every search reads every row, and "E42" took 0.9 s that the index answers in 4 ms. The rest is ranking every note that has any word of a request, which the index doesn't change. On the big sample, which is closer to a heavy real user, `search` took 100 ms at the median.

**Semantic search, or a model writing the words, fixes the misses.** Embeddings from `baai/bge-m3`, an open multilingual model, had the answer in the first 10 for 93% of the questions, including every one asked in the other language or in other words, with a mean reciprocal rank of 0.85. They missed an identifier, "Where is room 214?", which fusing them with `search` or BM25 brings back. Having a small model write the search words first, in both languages, raised `search` to 95% with Claude Haiku 5.5 and to 90% with GPT-6 Luna. Neither helps to say that nothing matches. Part of semantic search's edge may come from how items were embedded: each with its page's title in front, as "Kjøkkenplan: Hvitevarene leveres…", while full-text search matches an item's text alone. Semantic search always finds something close: a similarity threshold of 0.5 happened to separate the general questions here for bge-m3 (8 of 12, with no answer lost), but it wouldn't for OpenAI's model, and would need setting per model and per Homing. The interpretations said nothing as often as `context` does, 6 and 5 of 12.

**Their cost is in the calls, and one of them is already made.** Through OpenRouter, a query's embedding took 0.7 to 1.1 s at the median for the two models, and 0.5 to 2.9 s in all; an interpretation 1.6 to 2.5 s at the median, and 0.9 to 4.9 s in all. Homing's own search took 8 to 30 ms here. Semantic search also needs every item embedded when it's written, a model the operator runs or pays for, and pgvector, which isn't installed here, so similarity was computed over plain arrays and its time says nothing about pgvector. Embedding this world's 2,018 texts cost about a tenth of a cent with both models together. But an assistant calling `search` already writes the query itself, so asking it for the words a note would use, in each of the user's languages, costs nothing more. `context` is different: it takes the user's request as they said it.

**Two smaller faults turned up.**

- `search` lists what's no longer true after everything current, and keeps 20 lines. Once 20 current items match, the old ones never show: "What was the original go-live date for the relaunch, before it moved?" never brings up 1 March, though the spec says what used to be true stays searchable.
- `search` splits the query into letters and digits, while PostgreSQL splits the notes its own way: "BETA-881" is stored as "beta" and "-881", and "2.4.1" as one word. Splitting the query the same way put the right note first for all 20 identifier questions, a mean reciprocal rank of 1.00 against 0.89, and changed nothing else.

**Recommendation: keep PostgreSQL full-text search with `ts_rank` for v0.1.0.** BM25 isn't worth its cost: a few points of ranking, no fix for the misses that matter, and per-user counting that costs hundreds of milliseconds on a big Homing and seconds on a very big one. What fails is the words, not the ranking, and the cheapest fix for that is the assistant that already writes `search`'s query. v0.1.0 needs none of the changes below.

#### Worth deciding, after v0.1.0

These are suggestions from the results. None is built here.

1. Ask assistants, in `search`'s description, to search with the words a note would use, including synonyms and each language the user writes in. Consider letting `context` take such words beside the request.
2. Split the query as PostgreSQL splits the notes, so identifiers with dots and dashes are found as written.
3. Show what's no longer true within the 20 lines when the query is about the past, not only after everything current.
4. Semantic search, fused with full-text search, as something an operator turns on, as the architecture already allows, measured on a real Homing with pgvector. The core keeps working without it.
5. Let the full-text index work under row-level security, before Homings get very big: mark the match operator's function leakproof, which needs a superuser and is a security call of its own, or find candidates through a function that applies the access rule itself.
6. If ranking ever needs word statistics, count them only over what the person can see: the shared items of the spaces they can open and their own private ones, never anyone else's private items, and never over everyone.

### Every approach

126 questions, 103 with an answer and 12 that should match nothing (the other 11, about what only others see, have none Ana may get). Recall is the share of a question's answers in the first 5 or 10 lines, MRR the mean of 1 over the line of the first answer. "Stale" counts questions not about the past with something no longer true, or archived, in the first 10 lines, and of those with an answer, how many had it above the answer. `search` shows such lines marked, as the spec allows; `context` leaves them out. The stale counts depend on how ties are ordered: a rerun gave 15 against 12 for `search` and 31 against 27 for BM25, while recall@10 stayed the same and MRR moved by 0.02 at most. Times are the median over all questions, as Ana, of the median of three runs. `search` and `context` are timed over MCP, with the HTTP round trip; the other rows run in process, so BM25's 15 ms compares with the 8 ms of `search`'s queries alone.

| Approach | Recall@5 | Recall@10 | MRR | Says nothing, of 12 | Privacy failures | Stale in the first 10 | ...above the answer | Median ms |
|---|---|---|---|---|---|---|---|---|
| `search`, as on main | 77% | 80% | 0.66 | 0 | 0 | 12 | 3 | 13 |
| `context` without a space, as on main | 78% | 80% | 0.71 | 6 | 0 | 1 | 0 | 15 |
| `search`'s queries alone, in process | 77% | 80% | 0.66 | 0 | 0 | 12 | 3 | 8 |
| context's ranking: telling words, `ts_rank` | 77% | 83% | 0.69 | 6 | 0 | 0 | 0 | 8 |
| `search`, query split as the notes are | 77% | 80% | 0.68 | 0 | 0 | 11 | 3 | 7 |
| BM25, Ana's statistics | 81% | 85% | 0.73 | 0 | 0 | 27 | 4 | 15 |
| BM25, Ana's statistics, common words not candidates | 81% | 85% | 0.73 | 0 | 0 | 28 | 4 | 14 |
| BM25, Ana's statistics, telling words | 78% | 81% | 0.72 | 6 | 0 | 0 | 0 | 13 |
| BM25, Ana's statistics, every word, context's filters | 79% | 81% | 0.70 | 0 | 0 | 0 | 0 | 18 |
| BM25, Ana's statistics, query split as the notes are | 81% | 85% | 0.75 | 0 | 0 | 27 | 4 | 15 |
| BM25, everyone's statistics | 81% | 85% | 0.74 | 0 | 0 | 27 | 4 | not timed |
| Semantic, bge-m3 | 91% | 93% | 0.85 | 0 | 0 | 46 | 3 | 163* |
| `search` + semantic (bge-m3) | 88% | 92% | 0.79 | 0 | 0 | 28 | 3 | 173* |
| BM25 + semantic (bge-m3) | 92% | 93% | 0.83 | 0 | 0 | 37 | 3 | 183* |
| Semantic, text-embedding-3-small | 90% | 93% | 0.82 | 0 | 0 | 31 | 5 | 231* |
| `search` + semantic (3-small) | 85% | 92% | 0.79 | 0 | 0 | 22 | 3 | 237* |
| BM25 + semantic (3-small) | 88% | 92% | 0.83 | 0 | 0 | 30 | 6 | 245* |
| `search`, words by Claude Haiku 5.5 | 92% | 95% | 0.81 | 6 | 0 | 18 | 2 | 11 |
| BM25, words by Claude Haiku 5.5 | 91% | 95% | 0.84 | 6 | 0 | 21 | 3 | 13 |
| `search`, words by GPT-6 Luna | 87% | 90% | 0.75 | 5 | 0 | 23 | 3 | 11 |
| BM25, words by GPT-6 Luna | 90% | 91% | 0.85 | 5 | 0 | 25 | 3 | 15 |

\* Over plain arrays in SQL, not pgvector, without embedding the query; its time doesn't compare with the others. BM25 with everyone's statistics wasn't timed: a shared index would keep them.

### By category

Recall@10 and MRR. "Other language" asks in the language the note isn't in; "Words differ" holds 10 questions in the note's language and 9 in the other.

| Approach | Norwegian (17) | English (16) | Other language (12) | Identifiers (20) | Words differ (19) | Vague (12) | The past (6) |
|---|---|---|---|---|---|---|---|
| `search`, as on main | 91%, 0.80 | 100%, 0.94 | 83%, 0.32 | 100%, 0.89 | 53%, 0.39 | 50%, 0.45 | 67%, 0.67 |
| `context` without a space, as on main | 97%, 0.90 | 100%, 0.91 | 83%, 0.62 | 100%, 0.94 | 47%, 0.47 | 67%, 0.42 | 33%, 0.33 |
| context's ranking: telling words, `ts_rank` | 97%, 0.84 | 100%, 0.94 | 92%, 0.65 | 100%, 0.93 | 63%, 0.40 | 58%, 0.41 | 33%, 0.33 |
| `search`, query split as the notes are | 91%, 0.80 | 100%, 0.94 | 83%, 0.32 | 100%, 1.00 | 53%, 0.39 | 50%, 0.45 | 67%, 0.67 |
| BM25, Ana's statistics | 97%, 0.86 | 100%, 1.00 | 92%, 0.56 | 100%, 0.91 | 58%, 0.40 | 67%, 0.60 | 67%, 0.67 |
| BM25, Ana's statistics, common words not candidates | 97%, 0.86 | 100%, 1.00 | 92%, 0.56 | 100%, 0.91 | 58%, 0.40 | 67%, 0.60 | 67%, 0.67 |
| BM25, Ana's statistics, telling words | 97%, 0.85 | 100%, 1.00 | 92%, 0.67 | 100%, 0.93 | 53%, 0.38 | 58%, 0.52 | 33%, 0.33 |
| BM25, Ana's statistics, every word, context's filters | 97%, 0.89 | 100%, 1.00 | 92%, 0.56 | 100%, 0.91 | 58%, 0.40 | 50%, 0.45 | 33%, 0.33 |
| BM25, Ana's statistics, query split as the notes are | 97%, 0.86 | 100%, 1.00 | 92%, 0.56 | 100%, 1.00 | 58%, 0.40 | 67%, 0.60 | 67%, 0.67 |
| BM25, everyone's statistics | 97%, 0.89 | 100%, 1.00 | 92%, 0.56 | 100%, 0.91 | 58%, 0.40 | 67%, 0.60 | 67%, 0.67 |
| Semantic, bge-m3 | 100%, 0.94 | 100%, 0.94 | 100%, 0.86 | 95%, 0.88 | 100%, 0.92 | 67%, 0.51 | 67%, 0.67 |
| `search` + semantic (bge-m3) | 100%, 0.94 | 100%, 1.00 | 92%, 0.63 | 100%, 0.95 | 95%, 0.59 | 67%, 0.54 | 67%, 0.67 |
| BM25 + semantic (bge-m3) | 100%, 0.97 | 100%, 1.00 | 92%, 0.82 | 100%, 0.95 | 95%, 0.64 | 75%, 0.62 | 67%, 0.67 |
| Semantic, text-embedding-3-small | 100%, 0.97 | 100%, 0.94 | 92%, 0.75 | 95%, 0.83 | 100%, 0.79 | 75%, 0.61 | 67%, 0.67 |
| `search` + semantic (3-small) | 100%, 0.92 | 100%, 1.00 | 92%, 0.63 | 100%, 0.97 | 89%, 0.56 | 75%, 0.57 | 67%, 0.67 |
| BM25 + semantic (3-small) | 100%, 0.97 | 100%, 1.00 | 92%, 0.80 | 100%, 0.97 | 89%, 0.58 | 75%, 0.64 | 67%, 0.67 |
| `search`, words by Claude Haiku 5.5 | 100%, 0.91 | 94%, 0.91 | 100%, 0.83 | 100%, 0.91 | 95%, 0.70 | 83%, 0.59 | 83%, 0.70 |
| BM25, words by Claude Haiku 5.5 | 100%, 1.00 | 94%, 0.88 | 100%, 0.89 | 100%, 0.90 | 95%, 0.76 | 83%, 0.71 | 83%, 0.58 |
| `search`, words by GPT-6 Luna | 100%, 0.85 | 100%, 0.94 | 100%, 0.85 | 100%, 0.88 | 79%, 0.53 | 67%, 0.42 | 67%, 0.68 |
| BM25, words by GPT-6 Luna | 100%, 0.97 | 100%, 0.97 | 92%, 0.92 | 100%, 0.96 | 79%, 0.65 | 83%, 0.71 | 67%, 0.59 |

`context` is low for the past by design: it leaves out what's no longer true and archived pages unless the request names the space. It picked the space the answer is in, or one above it, for 47 of the 97 questions with one, listed it among others for 41, didn't list it for 5, and said nothing matches for 4. It never picked a wrong one.

### Saying that nothing matches

`search` given the whole request finds something for every question. `context` says "Nothing in Homing matches" for 6 of the 12 general questions; the other 6 share words with Ana's notes, such as "DNS", "CMS" or "contract". It also said it for 5 questions with an answer: two about the kitchen asked in English, two about archived pages, and "When's the deadline again?", whose answer has a date but not the word. A threshold on the best score, for approaches without telling words:

| Best score below | Says nothing, of 12 general | ...and of 103 with an answer | ...of them with it in the first 10 |
|---|---|---|---|
| BM25, every word, 4 | 1 | 3 | 0 |
| BM25, every word, 6 | 3 | 4 | 0 |
| BM25, every word, 8 | 7 | 24 | 12 |
| bge-m3, 0.45 | 4 | 0 | 0 |
| bge-m3, 0.5 | 8 | 0 | 0 |
| bge-m3, 0.55 | 12 | 12 | 9 |
| text-embedding-3-small, 0.3 | 6 | 1 | 0 |
| text-embedding-3-small, 0.4 | 10 | 16 | 14 |

### Privacy of statistics

Cara wrote 200 private items, each with three of the 266 longer words Ana's questions use: 120 in Polar Freight, which Ana can't open, and 80 on her own side of the relaunch, which Ana is in. Ana's first ten for each of her 126 questions, with their scores, before and after:

| Ranking | Order changed | Only scores changed | Unchanged |
|---|---|---|---|
| `ts_rank`, as `search` | 0 | 0 | 126 |
| BM25, Ana's statistics | 0 | 0 | 126 |
| BM25, everyone's statistics | 58 | 66 | 2 |

Then Cara wrote 15 items about Bergen in Polar Freight. Ana's search for "Bergen Fjordline" matches two of her notes, one for each word:

| Ranking | Ana's first two before | After |
|---|---|---|
| `ts_rank`, as `search` | Content workshop in Bergen; Gunnar joined Northwind in 2023 from Fjordline. | the same |
| BM25, Ana's statistics | Content workshop in Bergen; Gunnar joined Northwind in 2023 from Fjordline. | the same |
| BM25, everyone's statistics | Content workshop in Bergen; Gunnar joined Northwind in 2023 from Fjordline. | Gunnar joined Northwind in 2023 from Fjordline.; Content workshop in Bergen |

Semantic search and the fused rankings use no statistics across documents, so they reveal nothing this way.

### Latency at scale

Twelve queries as Ana: six whole requests, as `context` gets them, and six sets of keywords, as assistants write them for `search`. The big sample is the one `npm run sample -- big` makes, where Ana sees 31,712 items and 100,050 sources in 101 spaces, timed three times after a warm-up. The synthetic space has 16,000 pages with 176,012 items of about 4 KB, 758 MB of text, a tenth of them Cara's own, and 32,000 sources, timed once after a warm-up for Homing's search, and once without one for BM25, which runs up to minutes. BM25's times there are cold, and a warm run would be somewhat faster.

| Milliseconds | Big sample, median | p95 | Synthetic, median | p95 |
|---|---|---|---|---|
| `search` | 100 | 296 | 2,264 | 2,597 |
| context's ranking, telling words | 70 | 131 | 2,135 | 2,734 |
| `context` in a space, whole request | 28 | 54 | 2,606 | 3,916 |
| BM25, Ana's statistics alone | 268 | 615 | 5,797 | 13,923 |
| BM25, Ana's statistics | 456 | 1,565 | 24,836 | over 30,000 |
| BM25, common words not candidates | 442 | 1,000 | | |
| BM25, telling words | 288 | 545 | 14,466 | 30,053 |

Whole requests cost more than keywords: on the big sample `search` took 288 ms at the median for requests and 59 ms for keywords, BM25 1,115 and 232 ms. A request's "the" or "og" matches nearly every document, and every match is ranked.

**The full-text index isn't used under row-level security.** PostgreSQL won't use an index for a condition that runs before the access policy unless its operator is marked leakproof, and full-text search's `@@` isn't. So every `search` reads every row of the table, the rows Ana can't see too, before the policy filters them. Run without row-level security, with `search`'s own access filters, which return exactly the same for all 12 queries in both databases, a rare word comes back from the index at once:

| Milliseconds, as Ana | Big sample | Synthetic |
|---|---|---|
| "E42", as on main | 28 | 922 |
| "E42", if the index could be used | 3 | 4 |
| "faktura 2026-0417", as on main | 46 | 1,428 |
| "faktura 2026-0417", if the index could be used | 26 | 529 |
| Whole requests, median, as on main | 271 | 2,534 |
| Whole requests, median, if the index could be used | 230 | 2,429 |

The synthetic space is a worst case for the second point: its words are random, so even "budget" or "Gunnar" is in a quarter to two fifths of its documents, and a request matches most of them. Real notes cluster by subject.

### Changed along the way

BM25 that doesn't let words in more than half of the user's documents make candidates was added after the first run, to give BM25 a fair chance at scale, where "the" makes every document a candidate. It changed nothing in the world, where no word is that common. The big sample's first timing came right after it was made, before PostgreSQL had analyzed its tables, when one query took 9.4 s; the times here are from after `ANALYZE`, which the scale command now runs first. After review, the run also checks row-level security against the access rule written out by hand, and stops if the prototype's `ts_rank` ever differs from `search`; both held. The paid calls were timed again with the run's own prompt, through the new `latency` command.

### Limitations

- **One small world, and its author's questions.** 126 questions over one person's notes, written by the same hand as the world, before any approach ran. A difference of two or three questions is noise. Where scores tie, the order follows storage, so a line can move by one between runs.
- **A bilingual user.** The worst misses are English questions about Norwegian notes. Someone who writes and asks in one language would see fewer.
- **Lines, not answers.** An assistant reads every line `search` returns, so an answer on line 15, which recall@10 counts as missed, may still be used. `context` without a space shows only 5.
- **Filler from templates.** The notes around the answers are tidier than real ones. The synthetic space is the opposite: random words, so every everyday word is in a large share of its documents. That makes it a worst case for latency, and it says nothing about ranking.
- **One machine.** Times are from one Mac with a local PostgreSQL 18.6, which other work may have shared at times.
- **Links aren't measured.** The spec's benchmark asks for links plus full-text search, but `search` doesn't use links today, and neither did any approach here.
- **One interpretation per model and question.** Another run would write other words.

### Spending

| Phase | Calls | USD |
|---|---|---|
| Pilot: 109 texts embedded with each model, 18 interpretations | 22 | 0.0018 |
| Full run: 1,909 texts embedded with each model, 234 interpretations | 274 | 0.0255 |
| A first timing of the paid calls, with a shorter prompt, not used | 44 | 0.0016 |
| `latency`: 22 interpretations with the run's prompt and 22 query embeddings | 44 | 0.0021 |
| **Total** | **384** | **0.031** |

The ledger's total went from USD 34.33 to USD 34.36, under the USD 3 set for this benchmark and the cap of USD 50; the key's own usage since the first run went from USD 34.27 to USD 34.30.

## Context without a space, and who a share reaches, 21 October 2026

The harder conversations suggested three changes to Homing's tools, and all three are built:

- `context` without a space now matches only a request's telling words, leaving out words such as "what" or "the" and numbers on their own. When nothing of the user's matches, it says so plainly. Otherwise it lists the spaces that fit with the best matches, each with its space, and the skills whose name or description fits. It picks a space only when the request names it, or when it alone matches and a match there has two of the request's telling words. Its description says so, and its answer points to `context` with a space for the rules that apply there.
- Proposing to share an item answers who will see it: everyone who can open its space, which takes in the spaces above unless it is closed. `act`'s description of knowledge.publish says to share an item where it is.

Each change was measured with a small rerun of the conversations it is for, with the same models and settings, three runs: 198 harder conversations, the 22 tasks of benchmark 1 with the instruction, and the publish task of benchmark 2, for USD 4.87, after a first try of USD 3.59 (below).

### What it means for Homing

**A vague request now finds its answer.** "Should we go with Azure or AWS?" was answered from Northwind's decision in all 9 of GPT's conversations, against none before, when it asked which project. In the scenario of two people, GPT with the new instruction found the relaunch and its new rule 3 times of 3, against 1, and every scenario did every step, with no leaks.

**Skills are found when Homing is asked.** "What's a good structure for a status report?" now leads to Acme's skill: every conversation that called `context` read it and answered with it, 13 of 13, against 3 of 13 before. But the new instruction still keeps Homing out of that question in 5 of 6 conversations, as before, so with it the task was done once.

**Saying that nothing matches costs little, and saves a little.** For 6 of the 14 unrelated questions Homing now answers that nothing matches, and for the others it shows what it found, which models read as unrelated. Only a model that calls Homing for everything still calls it: GPT with the old instruction did for all 42, as before, but stopped after one call. With the new instruction or the tools alone, no model called Homing for them, before or after. The one cost: "When's the deadline again?" matches nothing, since Homing has dates but not the word. With the tools alone, GPT then asked which deadline in all 3 conversations, against 2 of 3 before, and Claude in 1. With the new instruction, GPT answered it 3 times of 3, against 2.

**Matches draw a little more on general questions that share words with Ana's work.** With the tools alone, Claude checked Homing for a typical notice period twice and GPT for a headless CMS once, which they hadn't before. Overall the ambiguous requests were done more often: 27 of 30 against 23 for GPT with the new instruction, and 27 against 22 with the tools alone.

**Shares stay where they are.** Asked to share Gunnar's hint "with everyone on the Northwind team", GPT shared the original 6 times of 6, against 2 of 6 before, when it copied the hint up to Northwind. It copies before it calls `act`, so `act`'s description, not the answer, is what changed this.

**Benchmark 1 is as before, with fewer calls.** With the new `context`, the 20 tasks about Ana's work were done 60 of 60 by both models, and Homing was called for none of the control questions. Claude made 2.4 calls to Homing per conversation instead of 2.8, and GPT 3.0 instead of 3.3, and GPT took 9.5 seconds instead of 12.4.

| Slice | Model | Before | After |
|---|---|---|---|
| azure-or-aws, done, all variants | GPT | 0 of 9 | 9 of 9 |
| report-structure, skill read when Homing was asked | both | 3 of 13 | 13 of 13 |
| report-structure, done, new instruction | Claude, GPT | 0 of 3, 0 of 3 | 1 of 3, 0 of 3 |
| together, Ana's assistant got the new rule, new instruction | GPT | 1 of 3 | 3 of 3 |
| together, every step, all variants | both | 16 of 18 | 18 of 18 |
| together, leaks | both | 0 | 0 |
| Ambiguous requests done, new instruction | Claude, GPT | 27, 23 of 30 | 28, 27 of 30 |
| Ambiguous requests done, tools alone | Claude, GPT | 27, 22 of 30 | 29, 27 of 30 |
| Left alone when it can't help, ambiguous, tools alone | Claude, GPT | 12, 6 of 12 | 10, 5 of 12 |
| deadline, done, tools alone | Claude, GPT | 3, 1 of 3 | 2, 0 of 3 |
| Unrelated questions, Homing called, old instruction | Claude, GPT | 6, 42 of 42 | 9, 42 of 42 |
| …calls to Homing | Claude, GPT | 6, 44 | 9, 42 |
| Benchmark 1, tasks done, new instruction | Claude, GPT | 100%, 98% | 100%, 100% |
| …calls to Homing per conversation | Claude, GPT | 2.8, 3.3 | 2.4, 3.0 |
| publish (benchmark 2), done | GPT | 2 of 6 | 6 of 6 |
| …copies of the hint | GPT | 4 | 0 |

### Changed along the way

The first try showed the matches the same way, but its answer didn't point to `context` with a space for the rules. In the scenario of two people, Claude with the tools alone then answered Ana from a matching page, without the relaunch's context, and missed the new rule 2 times of 3. The answer now says to call `context` with the space for the rules that apply there, and the slices that depend on it, the ambiguous requests and the scenario, were run again. The unrelated questions come from the first try: for 6 of them the answer is the same, and for the others it differs only by those words. Showing the rules that match beside the knowledge was tried and dropped: they matched unrelated questions too, such as "Keep answers short" for undoing a git commit. A run limit set too low for six conversations at once stopped two runs early, and they were finished one or two at a time. After these runs, a review changed a few things models could see, which no prompt here touches, so the numbers stand: Norwegian stopwords are left out as well as English ones, numbers of four digits or more, such as an invoice number or a year, count again, what's in an archived space is left out unless the request names it, a skill that fits is never next to "Nothing in Homing matches", and who a share reaches is worded as the decision page words it.

### Spending

| Phase | Conversations | USD |
|---|---|---|
| First try: ambiguous, unrelated and together | 450 | 3.59 |
| Ambiguous and together, final | 198 | 3.07 |
| Unrelated, final, with the old instruction, stopped early | 12 | 0.05 |
| Benchmark 1 with the new instruction | 132 | 1.53 |
| publish, benchmark 2 | 12 | 0.22 |
| **Total** | | **8.46** |

The ledger's total is now USD 34.33, under the USD 35 set for this phase and the cap of USD 50; the key's own usage since the first run is USD 34.25.

## Harder conversations and a new instruction, 21 October 2026

The recommended instruction began with "At the start of a task, call `context` with the user's request", and in the first run it pulled Homing into 9 of 12 control questions, against 1 of 12 without it. That line is now two:

> - Use Homing for requests about the user's own work and life, such as their clients, projects, colleagues, rules and tasks, and for what they want kept. Leave it out of requests that need nothing of theirs, such as general questions, calculations, translations or changes to text already in the conversation, and of what another tool is for, such as their calendar, email or the web.
> - For a request about their work, call `context` first with the user's request. It picks the space when the request makes that clear, and otherwise lists the candidates. Later in the conversation, call it again when the subject changes.

The rest of Homing's MCP instructions is unchanged. Benchmark 1's harder conversations compare it with the old instruction and with the tools alone: 41 conversations, with four other tools beside Homing's, in which 27 things the user says are labeled as helped by Homing, 30 as not, and 2 as either. Both models did each three times in each variant: 738 conversations, for USD 7.84. Benchmark 1 itself ran again with the new instruction: 132 conversations, for USD 1.54. Smoke and pilot runs came first, for USD 1.97.

### What it means for Homing

**The new instruction keeps Homing to the user's work, and still uses it there.** The old one made Claude call Homing for 37% of the things it can't help with, and GPT for all of them: every one of the 14 unrelated questions, every request for the calendar, the inbox, the web and the notes app, and every follow-up such as "Make it a bit more formal". The new one left Homing out of 93% and 94% of them, and used it for 98% and 96% of the things it helps with. On benchmark 1's 20 tasks about Ana's work it asked Homing in every conversation and did 100% and 98% of them, as before, and called Homing for none of the 12 control questions, against 1 and 6 of 6 with the old instruction in the rerun.

| Variant | Model | Used when it helps | Left alone otherwise | Precision | Task done |
|---|---|---|---|---|---|
| mcp-only | claude-sonnet-5.5 | 100% | 93% | 93% | 98% |
| mcp-only | gpt-6.1-sol | 100% | 79% | 81% | 93% |
| old instruction | claude-sonnet-5.5 | 100% | 63% | 71% | 100% |
| old instruction | gpt-6.1-sol | 100% | 0% | 47% | 94% |
| new instruction | claude-sonnet-5.5 | 98% | 93% | 93% | 97% |
| new instruction | gpt-6.1-sol | 96% | 94% | 94% | 92% |

**With the tools alone, Claude did as well; GPT didn't.** Claude used Homing when it helped and left it alone 93% of the time without any instruction, the same as with the new one. GPT, with the tools alone, also checked Homing for general questions that sound like work, such as what a DNS TTL does, and for what belongs to another tool, such as whether Gunnar answered an email: it left Homing alone 79% of the time. The new instruction brings it to 94%. So the instruction's worth is in saying when Homing helps, not in making assistants call it more: without it, both already called Homing for everything about Ana's work. The spec (§10) now says so.

**Other tools.** Every request that belongs to the calendar, the inbox, the web or the notes app used that tool, in every variant, and the ones that need both, such as preparing for tomorrow's 13:00 meeting, used both. What differs is whether Homing was called as well: with the old instruction, GPT called it for all 18 of the others' requests and Claude for 15; with the new one, 2 and 3, all to ask whether Gunnar had answered, where GPT went on to mark Ana's task to send him the timeline as done, which arguably helps.

**Several turns.** In conversations of three turns, every variant used Homing in every turn that needed it, including changing a reminder from Friday to Monday, which moved the task instead of adding a second one, 18 times of 18. The difference is the turns between: with the old instruction, GPT called `context` again for "Make it a bit more formal" and for an aside about DNS, every time. With the new one and with the tools alone, the only turn they called it for needlessly was the first of a birthday message for Ana's sister, which every variant did: it is Ana's life, though Homing knows nothing about Ingrid.

**What it gets wrong.** One case: "What's a good structure for a status report?" Acme has a skill for exactly that. With the new instruction, the question read as general, and 5 of 6 conversations left Homing out. With the old one both models called Homing, but only Claude went on to find the skill, 3 times of 3; `context` without a space lists spaces, not skills. It is the price of the new line, and a reason for Homing to make skills easier to find (below).

**Two people together: no leaks.** In 18 scenarios, 3 variants with both models three times, Ana's and Cara's assistants worked in Website relaunch over four conversations each. Everything Homing answered to their 339 calls, everything the models wrote, and the harness's own reads were checked word for word against everything private to the other person: none had any of it. In all 18, Ana's assistant proposed sharing Mona's condition and kept her worry private, Cara's assistant found the shared condition and kept her own note private, the page about Mona read differently for each of them, and Cara's rule request reached Ana and, once she approved it, applied to both. The one step that failed: in a new conversation, GPT with the new instruction asked Ana which site she meant, 2 times of 3, instead of finding the relaunch, where the new rule was.

**Where Homing falls short: a request that doesn't name its space.** For a vague request, `context` without a space lists the spaces that fit and nothing more. Claude then searches; GPT asks the user. "Should we go with Azure or AWS?" was answered from Northwind's decision in all 9 of Claude's conversations and none of GPT's, which asked which project, in every variant. The same made GPT ask which deadline Ana meant, and which site in the scenario above. A real user would answer, so this costs a turn rather than the task, but `context` could show what it found. It also lists spaces as fitting when nothing does: for "Why is the sky blue?", four.

**Cost and time.** With GPT, the new instruction costs about a third less than the old one, close to the tools alone: 2.1 calls to Homing and USD 0.0079 per conversation, against 3.3 and 0.0115, and 10.5 against 14.1 seconds. With Claude it costs about what the tools alone do.

#### Worth deciding

Suggestions for Homing's tools, from these results and the rerun's. All three were built since, and measured above.

1. `context` without a space could show the few best matches, with their spaces, as `search` does, so a model answers "Should we go with Azure or AWS?" instead of asking which project; and say so when nothing matches, instead of listing spaces that fit.
2. `context` without a space could also list the skills that match the request, as `search` does, so "a good structure for a status report" leads to Acme's.
3. `knowledge.publish` could say who sharing reaches, such as everyone in Northwind for an item in Website relaunch, which isn't closed. GPT copied Gunnar's hint up to Northwind to share it there (rerun, below).

### Benchmark 1, harder conversations

In the tables, a rate is over all three runs, with the lowest and highest single run in brackets. Rates about Homing's use count the things the user said, a turn at a time; task done counts conversations.

| Variant | Model | Used when it helps | Left alone otherwise | Precision | Task done | Other tool used | Homing calls | Model calls | Tokens in / out | Latency | Cost each | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mcp-only | claude-sonnet-5.5 | 100% (100–100) | 93% (93–93) | 93% (93–93) | 98% (98–98) | 100% (100–100) | 1.6 | 2.9 | 25,273 / 557 | 7.5 s (4.7) | $0.0117 | $1.43 |
| mcp-only | gpt-6.1-sol | 100% (100–100) | 79% (77–80) | 81% (79–82) | 93% (93–95) | 100% (100–100) | 1.9 | 3.3 | 17,689 / 228 | 10.3 s (6.5) | $0.0072 | $0.88 |
| old-instruction | claude-sonnet-5.5 | 100% (100–100) | 63% (60–67) | 71% (69–73) | 100% (100–100) | 100% (100–100) | 2.1 | 3.1 | 29,608 / 601 | 8.4 s (5.4) | $0.0133 | $1.63 |
| old-instruction | gpt-6.1-sol | 100% (100–100) | 0% (0–0) | 47% (47–47) | 94% (93–95) | 100% (100–100) | 3.3 | 4.6 | 29,431 / 329 | 14.1 s (9.4) | $0.0115 | $1.42 |
| instruction | claude-sonnet-5.5 | 98% (96–100) | 93% (93–93) | 93% (93–93) | 97% (95–98) | 100% (100–100) | 1.6 | 2.9 | 27,813 / 583 | 7.9 s (5.2) | $0.0123 | $1.51 |
| instruction | gpt-6.1-sol | 96% (96–96) | 94% (93–97) | 94% (93–96) | 92% (90–93) | 100% (100–100) | 2.1 | 3.5 | 20,857 / 263 | 10.5 s (5.9) | $0.0079 | $0.97 |

Left alone otherwise, by kind of conversation:

| Kind | mcp-only, claude-sonnet-5.5 | mcp-only, gpt-6.1-sol | old-instruction, claude-sonnet-5.5 | old-instruction, gpt-6.1-sol | instruction, claude-sonnet-5.5 | instruction, gpt-6.1-sol |
|---|---|---|---|---|---|---|
| ambiguous | 100% | 50% | 25% | 0% | 100% | 100% |
| unrelated | 100% | 100% | 86% | 0% | 100% | 100% |
| multi-turn | 83% | 83% | 83% | 0% | 83% | 83% |
| competing | 83% | 44% | 17% | 0% | 83% | 89% |

Used when it helps was 100% for every kind and variant, except ambiguous requests with the new instruction: 89% for Claude and 83% for GPT, all of it report-structure.

Per task, the conversations that did it, where any variant missed one:

| Task | mcp-only, claude-sonnet-5.5 | mcp-only, gpt-6.1-sol | old-instruction, claude-sonnet-5.5 | old-instruction, gpt-6.1-sol | instruction, claude-sonnet-5.5 | instruction, gpt-6.1-sol |
|---|---|---|---|---|---|---|
| deadline | 3/3 | 1/3 | 3/3 | 2/3 | 3/3 | 2/3 |
| report-structure | 0/3 | 0/3 | 3/3 | 0/3 | 0/3 | 0/3 |
| azure-or-aws | 3/3 | 0/3 | 3/3 | 0/3 | 3/3 | 0/3 |
| budget-math | 3/3 | 3/3 | 3/3 | 3/3 | 2/3 | 2/3 |
| together | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | 1/3 |

Every other task was done in every conversation. The misses in deadline, azure-or-aws and together were questions back, such as which project Ana meant, and report-structure's were general advice without Acme's skill. budget-math's two were the checks' fault: one answer said the hint was more than 67,500, which is right, where the check only took "less", and one kept the wish as a task to ask Gunnar, where the check only took a note. The checks now take both, and both conversations pass with them; the tables count them as the run did.

Two people's assistants together, scenarios with each step done, of 3:

| Step | mcp-only, claude-sonnet-5.5 | mcp-only, gpt-6.1-sol | old-instruction, claude-sonnet-5.5 | old-instruction, gpt-6.1-sol | instruction, claude-sonnet-5.5 | instruction, gpt-6.1-sol |
|---|---|---|---|---|---|---|
| Ana's assistant proposed sharing Mona's condition, and Ana approved it | 3 | 3 | 3 | 3 | 3 | 3 |
| Ana's assistant kept her worry private, and didn't propose sharing it | 3 | 3 | 3 | 3 | 3 | 3 |
| Cara's assistant kept her note private, and didn't propose sharing it | 3 | 3 | 3 | 3 | 3 | 3 |
| Cara's assistant asked for the rule for everyone, as a request | 3 | 3 | 3 | 3 | 3 | 3 |
| Cara sent it, and it reached Ana, the space's admin | 3 | 3 | 3 | 3 | 3 | 3 |
| Ana approved it, and it applies to both | 3 | 3 | 3 | 3 | 3 | 3 |
| Ana's assistant got the new rule | 3 | 3 | 3 | 3 | 3 | 1 |
| The page about Mona reads differently for each | 3 | 3 | 3 | 3 | 3 | 3 |
| Leaks | 0 | 0 | 0 | 0 | 0 | 0 |

### Benchmark 1 with the new instruction

The 20 tasks about Ana's work and the 2 control questions, three times, beside the rerun's results with the old instruction.

| Instruction | Model | Asked Homing | Task done | Homing on controls | Homing calls | Tokens in / out | Latency | Cost each |
|---|---|---|---|---|---|---|---|---|
| old (rerun) | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 1/6 | 2.9 | 27,366 / 520 | 7.9 s (7.4) | $0.0139 |
| old (rerun) | gpt-6.1-sol | 100% (100–100) | 98% (95–100) | 6/6 | 3.5 | 23,313 / 250 | 12.0 s (10.9) | $0.0100 |
| new | claude-sonnet-5.5 | 100% (100–100) | 100% (100–100) | 0/6 | 2.8 | 27,054 / 488 | 7.3 s (6.6) | $0.0136 |
| new | gpt-6.1-sol | 100% (100–100) | 98% (95–100) | 0/6 | 3.3 | 22,713 / 245 | 12.4 s (10.6) | $0.0097 |

Every task was done in every conversation but one, report-format by GPT, whose answer left out that reports are in English, as in the rerun. Every request for a new rule was proposed with `act`.

### Changed along the way

The smoke run found a fault in the harness: the scenario of two people looked for the approved rule in the whole database, where other scenarios ran at the same time, instead of in its own world. It now looks in its own spaces, and a private task counts as a private note, as one model kept Cara's. After the pilot, deadline also counts as done when the answer asks which deadline with Ana's own candidates, which only Homing knows, and email-draft's first turn needs two of Gunnar, the two weeks and the go-live date, instead of the date alone. After the full run, budget-math's checks were made to take either way of comparing and a task as well as a note, above. None of these changes touches whether Homing was used.

### Limitations

The first run's limitations, below, hold here too. Besides those:

- **The labels are judgment.** Whether Homing helps is a call made for each turn when the conversation was written, and some could go either way: Homing knows nothing of Ana's sister, but it is Ana's life, and checking whether Gunnar replied could start from the timeline he was sent. The README lists every label.
- **Scripted users aren't people.** They say the same thing whatever the assistant answered, and never answer a question back, which turns "Which project do you mean?" into a failure a real user would fix with one more turn.
- **Four stand-ins aren't the apps' tools.** The other tools answer from canned data, and Claude.ai and ChatGPT offer more of them, with their own descriptions, memory and system prompts.
- **One scenario for two people.** Ana's and Cara's assistants worked in one space, on one subject, over four conversations each. The leak check is word for word: it would miss a paraphrase of something private. But a model can only pass on what Homing gave it, and every answer Homing gave was checked.

### Spending

| Phase | Conversations | USD |
|---|---|---|
| Smoke run, harder conversations | 15, stopped at its limit | 0.58 |
| Pilot, harder conversations | 72 | 1.40 |
| Harder conversations | 738 | 7.84 |
| Benchmark 1 with the new instruction | 132 | 1.54 |
| **Total** | | **11.36** |

Each run had a limit of its own, USD 16 for the harder conversations, to keep the ledger's total under USD 45. The ledger's total is now USD 25.86 over the benchmarks so far, against the cap of USD 50; the key's own usage since the first run is USD 25.80.

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

- **The instruction still pulls Homing into unrelated questions.** With it, GPT called Homing for both control questions every time, 6 of 6, as in the first run, and Claude 1 of 6, against 3 before. Without it, neither did. Its first line, "At the start of a task, call `context`", is what the new instruction, above, replaces.
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
