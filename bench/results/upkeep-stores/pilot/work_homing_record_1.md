===== 2026-11-02 Commerce platform analysis, session 1 (record) =====
# 2026-11-02 Commerce platform analysis, session 1

Session 1 of the commerce platform analysis for Northwind's spare parts shop. Brief: page:1b3accdd-82db-4719-b46f-a79c1a1d621d

## What we worked on
- Set up the research brief: question, goals, constraints, criteria, options A (Butikkskyen), B (Composa), C (Fram CMS commerce module), findings F1–F5 with sources, open questions.

## Decisions and why
- The brief uses the five criteria agreed at the kickoff (time to market, cost over three years, fit with Dynamics 365, ease of use for marketing, design flexibility), because they were agreed with Northwind.
- All three options are assessed on the same evidence and criteria. The early readings in the brief are hypotheses to test, not conclusions.
- The brief is kept on Ana's private side for now. Nothing is shared yet.

## Still open
- Weights for the criteria. Speed to market matters most to Gunnar, but nothing is agreed.
- Dynamics 365 connector and near-real-time customer-specific prices per option.
- Fixed build price and yearly-terminable licences per option.
- Three-year cost and realistic time to launch per option, against 1 September 2027.
- Whether marketing can manage shop content in the website's tool with A and B.
- Part-number search and quick reorder support.
- Whether the CMS vendor's API limit (10 requests a second) affects option C. It's unclear if that is the same vendor as Fram.
- Missing sources: vendor demos or quotes, reference customers, an interview with marketing.

## Next steps
- Ask Composa for a second reference customer (task:027669de-7ded-4b02-9679-b41446cedf22).
- Settle the criteria weights.
- Gather vendor information on the open questions, then add a scoring table to the brief.
- Decide what to bring to the steering group meeting on 11 November, before the December recommendation.

===== Research brief: commerce platform for Northwind spare parts shop =====
# Research brief: commerce platform for Northwind spare parts shop

## Question
Which commerce platform should Northwind use for its new spare parts shop? Recommendation to the steering group in December 2026; owner Ana Berg, sponsor Gunnar Holm. Private working brief; nothing shared.

## Goals
- Sell about 4,000 spare parts to dealers and workshops; live by 1 September 2027 [F1].
- Speed matters most to Gunnar; marketing manages shop content in the website's tool; workshops reorder in a few clicks [F2].

## Constraints
- First-year budget 2.5M NOK, including licences and build; customer-specific prices [F1].
- Dynamics 365 holds prices and stock, which every option must read in near real time. Integration team: two people [F1, F3].
- Fixed build price and licences terminable yearly [F4].
- Northwind prices only through procurement portal, never email. Do not name Northwind in documents for other clients.

## Current criteria — revised 9 November 2026
1. Time to market
2. Cost over three years
3. Fit with Dynamics 365
4. Ease of use for marketing

Gunnar said design flexibility does not matter; Ana instructed its removal on 9 November (item:a55ebfa5-d1da-4caa-bb9b-9e616664b29e). F1 records the original five kickoff criteria, not the current set. Weights remain unagreed. Customer-service impact is a requested separate section, not an agreed scoring criterion (item:1c620dee-9d04-45d9-bdf7-cf431c3faece).

## Options
A. Butikkskyen: SaaS shop platform.
B. Composa: headless commerce engine with its own frontend.
C. Fram CMS commerce module: Fram runs Northwind's new website.

## Original findings and sources
| Ref | Finding | Source |
|---|---|---|
| F1 | ~4,000 parts; dealers/workshops; live 1 Sep 2027; customer-specific prices; Dynamics 365 holds prices/stock; year-one budget 2.5M NOK incl. licences/build; originally five criteria | Kickoff notes, 28 Oct 2026 (Ana) |
| F2 | Speed matters most; same content tool as website; quick reorder | Gunnar Holm interview, 29 Oct |
| F3 | Near-real-time Dynamics prices/stock required for all options; two-person integration team | Ola Nordmann interview, 29 Oct |
| F4 | Fixed build price; yearly-terminable licences | Lise Berg procurement interview, 30 Oct |
| F5 | Dealers mostly order by part number; 70% of orders currently email/phone | Cara's market note, 30 Oct |

F6–F10 vendor/reference evidence is retained on this page. Early hypotheses: C may fit content needs; custom integration may burden B; procurement terms need checking; part-number search and quick order matter more than browsing. These are not conclusions.

