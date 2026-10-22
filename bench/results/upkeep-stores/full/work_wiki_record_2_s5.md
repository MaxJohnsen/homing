===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work includes the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

## Spare parts shop

A separate [commerce platform research brief](spare-parts-commerce.md) tracks the choice between Butikkskyen (A) and Composa (B). Fram CMS commerce was dropped on 16 November because support ends in 2028 [G2]. Gunnar wants a recommendation for the steering group in December 2026; the shop must be live by 1 September 2027. As of 23 November the first-year budget is **2.0 M NOK** (cut from 2.5 M) [F18]. Butikkskyen's partner Kodeverket offers a fixed-price build at 1.1 M NOK until 15 December [F17], giving a known first year of 1.55 M; Composa's known first year is 3.5 M, 1.5 M over budget. Northwind has 3,100 customer-specific price lists [F15]; Butikkskyen says its v4 pricing app handles 10,000 [F16]. Customer service takes about 300 calls a week on order status and prices and wants customers to see order status themselves [F14]. The draft recommendation prefers Butikkskyen subject to validation and advises against Composa; no final selection and no numeric scores.

## Sources

- [F14]–[F18] Hanne Ruud 17 Nov; Ola Nordmann 18 Nov; Butikkskyen 19 Nov; Lise Berg 19 Nov; Gunnar Holm 20 Nov 2026; supplied by Ana on 23 November. Details in the research brief.
- [G2] Ana, 16 November 2026: Gunnar agreed to drop Fram commerce because support ends in 2028.
- [S1] Ana's research setup request, 2 November 2026.


===== log.md (record) =====
# Log

- 2026-11-30: Added F19 and a short Composa nightly-import alternative to acme/northwind/spare-parts-commerce.md. At 200,000 instead of 800,000 for integration, known costs become 2.9 M first year / 4.7 M three years, still 900,000 over budget. Recorded that nightly freshness fails the current near-real-time requirement; timing and order-status coverage remain unknown. Main comparison and conditional recommendation unchanged.

- 2026-11-23: Finalised personal/northwind-commerce-session-2026-11-23.md as the end-of-session record (work, decisions and why, open items, next steps); updated index description.

- 2026-11-23: At Ana's request, added to the risks slide (10) of the steering group outline that the B2B Pricing app is a third-party dependency; other slides unchanged.