## Open questions
- Weights for the four current criteria.
- Dynamics connector and build/run cost per option; near-real-time customer-specific prices and stock. Ola checks Composa integration during 9–15 Nov; findings pending (item:460281ee-9a37-4aca-93b1-19e1f3ae3349).
- Fixed build offers and yearly licence termination rights for each vendor.
- Full three-year costs, including hosting and integration upkeep; clarify quote inclusions.
- Realistic launch schedules against 1 Sep 2027, given website launch 1 Mar 2027.
- Whether A/B let marketing manage shop content in Fram.
- Part-number search, quick reorder and customer-specific catalogues.
- Azure hosting compatibility.
- Whether CMS vendor's 10 requests/second API limit applies to Fram/option C; vendor identity remains unclear.
- Who needs results before December; next steering group 11 Nov.
- Further vendor demos, references and marketing interview.
- Customer-service implications per option: Gunnar requested a short section first at the next analysis session.

Ana leans toward Composa but worries about integration; this is a tentative preference, not a selection (item:a7ef3336-002b-4bb5-b04e-09fd0a4fbb5f).

## Comparison — 9 November 2026, revised after Gunnar call

Four current criteria: design flexibility removed at Gunnar's request (item:a55ebfa5-d1da-4caa-bb9b-9e616664b29e). Weights remain unagreed; no weighted score or final selection. Unknowns do not imply poor performance.

| Criterion | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
|---|---|---|---|
| Time to market | Reference launched in four months [F9]; included Dynamics connector may reduce effort [F6]. Not a Northwind delivery promise. | Reference launched after nine months, with integration overrun [F10]; no standard Dynamics connector [F7]. A comparable December start leaves little buffer before 1 Sep 2027. | No delivery-duration evidence. CMS continuity may simplify content work but does not establish schedule [F8]. |
| Cost over three years | Build 0.9M + 3 × 0.6M annual licence = **2.7M NOK** [F6]. | Build 1.8M (frontend included) + 3 × 0.9M annual licence = **4.5M NOK** [F7]. | Build 1.2M + 3 × 0.3M annual commerce module = **2.1M NOK** [F8]. Module pricing, not confirmed whole-platform cost. |
| Fit with Dynamics 365 | Standard connector and B2B Pricing app included [F6]. Reference confirms customer-specific prices but needed workarounds above 2,000 price lists [F9]. Near-real-time price/stock unverified. Northwind's 4,000 parts is not its number of price lists. | API integration, no standard connector [F7]; reference integration delays [F10]. Apparent higher implementation/maintenance burden for two-person team [F3], not a measured estimate. Near-real-time customer-specific prices/stock unverified. Ola checks integration during 9–15 Nov; findings pending. | Connector, integration effort and near-real-time customer-specific prices/stock unknown. F8 does not address them. |
| Ease of use for marketing | Same-tool content management in Fram unconfirmed; no marketing usability evidence [F2, F6]. | Same-tool content management in Fram unconfirmed; included frontend does not prove editorial integration/usability [F2, F7]. | Marketing stays in Fram [F8], matching same-tool requirement [F2]. Workflow quality still needs validation. |

### Constraints and caveats
- First-year budget is 2.5M NOK [F1]. Build + annual licence/module subtotals: A **1.5M**, B **2.7M**, C **1.5M** [F6–F8]. B exceeds budget by **0.2M** on these components; A/C fit on these components only.
- These are indicative component calculations, not full TCO or fixed-price offers. Reconcile hosting, integration build/upkeep, support, apps, base Fram fees, price changes and VAT treatment against quote inclusions; do not assume exclusion or double-count.
- No option has fully validated near-real-time customer-specific prices/stock. A needs scale/latency testing; B/C need solution evidence [F1, F3].
- Approximate builds do not establish fixed prices, and annual fee quotes do not establish yearly termination [F4].
- Single-reference durations are not comparable bids or delivery commitments. Validate scope, staffing, dependencies and start dates against 1 Sep 2027.
- Part-number search, quick reorder, Azure compatibility and whether the CMS API limit applies to Fram remain unresolved.

### Provisional reading
A has strongest current evidence on speed and Dynamics integration, subject to pricing-scale and near-real-time validation. C has lowest quoted-component cost and best same-tool marketing fit but major integration/delivery gaps. B exceeds the quoted-component first-year budget and has schedule/integration concerns. F10's flexibility observation remains source evidence but is no longer an evaluation advantage under the current criteria. Ana's tentative preference for Composa is recorded separately, not treated as proof of superiority or a selection.