- 2026-11-23: Created acme/northwind/steering-group-presentation-outline.md (10 slides, from the brief's recommendation incl. F14–F18); indexed it.

- 2026-11-23: Added F14–F18 to acme/northwind/spare-parts-commerce.md (rewritten): budget now 2.0 M [F18, supersedes F1's 2.5 M], A's build fixed at 1.1 M to 15 December [F17], 3,100 price lists and v4 capacity claim [F15, F16], customer-service evidence and order-status requirement [F14]. Recalculated costs (A 1.55 M / 2.45 M; B 3.5 M / 5.3 M), comparison and draft recommendation; added the requested April 2027 go-live scenario line. Created personal/northwind-commerce-session-2026-11-23.md; updated overview, index and the 16 November record's status.

- 2026-11-16: Finalised personal/northwind-commerce-session-2026-11-16.md as a concise end-of-session handoff: work completed, decided Fram exclusion versus draft A/B recommendation, rationale, open questions and ordered next steps. Preserved the pending April-2027 scenario line as the first task next session and the second-reference reminder; updated index description.

- 2026-11-16: Recorded Gunnar's agreed exclusion of Fram commerce because support ends in 2028 [G2] in acme/northwind/spare-parts-commerce.md; updated active options, recommendation wording and follow-up tasks, retaining C's comparison as history and closing its research tasks. Updated overview and index; saved Ana's next-session task in the brief and session handoff: add an indicative Butikkskyen go-live line using four months from a December decision, with scenario/not-commitment caveats. Recommendation line deferred as requested; A remains draft preferred, not finally selected.

- 2026-11-16: At Ana's request, reassessed B in acme/northwind/spare-parts-commerce.md and drafted the December recommendation: prefer A subject to ERP, commercial, delivery and workflow validation; do not proceed with B/C on current proposals. Added B's cost deltas, budget-overrun sensitivity and schedule reasoning; retained F12 pricing and F13 lifecycle caveats without invented scores. Updated overview, index and the 16 November session handoff to reflect draft recommendation status.

- 2026-11-16: Updated acme/northwind/spare-parts-commerce.md with F11–F13, corrected one-store pricing and cost totals, Composa's custom integration cost/sequencing, Fram's December 2028 commerce support end and lifecycle caveats, a provisional customer-service section and revised follow-up priorities; no formal scores or final selection. Updated Northwind overview and index (including the stale five-criteria descriptions); overview source details point to the brief. Created a 16 November continuation record and linked it as the latest handoff.

- 2026-11-09: Updated acme/northwind/spare-parts-commerce.md with F6–F10 (quotes from Butikkskyen, Composa, Fram; reference calls), a cost table and a comparison against the five criteria; renamed the old local source label F6 to S1 to avoid a clash; updated the open questions. Updated acme/northwind/overview.md and index.md to match.
- 2026-11-09: Completed personal/northwind-commerce-session-2026-11-09.md (work done, decisions and why, evidence summary, open items, next steps) at the end of the session.
- 2026-11-09: Dropped design flexibility as a criterion in acme/northwind/spare-parts-commerce.md (per Gunnar, via Ana), added customer service as a first item for next session and Ola's Composa integration check; created personal/northwind-commerce-session-2026-11-09.md and updated index.md.
- 2026-11-02: Created personal/northwind-commerce-session-2026-11-02.md with the session handoff and a link to the separate private reminder.
- 2026-11-02: Added the session handoff to index.md as the starting point for next time.

- 2026-11-02: Created personal/northwind-commerce-reminder.md for Ana's private next-session follow-up; research brief unchanged.
- 2026-11-02: Indexed the private follow-up note in index.md without including its private context.

- 2026-10-20: The wiki holds Acme, Northwind, Fjord Bank and Ana’s own pages.
- 2026-11-02: Created acme/northwind/spare-parts-commerce.md with the research question, requirements, criteria, options, sourced findings and open questions from Ana's F1–F5 and setup request; no recommendation yet.
- 2026-11-02: Updated acme/northwind/overview.md to link the shop analysis and distinguish its decision and launch timing from the website relaunch.
- 2026-11-02: Added the spare parts commerce research brief to index.md for future sessions.


===== acme/northwind/spare-parts-commerce.md =====
# Spare parts shop: commerce platform research brief

Status: **Active options are A. Butikkskyen and B. Composa.** C. Fram CMS commerce was dropped by agreement with Gunnar on 16 November 2026 because support ends in 2028 [G2]; its comparison is kept as history only. The draft recommendation prefers A subject to validation and advises against B. **A has not been finally selected.** No numeric scores; weights and gates remain unagreed.
Last updated: 30 November 2026 (F19 nightly-import alternative added under Composa; main comparison remains the near-real-time proposal).

## What changed on 23 November

- **Budget cut:** management cut the first-year budget from 2.5 M to **2.0 M NOK** [F18]. This supersedes the 2.5 M in [F1]. Assumed to still cover licences and build; confirm.
- **Butikkskyen build is now a fixed price:** partner Kodeverket offers the build at **1.1 M NOK fixed**, valid **until 15 December 2026** [F17]. This replaces F6's approximate 900,000 and meets the fixed-price preference [F4] for the build.
- **Price-list scale is no longer an open risk on paper:** Northwind has **3,100** customer-specific price lists [F15]. Butikkskyen says B2B Pricing app v4 (October) handles up to 10,000 and that the workarounds Agder Maskin needed are no longer necessary [F16]. This is a supplier statement, not yet tested on Northwind's data.
- **Customer service now has direct evidence:** about 300 calls a week on order status and prices; customer service wants customers to see order status themselves [F14]. Order status is a new requirement that no option has been shown to meet.
- Net effect on the draft: A's known first year is **1.55 M** (0.45 M under the new budget); B's known first year is **3.5 M**, **1.5 M over**. The draft preference for A is stronger, still subject to validation. Added the requested indicative go-live line (see the recommendation).

## Decision question and timing

Which commerce platform should Northwind use for its new spare parts shop: A. Butikkskyen or B. Composa? Gunnar wants a recommendation for the steering group in December 2026; the exact date and process are unconfirmed [S1]. **Kodeverket's offer lapses on 15 December [F17]**, so the meeting date matters: if the meeting is later, ask for an extension or accept that price and terms may change.

The shop must be live by **1 September 2027**, with a **first-year budget of 2.0 million NOK including licences and build** (was 2.5 M [F1]; cut per [F18]). These are shop constraints, not the website relaunch's dates or budget.

## Northwind's goals, requirements and preferences

| Area | What we know | Source |
| --- | --- | --- |
| Customers and catalogue | Sell spare parts online to dealers and workshops; about 4,000 parts. | [F1] |
| Commercial model | Customer-specific prices: **3,100 price lists**. | [F1], [F15] |
| ERP and data | Microsoft Dynamics 365 holds prices and stock. Every option must read both in near real time. | [F1], [F3] |
| Order status | **New:** customer service wants customers to see order status themselves. Implies reading order status from the ERP too. Not yet scoped or costed for any option. | [F14] |
| Delivery capacity | Northwind's integration team has two people. | [F3] |
| Priority | Speed to market matters most to Gunnar. No numerical weights agreed. | [F2] |
| Marketing workflow | Gunnar wants marketing to manage shop content in the same tool as the website. Validate whether mandatory and whether options meet it. | [F2] |
| Workshop buying | Workshops want to reorder in a few clicks. | [F2] |
| Dealer buying | Dealers mostly order by part number; 70% of orders now arrive by email and phone. | [F5] |
| Procurement | Fixed-price build and licences that can be ended yearly. A's build is now fixed-price [F17]; annual licence termination unconfirmed. | [F4], [F17] |
| Design flexibility | Not a criterion (Gunnar). | [G1] |

## Options

| Option | Description | Source |
| --- | --- | --- |
| A. Butikkskyen | SaaS shop platform; build by partner Kodeverket (assumed to be the partner behind F6; confirm). Standard Dynamics connector and B2B Pricing app. | [S1], [F6], [F17] |
| B. Composa | Headless commerce engine with own frontend (included in build quote). No standard Dynamics connector. | [S1], [F7], [F11] |
| C. Fram CMS commerce | **Excluded [G2].** Commerce module support ends December 2028; Fram recommends a partner platform. This does not mean the website CMS loses support. | [F8], [F13] |

## Customer service (direct evidence from 17 November)

**Evidence:** Hanne Ruud, head of customer service, says the team takes about 300 calls a week about order status and prices, and wants customers to see order status themselves [F14].

**What it does and does not tell us**
- It is a baseline of workload, not a saving. We do not know how many calls a shop would remove. Nobody has said how much of the 300 comes from dealers and workshops who would use the shop, as opposed to other customers.
- It is separate from the 70% of orders that arrive by email and phone [F5]. Those are orders; the 300 are enquiries.
- Two needs: **prices** (customer-specific prices visible in the shop) and **order status** (visible to the customer). Prices fall within the existing price/stock requirement. Order status is new.

| Option | Implication to validate |
| --- | --- |
| A. Butikkskyen | The pricing app with 3,100 lists could show customers their own prices if it works at Northwind's scale [F15], [F16]. Whether the standard connector and shop show **order status** is unknown; ask Kodeverket whether it is in the 1.1 M fixed scope. [F6], [F17] |
| B. Composa | Order status would be part of the custom integration. Ola's 800,000 NOK / four-month estimate was for the Dynamics integration; whether it covers order status is unknown, so it may rise. [F11], [F14] |
| C | Excluded. |

**Next evidence:** ask suppliers to demonstrate customer-specific prices and order status for a logged-in customer; ask Hanne Ruud which calls are most common (status, price, delivery date, returns) and how many come from dealers and workshops. Do not claim call reductions until then.

## Comparison against the four criteria (23 November 2026)

“Unknown” means no evidence, not a poor result. Reference calls cover one customer per supplier, so they are indications, not proof.

### Quoted prices and known estimates (NOK)

| | A. Butikkskyen | B. Composa | C. Fram (history) |
| --- | --- | --- | --- |
| Licence per year | **450,000**, one store [F12] | 900,000 [F7] | 300,000 [F8] |
| Build | **1,100,000 fixed price**, Kodeverket, valid to 15 Dec 2026 [F17] | about 1,800,000, frontend included [F7] | 1,200,000 [F8] |
| Additional known integration | None estimated; standard connector included. Order status and price-list set-up unknown [F6], [F14] | **800,000** custom Dynamics integration [F11] | Unknown |
| First year | **1,550,000** | **3,500,000** | 1,500,000, incomplete |
| Against the 2.0 M budget [F18] | Within; **0.45 M** left before uncosted items | **Over by 1.5 M (75%)**. Even on 2.7 M without F11 it is over by 0.7 M (35%) | Excluded |
| Three years | **2,450,000** | **5,300,000** | 2,100,000 nominal, not supported |

Arithmetic: A = 450,000 + 1,100,000; three years = 3 × 450,000 + 1,100,000. B = 900,000 + 1,800,000 + 800,000; three years = 3 × 900,000 + 1,800,000 + 800,000. Assumes one store, full licence in year one, unchanged annual prices, and F11 additional to the F7 build (confirm no double counting). Compared with A, B costs **1.95 M more in year one and 2.85 M more over three years** on known items.

A's earlier figures (1.35 M first year, 2.25 M three years) used the approximate 900,000 build [F6] and are superseded by the fixed price [F17]. Confirm F17 has the same scope as F6 (standard connector, pricing app) and what it excludes.

**Uncosted:** order-status integration and anything else beyond A's standard connector; configuring or migrating 3,100 price lists unless in Kodeverket's scope; hosting, support, maintenance, change requests, internal effort, VAT. The 0.45 M left under A is not free contingency. Fixed-price acceptance by Composa is unconfirmed; its integration is an estimate.

### Criteria

| Criterion | A. Butikkskyen | B. Composa |
| --- | --- | --- |
| Time to market (live by 1 Sept 2027) | Agder Maskin went live in four months [F9]. Indicative go-live April 2027 if decided in December (scenario below). Northwind's scope may differ: 3,100 price lists, order status. | Four months of integration before shop work starts [F11]. From a December start, shop work begins about April 2027, leaving about five months. Reference took nine months overall [F10]; do not add it mechanically. No credible plan yet. |
| Cost over three years | 2.45 M known items. | 5.3 M known items; 1.5 M over the first-year budget. |
| Fit with Dynamics 365 | Standard connector and pricing app. The reference needed workarounds above 2,000 lists [F9]; Northwind has 3,100 [F15]. Butikkskyen says v4 handles 10,000 and the workarounds are unnecessary [F16]. Untested on Northwind's data; near-real-time behaviour and order status unverified. | Custom integration, 800,000 NOK / four months; burden on a two-person team; does not prove near-real-time behaviour or cover order status. [F3], [F11] |
| Ease of use for marketing | Unknown; not demonstrated. | Unknown; not demonstrated. |

### Composa alternative: nightly import (30 November update)

Ola estimates a nightly import of prices and stock at **200,000 NOK instead of the 800,000 custom integration**, but shop prices could be **up to a day old** [F19]. Assuming this replaces F11's integration cost and is additional to F7's build, Composa's known cost falls by 600,000 to **2.9 M NOK in year one / 4.7 M over three years**—still **900,000 (45%) over** the 2.0 M first-year budget. This is an alternative scenario, not a replacement for the main comparison above.

**It does not meet the current requirement for near-real-time prices and stock** [F1], [F3]. Reconsider only if Northwind explicitly accepts nightly freshness and its customer impact; it does not make Composa affordable within the current budget. Import delivery time, stock freshness in practice and order-status coverage remain unconfirmed: do not assume F11's four-month integration sequence applies, or that this option removes that delay. The conditional preference for A is unchanged.

Design flexibility was dropped on 9 November [G1]; it earns no credit.

### Reading the evidence

- **A: strongest candidate for validation.** Within the 2.0 M budget on known costs, fixed-price build, standard connector, and the price-list risk is now a supplier-answered question rather than a known blocker. Still unproven: v4 at 3,100 lists, near-real-time prices/stock, order status, marketing workflow, Northwind's real timeline. [F6], [F9], [F15]–[F17]
- **B: fails the budget on known costs.** Over by 1.5 M (75%), or 0.7 M on the most favourable reading, plus four months of integration before shop work. No demonstrated benefit offsets this. [F7], [F11], [F18]
- **C: excluded.** [G2]
- No formal ranking or scores. Confirm whether 2.0 M is a hard gate and the speed-versus-cost trade-off.

## Draft recommendation for the December steering group

**Recommend A. Butikkskyen (via Kodeverket) as the preferred platform, subject to technical, commercial and delivery validation before contract award. Do not proceed with B. Composa on its current proposal. C has been excluded by agreement with Gunnar. [G2]** This is a draft, not a final decision or weighted evaluation.

### Indicative go-live for A (scenario, not a commitment)

If Northwind decides in December 2026 and the build starts promptly, Butikkskyen's four-month reference [F9] points to a go-live around **April 2027**. That would be about four months before the 1 September 2027 deadline. This is an indicative scenario, not a supplier commitment. It assumes: (1) a decision and signed contract by 15 December, when the offer lapses [F17]; (2) immediate start; (3) Kodeverket has capacity; (4) scope comparable to Agder Maskin's. Point 4 is unproven: Northwind has 3,100 price lists and wants order status [F14], [F15], and the F17 offer states no delivery schedule. Ask Kodeverket for a dated plan.

### Why B is not recommended

- **Cost:** known first year 3.5 M against 2.0 M, 1.5 M (75%) over. Even if Ola's estimate were already in the build, 2.7 M is 0.7 M (35%) over. Compared with A: 1.95 M more in year one, 2.85 M more over three years. [F7], [F11], [F17], [F18]
- **Schedule:** integration must run four months before shop work; with a December start the shop work begins around April 2027. B is not demonstrated deliverable by 1 September, not proven impossible. [F10], [F11]
- **Capacity:** a custom integration adds delivery and operating load for a two-person team. [F3]
- **No offsetting advantage** on the four criteria; design flexibility is no longer a criterion.
- Reconsider only if Northwind accepts a revised budget and scope and Composa supplies a credible sequenced plan, integration scope, resourcing and demonstrated ERP performance. Worth raising with Gunnar whether to drop B formally, as with C. The second Composa reference is due diligence, not a reason to overlook these constraints.

### Conditions before approving A

1. **ERP and price-list proof (before or soon after 15 December):** run Northwind's 3,100 customer-specific lists and near-real-time stock/price reads through A; get Butikkskyen to confirm in writing that v4's 10,000-list limit applies to the quoted licence and that the old workarounds are not needed; define acceptable latency and outage behaviour; agree monitoring and ownership with Ola. [F3], [F15], [F16]
2. **Order status:** show where customers see order status and how it is read from Dynamics 365; get it priced, in or out of the fixed scope. [F14]
3. **Commercial:** confirm F17's scope against F6, store count, annual licence termination and a three-year all-in breakdown; confirm the 2.0 M covers what we assume. Ask for an extension if the steering-group date falls after 15 December. [F4], [F17], [F18]
4. **Delivery:** dated plan to 1 September 2027 with testing and contingency.
5. **Workflow acceptance:** demonstrate marketing editing and settle whether one-tool operation is mandatory. If mandatory and A fails it, reopen the choice. Validate part-number ordering and rapid reorder. [F2], [F5]

**Decision requested:** endorse A as preferred candidate for focused validation and negotiation within the offer window; confirm the budget and deadline gates. If A fails a mandatory requirement or its all-in price exceeds 2.0 M, return to the steering group with revised scope or other supported platforms. No numerical weights or scores have been invented.

## Evaluation framework

Four criteria: time to market, three-year cost, fit with Dynamics 365, ease of use for marketing. The operationalisation below is proposed, not agreed. [F1], [G1]

| Criterion | Evidence to collect |
| --- | --- |
| Time to market | Dated delivery plan to 1 September 2027, scope, supplier capacity, dependencies, testing and contingency. |
| Cost over three years | Build, licences, integration, hosting, support, changes, with exclusions; first-year spend against 2.0 M. [F18] |
| Fit with Dynamics 365 | Customer-specific pricing at 3,100 lists, near-real-time price/stock, order status, failure handling, operating burden for two people. [F3], [F14], [F15] |
| Ease of use for marketing | Demonstration of editing and whether shop and website share a tool. [F2] |

Track fixed price, annual termination, ordering usability and customer-service implications explicitly. Agree gates and trade-offs before any formal ranking. Missing evidence is unknown, not a low score.

## Open questions and next research

### Confirm with Northwind

- December steering-group date versus the 15 December offer expiry; decision-maker and format. [S1], [F17]
- Is 2.0 M a hard gate and does it still cover licences and build only? Which scope may be deferred? Does it include internal effort, VAT, hosting, support? [F18]
- Is the deadline a hard gate? Weights and the speed/cost trade-off. [F1], [F2]
- Number of stores (A's 450,000 is for one). [F12]
- Is one-tool marketing mandatory or preferred? [F2]
- Define “near real time” and name the Dynamics 365 APIs and existing integrations. [F3]
- Integration-team capacity and post-launch ownership. [F3]
- Annual licence termination, notice, exit and data export. [F4]
- Customer service: which of the 300 weekly calls come from dealers and workshops; most common questions; adoption targets against the 70% email/phone baseline. [F5], [F14]

### Supplier and technical follow-up

- **A (priority):** F17 scope versus F6; written v4 capacity and licence-tier confirmation; Northwind-data proof at 3,100 lists; order-status capability and cost; dated delivery plan; offer extension if needed; marketing workflow demo. [F6], [F16], [F17]
- **B:** F11 scope overlap with the build; whether order status is covered; staffing; fixed-price possibility; a sequenced plan; second reference customer (still pending). [F7], [F10], [F11]
- **C:** closed. [G2]

## Continuation record

- 2 November 2026: Created brief from kickoff, interviews, market note and options.
- 9 November 2026: Added F6–F10 and comparison; renamed old F6 to S1. Dropped design flexibility [G1].
- 16 November 2026: Added F11–F13, corrected A's licence, B's integration cost; provisional customer-service section; drafted recommendation (prefer A, not B); recorded exclusion of C [G2].
- 23 November 2026: Added F14–F18. Budget cut to 2.0 M; A's build now fixed at 1.1 M to 15 December; price-list question answered by supplier (untested); customer-service evidence and order-status requirement added; costs, comparison and recommendation recalculated; go-live scenario line added as Ana requested on 16 November.
- **Next:** validate A (see conditions), check the steering-group date against 15 December, get order status scoped, review with Northwind and confirm gates; second Composa reference still pending.

## Sources

- [F1] Kickoff notes, 28 October 2026 (Ana): customers, catalogue, deadline, pricing, ERP, five original criteria. **Its 2.5 M first-year budget is superseded by [F18].**
- [F2] Gunnar Holm interview, 29 October 2026, supplied by Ana.
- [F3] Ola Nordmann, integration architect, interview, 29 October 2026, supplied by Ana.
- [F4] Lise Berg, procurement, interview, 30 October 2026, supplied by Ana.
- [F5] Cara's market note, 30 October 2026, supplied by Ana.
- [F6] Butikkskyen quote, 3 November 2026, supplied by Ana: approximate 900,000 build now superseded by F17; licence corrected by F12.
- [F7] Composa quote, 4 November 2026, supplied by Ana.
- [F8] Fram CMS, 4 November 2026, supplied by Ana.
- [F9] Agder Maskin (Butikkskyen customer) reference call, 5 November 2026, supplied by Ana.
- [F10] Vestlandsdeler (Composa customer) reference call, 6 November 2026, supplied by Ana.
- [F11] Ola Nordmann, 11 November 2026, supplied by Ana on 16 November: Composa integration 800,000 NOK, four months before shop work.
- [F12] Butikkskyen correction, 12 November 2026: 450,000 NOK annually for one store; 600,000 was for two.
- [F13] Fram CMS, 12 November 2026: commerce support ends December 2028.
- [F14] Hanne Ruud, head of customer service, 17 November 2026, supplied by Ana on 23 November: about 300 calls a week on order status and prices; wants customers to see order status themselves.
- [F15] Ola Nordmann, 18 November 2026, supplied by Ana on 23 November: Northwind has 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026, supplied by Ana on 23 November: B2B Pricing app v4 (October) handles up to 10,000 price lists; Agder Maskin's workarounds no longer necessary.
- [F17] Lise Berg, 19 November 2026, supplied by Ana on 23 November: Kodeverket (Butikkskyen partner) offers the build at a fixed 1.1 M NOK, valid until 15 December 2026.
- [F18] Gunnar Holm, 20 November 2026, supplied by Ana on 23 November: management cut the first-year budget to 2.0 M NOK.
- [F19] Ola Nordmann, 27 November 2026, supplied by Ana on 30 November: nightly import of prices and stock costs about 200,000 NOK instead of 800,000; shop prices could be up to a day old.
- [G1] Ana's report of call with Gunnar Holm, 9 November 2026: drop design flexibility; add customer-service section.
- [G2] Ana's report, 16 November 2026: Gunnar agreed to drop Fram's commerce module; exclusion decided.
- Ana, 16 November 2026 follow-up request: add a go-live line for Butikkskyen counting four months from a December decision (done 23 November).
- [S1] Ana's research setup request, 2 November 2026 (earlier labelled F6).


===== personal/northwind-commerce-reminder.md =====
# Northwind commerce: private follow-up reminder

For Ana's next session on the Northwind commerce analysis: remind her to **ask Composa for a second reference customer**. Pending. [Ana, 2 November 2026]

Private context, not for the research brief or steering-group material: Ana says Gunnar is skeptical of Composa because a friend's company struggled with it. This is secondhand anecdotal context, not verified evidence about Composa; do not use it to score or bias the platform comparison. Keep the analysis evidence-based. [Ana, 2 November 2026]

## Sources

- Ana, private follow-up request, 2 November 2026: context and next-session reminder; explicitly excluded from the research brief.


===== personal/northwind-commerce-session-2026-11-02.md (record) =====
# Northwind commerce — session record, 2 November 2026

## Work completed

Created the [working research brief](../acme/northwind/spare-parts-commerce.md) for choosing Northwind's spare parts shop platform: A. Butikkskyen, B. Composa or C. Fram CMS commerce. Captured goals, constraints, five agreed criteria, sourced findings F1–F5 and open questions. Linked it from the index and Northwind overview. [Ana, 2 November 2026; F1–F5]

## Decisions and rationale

- No platform selected or scored: supplier evidence has not yet been collected. Build an evidence-based recommendation over several sessions for Gunnar's December 2026 steering group. [Ana, 2 November 2026]
- Keep the shop's 1 September 2027 deadline and 2.5 million NOK first-year budget separate from the website relaunch. [F1]
- Use the five kickoff criteria; Gunnar prioritises speed, but numerical weights and formal decision gates remain unagreed. The brief's assessment approach is a proposal, not a new Northwind decision. [F1], [F2]
- Keep Ana's private follow-up outside the brief and do not let anecdotal context influence scoring. See the [private next-session reminder](northwind-commerce-reminder.md); it remains pending. [Ana, 2 November 2026]

## Still open

Exact December meeting date and decision process; criterion weights and mandatory versus preferred requirements; minimum launch scope; budget inclusions; measurable near-real-time ERP requirements and integration capacity; buyer workflows; supplier capabilities, delivery plans, three-year costs and contract terms. No vendor research, estimates or demonstrations yet.

## Next steps

1. At the next Northwind session, read the private reminder and prompt Ana about its pending action.
2. Confirm decision timing, priorities and launch scope with Northwind.
3. Gather comparable proposals and demonstrations from all three suppliers, including pricing/stock integration, part-number ordering, reorder and marketing workflows.
4. Review integration feasibility with Ola and update the brief with dated, sourced findings before scoring or recommending.

## Sources

- Ana's requests and session discussion, 2 November 2026: research setup, December recommendation, private follow-up and session record request.
- [F1] Kickoff notes (Ana), 28 October 2026: requirements, budget, deadline and criteria.
- [F2] Gunnar Holm interview, 29 October 2026: speed priority and user workflows.
- [F3–F5] Ola Nordmann and Lise Berg interviews and Cara's market note, 29–30 October 2026. Full source details and findings are in the working brief.


===== personal/northwind-commerce-session-2026-11-09.md (record) =====
# Northwind commerce — session record, 9 November 2026

Start here next session. This supersedes the next steps in the [2 November record](northwind-commerce-session-2026-11-02.md).

## What we worked on

- Added supplier quotes and reference calls (F6–F10) and a comparison of A. Butikkskyen, B. Composa and C. Fram CMS commerce to the [research brief](../acme/northwind/spare-parts-commerce.md): quoted prices, first-year and three-year totals, and the criteria table with a source on each cell.
- After Ana's call with Gunnar, dropped design flexibility as a criterion. [G1]
- Renamed the brief's old local source label F6 (setup request) to S1, because F6 is now the Butikkskyen quote. The Northwind overview was updated to match.

## Decisions and rationale

- **Four criteria, not five.** Design flexibility is dropped because Gunnar says it does not matter for Northwind. The five-criteria list from kickoff is kept in the brief as history. [G1]
- **No ranking or scores yet.** Weights and gates (are the 1 September 2027 deadline and the 2.5 M NOK first-year budget absolute?) are not agreed with Northwind, and Fram has almost no evidence. Missing evidence is recorded as unknown, not as a low score.
- **Ana's leaning stays out of the brief.** Ana is leaning towards Composa but worries about the integration; Ola will check it this week. This is private context. The brief stays evidence-based. [Ana, 9 November 2026]

## What the evidence says so far (from the brief)

- Costs: Butikkskyen 1.5 M NOK in year one and 2.7 M over three years; Composa 2.7 M and 4.5 M (over the first-year budget by 0.2 M, before integration cost); Fram 1.5 M and 2.1 M. These totals are our arithmetic and exclude integration, hosting, support and VAT. [F6–F8]
- Butikkskyen: standard Dynamics 365 connector and included pricing app; the reference went live in four months but needed workarounds above 2,000 price lists. [F6], [F9]
- Composa: no standard connector, and the reference's integration took longer than planned; nine months to launch. [F7], [F10]
- Fram: cheapest, and marketing stays in Fram, but nothing on Dynamics 365, customer-specific prices or delivery time. [F8]

## Still open

- Customer service impact of each option: no evidence collected yet. [G1]
- Ola's findings on the Composa integration (expected this week).
- Fram: Dynamics 365 integration, customer-specific prices, B2B ordering, delivery time, references.
- Whether the build prices are fixed, and the cost of the Dynamics 365 integration for each option.
- How many customer-specific price lists Northwind needs (Butikkskyen's reference needed workarounds above 2,000).
- Butikkskyen's and Composa's marketing content workflow.
- Decision date and process, criterion weights, gates, minimum launch scope, budget inclusions, measurable "near real time".
- A second Composa reference customer (Ana's pending action).

## Next steps

1. **First, before anything else:** add a short section to the brief on what each option means for Northwind's customer service team. Gunnar asked for it. [G1] No evidence exists yet, so ask Ana what she has or which sources to use.
2. Read the [private reminder](northwind-commerce-reminder.md) and prompt Ana about the pending action: ask Composa for a second reference customer.
3. Record Ola's findings on the Composa integration, with the date.
4. Confirm decision timing, weights and gates with Northwind; get Fram's answers on Dynamics 365 and customer-specific prices.
5. Only then consider scoring and a recommendation for the December steering group.

## Sources

- Ana's report of her call with Gunnar Holm, 9 November 2026 [G1], and her statement of her leaning, 9 November 2026.
- Ana's findings F6–F10, supplied 9 November 2026; full details in the research brief.


===== personal/northwind-commerce-session-2026-11-16.md (record) =====
# Northwind commerce — session record, 16 November 2026

Superseded by the [23 November record](northwind-commerce-session-2026-11-23.md); the go-live line below is now done. Supersedes the next steps in the [9 November record](northwind-commerce-session-2026-11-09.md). Current analysis and draft recommendation: [research brief](../acme/northwind/spare-parts-commerce.md).

## What we worked on

- Added F11–F13, reassessed Composa and updated the four-criterion comparison. Known costs for year one / three years: **A 1.35 M / 2.25 M NOK** for one store; **B 3.5 M / 5.3 M**, assuming Ola's integration estimate is additional to build. These are not all-in offers. [F6], [F7], [F11], [F12]
- Drafted the December steering-group recommendation and added provisional customer-service implications; no direct customer-service evidence or quantified savings yet. [G1]
- Recorded Fram's exclusion, updated overview/index and closed C's research tasks. Its comparison remains as history.

## Decisions and rationale

- **Decided: drop C. Fram CMS commerce.** Ana reported Gunnar's agreement today because module support ends in 2028 (December per F13). This is a decision, not a provisional recommendation. It does not imply the website CMS loses support. [G2], [F13]
- **Draft recommendation: prefer A. Butikkskyen subject to validation; do not proceed with B on its current proposal.** A has the standard connector, included pricing app, four-month reference and corrected lower licence. B needs 800,000 NOK and four months of integration before shop work; known first-year cost is 1 M over budget. No final selection of A or formal rejection of B was reported. [F6], [F9], [F11], [F12]
- No numeric scores or invented weights/gates. Four criteria remain; design flexibility stays excluded. B's nine-month reference is a whole project: do not add it mechanically to Ola's four months or claim a certain deadline miss. [F10], [G1]

## Still open

- Exact December decision date/process; budget and deadline gates, weights, minimum scope and budget inclusions.
- A: store count, price-list scale (reference had workarounds above 2,000 lists), demonstrated near-real-time ERP behaviour, marketing/shared-tool requirement, customer-service and ordering workflows, all-in price, fixed-price build, annual termination and delivery commitment.
- B: integration/build scope overlap, resourcing, operating ownership and credible sequenced delivery plan. Second reference customer remains pending; Ana was reminded this session.
- Customer-service research and adoption expectations. C's former integration, support-extension and transition research tasks are closed.

## Next steps

1. **First next session:** add a line to the recommendation on Butikkskyen's indicative go-live: four months from a December 2026 decision gives **April 2027**. This line is still pending, as Ana requested it for next time. Label it a scenario based on the four-month reference, assuming prompt project start, supplier capacity and comparable scope—not a supplier commitment. [Ana, 16 November follow-up request], [F9]
2. Review the draft with Northwind and confirm decision timing, gates and trade-offs.
3. Prioritise A's ERP/workflow demonstrations, scoped delivery plan and all-in commercial proposal; get direct customer-service evidence.
4. Resolve B's outstanding scope/feasibility evidence and second reference if still pursued. Do not reopen C as an active option.

## Continuation boundaries

Keep Ana's private leaning and unverified anecdotes out of the brief and scoring; see the separate [private reminder](northwind-commerce-reminder.md). The pending second-reference action is not evidence for or against Composa.

## Sources

- [F11] Ola Nordmann, 11 November 2026: custom Composa integration, 800,000 NOK and four months before shop work.
- [F12] Butikkskyen correction, 12 November 2026: 450,000 NOK annually for one store; 600,000 was for two.
- [F13] Fram CMS, 12 November 2026: commerce support ends December 2028; recommends partner platform.
- [G2] Ana, 16 November 2026: Gunnar agreed today to drop Fram commerce due to its 2028 support end.
- Ana, 16 November 2026: request to draft the recommendation, next-session go-live-line task and end-of-session handoff.
- F1–F10 and G1: earlier evidence and Gunnar's customer-service request; full citations in the research brief. Earlier session records/private reminder provide continuation and privacy boundaries.


===== personal/northwind-commerce-session-2026-11-23.md (record) =====
# Northwind commerce — session record, 23 November 2026

Start here next session. Supersedes the next steps in the [16 November record](northwind-commerce-session-2026-11-16.md). Analysis and draft recommendation: [research brief](../acme/northwind/spare-parts-commerce.md). Presentation draft: [steering group outline](../acme/northwind/steering-group-presentation-outline.md).

## What we worked on

- Added F14–F18 to the brief and recalculated costs, comparison and recommendation.
- Added the go-live line requested on 16 November: Butikkskyen (A) indicative go-live around April 2027 if decided in December. It is a scenario, not a supplier commitment.
- Wrote a 10-slide outline for the December steering group. At Ana's request, added to the risks slide (10) only that the B2B Pricing app is a third-party dependency. This is Ana's statement; no F-source says it.

## What the new findings changed, and why

- **Budget cut to 2.0 M NOK** [F18]. A's known first year is 1.55 M (0.45 M left before uncosted items). B's is 3.5 M, 1.5 M (75%) over; even 2.7 M without Ola's estimate is 0.7 M over. This is why B is not recommended.
- **A's build is a fixed 1.1 M NOK from Kodeverket, valid until 15 December** [F17], replacing the approximate 900,000. Three-year known cost is 2.45 M against B's 5.3 M.
- **Price lists:** Northwind has 3,100 [F15]. Butikkskyen says v4 handles 10,000 and the workarounds are gone [F16]. This is a supplier claim, untested.
- **Customer service:** about 300 calls a week on order status and prices [F14]. This is a baseline, not a saving. Order status is a new requirement, not yet scoped or costed for either option.

## Decisions and status

- C (Fram) remains excluded [G2]. The draft still prefers A subject to validation and advises against B. No final selection; no scores. Nothing new was decided by Northwind or Gunnar this session.
- The outline's wording follows the draft: endorse A for validation, not an unconditional purchase.

## Still open

- Steering-group date against the 15 December offer expiry.
- Whether 2.0 M is a hard gate and what it covers.
- Whether F17's scope matches F6, and whether Kodeverket is the same partner.
- Whether A's v4 works at 3,100 lists on Northwind's data; whether the licence includes it; how order status is handled and priced; marketing shared-tool requirement; dated delivery plan.
- The third-party dependency of the B2B Pricing app: who supports it and what the terms are. No evidence yet.
- Customer service: who the 300 callers are and what they ask.
- Whether to drop B formally; second Composa reference is still pending (private reminder).

## Next steps

1. Check the meeting date against 15 December; ask Kodeverket for an extension if it is later.
2. Validate A: F17 scope versus F6, written v4 confirmation, order status, dated plan, Northwind-data test.
3. Ask Butikkskyen about the B2B Pricing app's third-party dependency.
4. Ask Hanne Ruud about the 300 calls.
5. Confirm the budget gate with Gunnar and discuss dropping B.
6. Review the outline with Northwind, then turn it into slides.
7. Decide whether the second Composa reference is still worth pursuing.

## Sources

- F14–F18 as supplied by Ana on 23 November 2026; citations in the research brief.
- Ana, 16 November 2026 follow-up request (go-live line); Ana, 23 November 2026 requests (outline; third-party risk).


===== acme/northwind/steering-group-presentation-outline.md =====
# Steering group presentation outline: spare parts shop platform (December 2026)

Draft outline, 10 slides, based on the [research brief](spare-parts-commerce.md) as of 23 November 2026. Figures are known quoted items, not all-in prices. The meeting date is unconfirmed; Kodeverket's offer lapses on 15 December [F17].

## 1. Decision requested
- We ask the steering group to endorse **Butikkskyen (built by Kodeverket)** as the preferred platform for the spare parts shop.
- Endorsement means focused validation and negotiation, not an unconditional purchase.
- The offer window closes on 15 December 2026. [F17]

## 2. What the shop must achieve
- Sell about 4,000 spare parts online to dealers and workshops. [F1]
- Live by **1 September 2027**; first-year budget **2.0 M NOK** including licences and build (cut from 2.5 M). [F1], [F18]
- Customer-specific prices: **3,100 price lists**. [F15]
- Prices and stock must be read from Dynamics 365 in near real time; Northwind's integration team has two people. [F1], [F3]
- Gunnar's priority is speed to market. [F2]

## 3. How we compared the options
- Four criteria: time to market, three-year cost, fit with Dynamics 365, ease of use for marketing. [F1], [G1]
- Customer service need: about 300 calls a week on order status and prices; customers should see order status themselves. [F14]
- Evidence: supplier quotes, two reference calls, Ola's integration estimate. No numeric scores; unknowns are marked as unknown.

## 4. Options considered
- **A. Butikkskyen:** SaaS platform, standard Dynamics connector, B2B Pricing app; build by partner Kodeverket. [F6], [F17]
- **B. Composa:** headless engine with own frontend; no standard Dynamics connector, so custom integration. [F7], [F11]
- **C. Fram CMS commerce: dropped** with Gunnar's agreement on 16 November because support ends in 2028. [G2], [F13]

## 5. Cost against the 2.0 M budget
| | A. Butikkskyen | B. Composa |
| --- | --- | --- |
| First year | 1.55 M | 3.5 M |
| Against 2.0 M | 0.45 M under | 1.5 M (75%) over |
| Three years | 2.45 M | 5.3 M |

- A: 450,000 licence per year plus 1.1 M fixed-price build. B: 900,000 licence, 1.8 M build, 800,000 integration estimate.
- Even without the integration estimate, B's first year is 2.7 M, 0.7 M over budget.
- Not included for either: hosting, support, internal effort, VAT, order-status work. [F6], [F7], [F11], [F12], [F17]

## 6. Fit with Dynamics 365 and customer-specific prices
- A: standard connector and pricing app included.
- The reference customer needed workarounds above 2,000 price lists; Butikkskyen says version 4 handles up to 10,000 and the workarounds are no longer needed. [F9], [F16]
- That claim is not yet tested on Northwind's 3,100 lists; we will test it. [F15]
- B: custom integration, four months of work before shop work starts; adds delivery and operating load for a two-person team. [F3], [F11]

## 7. Time to market
- A: reference customer went live in four months. Scenario: decision in December, prompt start, go-live around **April 2027**, about four months before the deadline. [F9]
- This is a scenario, not a supplier commitment. Northwind's scope (3,100 lists, order status) may be larger than the reference. We will ask for a dated plan.
- B: shop work cannot start until about April 2027 on a December start, leaving about five months. No credible plan yet. [F10], [F11]

## 8. Customer service and marketing
- Known: 300 calls a week on order status and prices. This is a baseline; we do not claim a saving. [F14]
- Not yet shown for either option: customers seeing their own prices and order status. Order status may add integration scope.
- Not yet shown: marketing managing shop content in the same tool as the website. [F2]
- Both will be demonstrated before contract award.

## 9. Recommendation and conditions
- **Prefer A**, because it is within the 2.0 M budget on known costs, has a fixed-price build, uses a standard connector and has the better speed case.
- **Do not proceed with B** on its current proposal: over budget on known costs, later start, more delivery risk, no offsetting advantage.
- Conditions before contract award:
  1. Proof on Northwind's 3,100 price lists and near-real-time stock/price.
  2. Order status scoped and priced.
  3. Written confirmation of fixed-price scope, licence terms and annual termination.
  4. Dated delivery plan to 1 September 2027.
  5. Marketing and ordering workflows demonstrated.

## 10. Risks, next steps and decision
- Risks: the B2B Pricing app is a third-party dependency; v4 claim untested; order-status scope; offer expiry on 15 December; the 0.45 M margin is not free contingency; unconfirmed supplier delivery date.
- Next steps: validation with Butikkskyen and Kodeverket, review with Hanne Ruud's team and Ola, written proposal within the budget.
- Fallback: if A fails a mandatory requirement or its all-in price exceeds 2.0 M, return to the steering group with revised scope or other platforms.
- **Decision:** endorse A as preferred candidate and confirm the budget and deadline as fixed limits.

## Before presenting
- Confirm the meeting date against 15 December, or ask Kodeverket for an extension.
- Confirm with Gunnar that 2.0 M is a hard limit and what it covers.
- Confirm the F17 scope matches the earlier quote (F6) and what it excludes.

## Sources
- Findings F1–F18 and decisions G1, G2 as cited in the [research brief](spare-parts-commerce.md).
- Ana, request of 23 November 2026: outline of 8 to 10 slides.
- Ana, 23 November 2026: the B2B Pricing app is a third-party dependency (risks slide). Her statement; not in the supplier material F1–F18.