### Sources
F1–F5: original kickoff/interview/market evidence in the research brief (original record item:ebbaa78c-16d6-4470-bdf4-42200069d87c).
F6: Butikkskyen quote, 3 Nov 2026 — source:b1fa2532-8df8-4437-a660-8245f6f708bf.
F7: Composa quote, 4 Nov — source:dbe8813a-62a6-4212-9811-20be9b4bd6a8.
F8: Fram CMS, 4 Nov — source:542e95e9-f0e2-4db3-894a-181acd4f4555.
F9: Agder Maskin reference, 5 Nov — source:62ce0c14-968e-4229-aec1-251a7d246701.
F10: Vestlandsdeler reference, 6 Nov — source:1b33f9cb-336a-499c-b06e-3a73bd75e683.
Criteria change: Gunnar call reported by Ana, 9 Nov — item:a55ebfa5-d1da-4caa-bb9b-9e616664b29e.

On 9 November 2026, Ana reported that Gunnar said design flexibility does not matter for Northwind and instructed that it be dropped as an evaluation criterion. The current criteria are time to market, cost over three years, fit with Dynamics 365, and ease of use for marketing. Weights remain unagreed.

As of 9 November 2026, Ana leans toward Composa but is concerned about its integration. This is a tentative preference, not a platform selection or a change to the evidence-based assessment.

Ola will check Composa's integration during the week of 9–15 November 2026, as reported by Ana on 9 November. Findings are pending.

Gunnar requested a short section explaining what each platform option means for Northwind's customer service team, to be added first at the next analysis session, as reported by Ana on 9 November 2026. This is a requested analysis section, not an agreed replacement scoring criterion.

===== 2026-11-09 Commerce platform analysis, session 2 (record) =====
# 2026-11-09 Commerce platform analysis, session 2

Session 2 — 9 November 2026. Private record; nothing shared.
Brief: page:1b3accdd-82db-4719-b46f-a79c1a1d621d. Current brief: item:5d7d885d-d6f1-4510-b6a7-6db2227baee0. Sourced comparison: item:5769fcf2-8979-46fe-88d5-dc0b21f0941f.

## What we worked on
- Added F6–F10: quotes from Butikkskyen, Composa and Fram (3–4 Nov), and reference calls with Agder Maskin and Vestlandsdeler (5–6 Nov).
- Compared all three options against the brief, with sources and explicit evidence gaps. Indicative three-year build + licence/module totals: Butikkskyen 2.7M, Composa 4.5M, Fram 2.1M NOK—not full TCO. Composa's first-year quoted subtotal is 2.7M, 0.2M over budget.

## What we decided and why
- Removed design flexibility because Gunnar said it does not matter for Northwind. Four criteria remain: time to market, three-year cost, Dynamics 365 fit, marketing usability (item:a55ebfa5-d1da-4caa-bb9b-9e616664b29e).
- Recorded Gunnar's request to start the next analysis session with a short customer-service impact section for each option. This is a separate section, not a replacement scoring criterion (item:1c620dee-9d04-45d9-bdf7-cf431c3faece).
- No platform selected. Ana tentatively favours Composa but worries about integration; preference is separate from evidence (item:a7ef3336-002b-4bb5-b04e-09fd0a4fbb5f). Butikkskyen currently has strongest speed/integration evidence; Fram lowest quoted-component cost and best marketing continuity.

## Still open
- Criterion weights; customer-service impacts; full TCO and quote scope; fixed build prices and yearly termination rights.
- Near-real-time customer-specific prices/stock for every option. Butikkskyen reference needed workarounds above 2,000 price lists—not 2,000 parts. Composa has no standard Dynamics connector and a reference integration overrun. Fram integration and schedule remain unknown.
- Credible delivery plans for 1 Sep 2027; A/B content workflows in Fram; part-number search/quick reorder; Azure compatibility; whether the CMS API limit applies to Fram; further demos/references and marketing validation.
- Proposed next-session instruction remains pending user approval, not an active rule: proposal:0e0678ef-b411-4399-b97b-d3b3546f2a3e (status checked at session close).

## Next steps
1. Next-session starting point requested by Gunnar: short customer-service implications section for all three options, distinguishing evidence from hypotheses.
2. Ola checks Composa integration during the week of 9–15 Nov (item:460281ee-9a37-4aca-93b1-19e1f3ae3349); Ana's follow-up is saved for 13 Nov: task:d5a2ab2d-3b8a-44ec-98d7-ef9dbebbd644.
3. Existing follow-up: ask Composa for a second reference customer (task:027669de-7ded-4b02-9679-b41446cedf22).
4. Carry forward: agree weights, resolve evidence/constraint gaps, then score the four criteria; decide what to take to the 11 Nov steering group before the December recommendation.

Approval link for the next-session instruction: http://localhost:4480/proposals/0e0678ef-b411-4399-b97b-d3b3546f2a3e.
