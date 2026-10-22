===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work includes the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

## Spare parts shop

A separate [commerce platform research brief](spare-parts-commerce.md) tracks the choice between Butikkskyen, Composa and Fram CMS commerce. Gunnar wants a recommendation for the steering group in December 2026; the shop's target launch is 1 September 2027. As of 16 November the brief compares four criteria, includes F11–F13 and a provisional customer-service section: Butikkskyen's one-store licence is corrected, Composa needs a costly four-month integration before shop work, and Fram commerce support ends December 2028. Gunnar agreed on 16 November to drop Fram's commerce module because support ends in 2028; that exclusion is decided. The draft recommendation prefers Butikkskyen subject to validation and advises against Composa on its current proposal; no final selection of A or numeric scores. [F1], [S1], [F11–F13], [G2]

## Sources

- [G2] Ana, 16 November 2026: Gunnar agreed today to drop Fram commerce because support ends in 2028; exclusion is decided.

- [F11–F13] Ola Nordmann, 11 November 2026; Butikkskyen correction and Fram CMS support notice, 12 November 2026; supplied by Ana on 16 November. Full details in the research brief.

- [F1] Ana's kickoff notes, 28 October 2026, supplied 2 November 2026; source details in the research brief.
- [S1] Ana's research setup request, 2 November 2026 (earlier labelled F6); source details in the research brief.


===== log.md (record) =====
# Log

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

Status: **C. Fram CMS commerce dropped by agreement with Gunnar on 16 November 2026 because support ends in 2028.** [G2] Active options are A. Butikkskyen and B. Composa. The draft recommendation prefers A subject to validation and advises against B on its current proposal. A has not been finally selected; no numeric scores, and weights/gates remain unagreed. C's comparison is retained as decision history, not an active alternative.
Last updated: 16 November 2026.

## Decision question and timing

Which commerce platform should Northwind use for its new spare parts shop: A. Butikkskyen or B. Composa? The original third option, C. Fram CMS commerce, was dropped by agreement with Gunnar on 16 November because support ends in 2028. [G2] Gunnar wants a recommendation for the steering group in December 2026; the exact meeting date and decision process remain to be confirmed. [S1]

The shop must be live by **1 September 2027**, with a **first-year budget of 2.5 million NOK including licences and build**. These are shop constraints, not the separate website relaunch's dates or budget. [F1]

## Northwind's goals, requirements and preferences

| Area | What we know | Source |
| --- | --- | --- |
| Customers and catalogue | Sell spare parts online to dealers and workshops; approximately 4,000 parts. | [F1] |
| Commercial model | Customers have customer-specific prices. | [F1] |
| ERP and data | Microsoft Dynamics 365 holds prices and stock. Every option must read both in near real time. | [F1], [F3] |
| Delivery capacity | Northwind's integration team has two people. | [F3] |
| Priority | Speed to market matters most to Gunnar. No numerical criterion weights agreed. | [F2] |
| Marketing workflow | Gunnar wants marketing to manage shop content in the same tool as the website. Validate whether mandatory and whether options meet it. | [F2] |
| Workshop buying experience | Workshops want to reorder in a few clicks. | [F2] |
| Dealer buying behaviour | Dealers mostly order by part number; 70% of orders currently arrive by email and phone. | [F5] |
| Procurement preferences | Fixed-price build and licences that can be ended yearly. Supplier acceptance unconfirmed. | [F4] |
| Design flexibility | Not a criterion: Gunnar says it does not matter for Northwind. | [G1] |

## Active options and excluded option

A and B remain in scope. **C is excluded by decision [G2]**; its description and comparison below are retained for traceability only. No further C evaluation is pending.

| Option | Description | Source |
| --- | --- | --- |
| A. Butikkskyen | SaaS shop platform; build by a partner. | [S1], [F6] |
| B. Composa | Headless commerce engine with its own frontend (frontend included in build quote). | [S1], [F7] |
| C. Fram CMS commerce | Commerce module of Fram CMS, which runs Northwind's new website. Commerce module support ends December 2028; Fram recommends a partner platform. This is not evidence that the website CMS itself loses support. | [S1], [F8], [F13] |

## Customer service implications — provisional

Gunnar requested this section. There is no direct customer-service research yet; the implications below are hypotheses to validate, not demonstrated supplier capabilities or quantified savings. [G1]

Across all options, part-number ordering and rapid reorder could reduce manual handling of the 70% of orders now arriving by email/phone. Customer service would still need to help customers adopt the shop and resolve pricing, stock and order exceptions; the net workload is unknown. [F2], [F5]; analysis.

| Option | Potential implication to validate |
| --- | --- |
| A. Butikkskyen | Included pricing app and connector could support self-service pricing and stock. Test incorrect-price and stale-stock handling; the reference's workarounds above 2,000 price lists may matter for exception handling. Do not assume Northwind has that many lists. [F6], [F9] |
| B. Composa | Custom integration makes reliable prices/stock and clear failure handling important to avoid manual checks and customer queries. The four-month pre-shop dependency delays when a working shop can be built; no customer-service workflow has been demonstrated. [F3], [F7], [F11] |
| C. Fram CMS commerce | Marketing staying in Fram does not demonstrate customer-service usability. Support ending December 2028 introduces a possible second customer transition and retraining soon after launch; the migration path is unknown. [F8], [F13] |

Next evidence: interview customer service about manual order handling, common pricing/stock exceptions, assisted ordering, order status and returns; ask each supplier to demonstrate the relevant workflows and access controls. Ana has not supplied customer-service findings yet.

## Comparison against the four criteria (16 November 2026)

“Unknown” means no evidence yet, not a poor result. The reference calls cover one customer per supplier (none for Fram), so they are indications, not proof.

### Quoted prices and known estimates (NOK)

| | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Licence per year | **450,000 for one store** [F12] | 900,000 [F7] | 300,000 [F8] |
| Build (approx.) | 900,000, by a partner [F6] | 1,800,000, frontend included [F7] | 1,200,000 [F8] |
| Additional known integration estimate | No separate estimate; standard connector included, additional work unknown [F6] | **800,000**, custom Dynamics 365 integration [F11] | Unknown [F8] |
| First year (licence + build + known additional integration) | **1,350,000** | **3,500,000** | **1,500,000**, incomplete |
| Against 2.5 M first-year budget | Within; **1.15 M** remaining before uncosted items | **Over by 1.0 M** before other uncosted items | Within on quoted items; 1.0 M remaining, but integration uncosted |
| Three years (3 × licence + build + known additional integration) | **2,250,000** | **5,300,000** | **2,100,000 nominal only; not a supported three-year solution on current evidence** |

Totals are our arithmetic, not comparable all-in bids. They assume one store for A, full annual licence in year one, unchanged annual prices, and B's F11 estimate additional to the F7 build (confirm scope and no double counting). F12 corrects F6: the original 600,000 NOK annual licence was for two stores, not one. Confirm Northwind's required store count. [F6]–[F8], [F11], [F12]

Uncosted: integration/customisation beyond A's standard connector, C's integration, hosting, support, maintenance, change requests, internal effort and VAT. Builds are quoted as “about”; fixed-price acceptance is unconfirmed. B's integration is an estimate, not a fixed-price commitment. [F6]–[F8], [F11]

**Fram lifecycle caveat:** support ends in December 2028, roughly 16 months after the planned September 2027 launch and within a three-year operating horizon. The nominal 2.1 M omits any partner-platform migration/replacement and is not a credible supported three-year total. This explains the exclusion; no transition proposal is required to decide on C now. A partner platform would be a separate option, not a continuation of C. [F1], [F8], [F13]; analysis.

### Criteria

| Criterion | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Time to market (live by 1 Sept 2027) | Agder Maskin went live in four months. Suggests potential headroom, not a Northwind delivery commitment; scope unknown. [F9] | Ola estimates **four months for integration before shop work can start**. [F11] If started in December, shop work could start around April 2027, leaving about five months to launch. The reference took nine months overall with integration delays [F10]; do not mechanically add that whole reference duration to the four months. No credible Northwind delivery plan yet. |
| Cost over three years | 2.25 M known quoted items for one store; below B, and only 0.15 M above C's unsupported nominal subtotal; exclusions remain. [F6], [F12] | 5.3 M including estimated custom integration; highest known subtotal. First-year cost 3.5 M, 1.0 M over budget. [F7], [F11] | Nominal 2.1 M is not comparable without migration/ongoing support costs beyond December 2028. [F8], [F13] |
| Fit with Dynamics 365 | Standard connector and B2B Pricing app included. Worked at Agder Maskin, with workarounds above 2,000 price lists. Near-real-time price/stock not verified. [F6], [F9] | No standard connector; custom API integration required, estimated at 800,000 NOK/four months before shop work. Heavy delivery/operating burden to validate with the two-person team; estimate does not prove near-real-time behaviour. [F3], [F7], [F11] | Unknown: no evidence on Dynamics 365 or customer-specific pricing. Short commerce support horizon compounds investment risk. [F8], [F13] |
| Ease of use for marketing | Unknown: content tool and shared website workflow not demonstrated. | Unknown: editing workflow not demonstrated. | Marketing stays in Fram according to supplier; demonstrate rather than assume. Partner-platform move may change this workflow. [F8], [F13] |

Design flexibility was a fifth criterion at kickoff [F1], dropped on 9 November [G1]. Historical evidence only: Composa's reference called it “very flexible” [F10], and the build includes its frontend [F7]. Neither earns credit under the current four criteria.

### Reading the evidence so far

- **A. Butikkskyen: strongest candidate for further validation.** Corrected one-store pricing lowers first-year subtotal by 150,000 and three-year subtotal by 450,000 NOK. Standard connector, included pricing app and four-month reference are positive evidence. Still unproven: Northwind-specific timeline, real-time behaviour, price-list scale and marketing workflow. This is a provisional evidence-based direction, not a procurement decision. [F6], [F9], [F12]
- **B. Composa: substantially weakened.** Known first-year cost is 3.5 M versus the 2.5 M budget, and four months of custom integration must precede shop work. If the budget is a hard gate, B fails on known costs; if the deadline is hard, it needs a credible plan before it can be considered feasible. Do not declare a certain deadline miss without that plan. [F1], [F7], [F10], [F11]
- **C. Fram CMS commerce: dropped — decided, not provisional.** Gunnar agreed on 16 November to exclude the module because support ends in 2028. No further ERP, delivery or transition research on C is required for this selection. Any partner platform would be a new option, not automatically C. [G2], [F13]
- No formal ranking or scores. Confirm gates, weights and the speed-versus-cost trade-off with Northwind. Do not add lifecycle as an invented weighted fifth criterion: reflect it in three-year cost, delivery/transition risk and support due diligence.

## Draft recommendation for the December steering group

**Recommend A. Butikkskyen as the preferred platform, subject to technical, commercial and delivery validation before contract award. Do not proceed with B. Composa on the current proposal. C. Fram CMS commerce has already been dropped by agreement with Gunnar because support ends in 2028. [G2]** The preference for A and advice on B remain draft recommendations, not final Northwind decisions or a completed weighted evaluation; the exclusion of C is decided.

### Reassessment of B: the integration is now a quantified disadvantage

Ola's estimate changes B from an option with an unresolved integration question to one with a known custom-build dependency: **800,000 NOK and four months before shop work starts**. It does not demonstrate that the integration meets the price/stock latency requirement, nor establish staffing or ongoing support. With only two people in Northwind's integration team, this adds delivery and operational exposure that needs an explicit ownership and resourcing plan. [F3], [F11]; analysis.

Assuming the estimate is additional to the quoted build, B's first-year subtotal rises from **2.7 M to 3.5 M NOK**, or **40% above the 2.5 M budget**, before other exclusions. Three-year known costs rise from **4.5 M to 5.3 M NOK**. Compared with A's corrected one-store figures, B costs **2.15 M more in year one and 3.05 M more over three years** on the known items. These are subtotal differences, not proven all-in savings. Even if all of Ola's estimate were already included in the build, B's original 2.7 M would still exceed the first-year budget by 0.2 M. Confirm scope rather than relying on either interpretation. [F1], [F6], [F7], [F11], [F12]; arithmetic.

A December integration start would place shop-work start around April 2027, leaving roughly five months for shop build, end-to-end testing and launch contingency. The December meeting date and supplier start date are unconfirmed; a later start reduces that window. The nine-month reference project and its integration delays reinforce the risk but do not prove Northwind needs thirteen months: the reference's integration was part of its overall project. B is **not currently demonstrated deliverable by 1 September**, rather than proven impossible. [F10], [F11]; analysis.

B has no evidenced marketing advantage over A, and its cited design flexibility is no longer a decision criterion. On the four retained criteria, no demonstrated benefit justifies the current cost and schedule disadvantage. **Do not recommend B for the present scope, budget and deadline.** Reconsider only if Northwind explicitly accepts a revised budget/scope and Composa supplies a credible sequenced delivery plan, an agreed integration scope, resourcing/support ownership and demonstrated ERP performance. A second reference is still useful due diligence, not a reason to overlook these constraints. [F1]–[F3], [F7], [F10], [F11], [G1]; analysis.

### Why A, rather than C

- **A offers the best-supported route to Northwind's speed priority.** A standard Dynamics connector and included pricing app reduce the amount of bespoke integration indicated by current evidence, and the four-month reference is encouraging, though not a commitment for Northwind. The corrected one-store licence gives a first-year known subtotal of **1.35 M**, leaving **1.15 M** for as-yet-uncosted work and contingency within the stated budget. Neither the delivery date nor the all-in price is proven. [F1], [F2], [F6], [F9], [F12]
- **C's apparent price advantage is not a sustainable three-year comparison.** Its nominal 2.1 M is only 150,000 NOK below A's 2.25 M, before C's unknown integration and transition costs. Support ends December 2028, roughly 16 months after planned launch, and Fram recommends moving to a partner. Starting a new shop on that module would create avoidable near-term replacement exposure. Marketing continuity does not overcome this lifecycle issue. Gunnar has now agreed to drop C for the support-end reason; this is no longer an open recommendation or conditional exclusion. Any future partner-platform proposal would be evaluated separately. [F8], [F12], [F13], [G2].

### Conditions before approving A

1. **ERP proof:** demonstrate Northwind's customer-specific prices and near-real-time stock/price reads, define acceptable latency and outage behaviour, and test representative price-list scale. Establish whether the reference's workarounds above 2,000 lists are relevant. Agree monitoring, incident ownership and operating effort with Ola. [F1], [F3], [F6], [F9]
2. **Delivery and commercial commitment:** confirm required store count and licence scope; obtain a scoped delivery plan to 1 September 2027 with testing and contingency, a fixed-price build proposal, annual termination terms, and a three-year all-in cost breakdown. Reconcile all exclusions and first-year budget coverage; the remaining 1.15 M is not automatically free contingency. [F1], [F4], [F6], [F12]
3. **Workflow acceptance:** demonstrate marketing editing and clarify the shared-tool requirement. If one-tool operation is mandatory and A cannot meet it, reopen the choice rather than silently waive the requirement. Validate part-number ordering, rapid reorder and customer-service exception handling; no customer-service savings are claimed. [F2], [F5], [G1]

**Decision requested:** endorse A as the preferred candidate for focused validation and negotiation, not unconditional purchase; confirm the budget/deadline gates and acceptance of any marketing-workflow trade-off. If A fails a mandatory requirement or its all-in offer exceeds the approved envelope, return to the steering group with revised scope or additional supported platforms. Do not default to B without resolving its documented barriers; C is already excluded by agreement with Gunnar. [G2] No numerical weights or scores have been invented; the draft rests on the stated constraints, speed priority and current evidence. [F1], [F2]; recommendation analysis, 16 November 2026.

## Evaluation framework

Four criteria remain from kickoff; design flexibility was dropped. The evidence below is a proposed operationalisation, not an agreed scoring model. [F1], [G1]

| Criterion | Evidence to collect |
| --- | --- |
| Time to market | Credible delivery plan to 1 September 2027, scope, supplier capacity, integration dependencies, testing and contingency. Reflect speed priority without inventing weights. [F1], [F2] |
| Cost over three years | Build, licences, integration, hosting, support, maintenance, changes and lifecycle/migration costs, with assumptions/exclusions. Separately show first-year spend against 2.5 M. [F1], [F13] |
| Fit with Dynamics 365 | Demonstrated customer-specific pricing and near-real-time price/stock reads; architecture, failure handling and operating burden for a two-person team. [F1], [F3] |
| Ease of use for marketing | Demonstration of editing/publishing and whether shop/website content share a tool. [F1], [F2] |

Proposed approach: establish whether each option meets launch, first-year budget, customer-specific pricing and near-real-time ERP requirements, then compare against the four criteria. Track procurement terms, support lifecycle, ordering usability and customer-service implications explicitly. Agree gates, trade-offs, weights and scoring before formal ranking. Missing evidence is unknown, not a low score.

## Open questions and next research

### Confirm with Northwind

- December steering-group date, decision-maker, format and expected confidence level. [S1]
- Are deadline and budget absolute gates? What minimum scope may be deferred? Does budget cover internal effort, VAT, hosting and support? If fixed, should Composa be removed from the shortlist now given its 1.0 M known overrun? [F1], [F11]
- Four criterion weights and speed/cost trade-off. [F1], [F2]
- Confirm one store or more, and number of customer-specific price lists (reference needed workarounds above 2,000). [F9], [F12]
- Is one-tool marketing mandatory or preferred, and which workflows must be shared? [F2]
- Define “near real time”: latency, availability, data freshness, ERP outage behaviour; identify Dynamics 365 product/APIs and existing integrations. [F1], [F3]
- Available capacity of the two-person integration team and post-launch responsibilities. [F3]
- Are fixed-price build and annual termination mandatory? Notice periods, exit and data export requirements. [F4]
- Buyer journeys: accounts/access, price visibility, part-number search, quick order/reorder, payment, delivery and order handoff. [F1], [F2], [F5]
- Adoption targets against the 70% email/phone baseline and customer-service workflows/impact; ask Ana for findings or preferred interview sources. [F5], [G1]

### Supplier and technical follow-up

- **Butikkskyen (A), priority validation:** confirm the 450,000 one-store scope, included app/connector and required store count; obtain a fixed-scope delivery proposal and all-in costs. Demonstrate near-real-time ERP behaviour, pricing at Northwind's scale, marketing and customer-service workflows. [F6], [F9], [F12]
- **Composa (B):** Ola's finding is recorded, no longer pending. Validate the 800,000 scope and whether additional to quoted build; staffing, maintenance and fixed-price possibilities. Obtain a sequenced plan showing four-month integration prerequisite, remaining shop work, testing and contingency before 1 September 2027. Ask for a second reference customer. Do not assume shortening the integration or overlapping shop work is possible. [F7], [F10], [F11]
- **Fram (C): closed.** Excluded by agreement with Gunnar on 16 November because commerce support ends in 2028; no further commerce-module evaluation pending. This does not imply the separate [website relaunch](website-relaunch/website-relaunch.md) CMS loses support. [G2], [F13]
- Active suppliers (A and B): same-scope written proposals covering fixed price, annual licence termination, hosting/support, integration and exclusions; demonstrate pricing/stock, part-number ordering, rapid reorder and content workflows. Review architecture, failure handling and ownership with Ola; decide whether a proof of concept is needed.

## Continuation record

- 2 November 2026: Created brief from kickoff, interviews, market note and option descriptions. No scoring or recommendation.
- 9 November 2026: Added F6–F10 quotes/references and costs/comparison. Renamed earlier local F6 (setup request) to S1 to avoid clash.
- 9 November 2026 (later): Dropped design flexibility [G1]; queued customer-service section first next session; Ola checking Composa integration.
- 16 November 2026: Added provisional customer-service section (no direct evidence), recorded F11–F13, corrected A's licence/totals, added B's integration cost and sequencing, and flagged C's support/migration risk. Updated evidence-based direction without formal scoring or final selection.
- 16 November 2026 (later): At Ana's request, reassessed B's cost, schedule and capacity implications and added the draft recommendation: prefer A subject to validation; do not proceed with B/C on current proposals. No final Northwind decision or numeric scoring.
- 16 November 2026 (decision update): Ana reported Gunnar's agreement today to drop C because commerce support ends in 2028. Exclusion is decided; A's preference remains a draft. [G2]
- **First next session:** add a line to the recommendation on Butikkskyen's indicative go-live, counting four months from a December 2026 decision (April 2027). This is a requested scenario based on the four-month reference, not a supplier commitment; state assumptions about immediate project start, supplier capacity and comparable scope. The recommendation line is deferred until next session as Ana requested. [Ana, 16 November 2026 follow-up request], [F9]
- Then: review the draft with Northwind; confirm gates/weights and decision date; prioritise A's validation and all-in proposal, including customer-service and marketing workflows. C remains excluded; second Composa reference remains pending.

## Sources

- [F1] Kickoff notes, 28 October 2026 (Ana), supplied by Ana: customers, catalogue, deadline, pricing, ERP, budget and five original criteria.
- [F2] Gunnar Holm interview, 29 October 2026, supplied by Ana: speed priority, shared content tool and workshop reorder.
- [F3] Ola Nordmann, integration architect, interview, 29 October 2026, supplied by Ana: near-real-time requirements and two-person team.
- [F4] Lise Berg, procurement, interview, 30 October 2026, supplied by Ana: fixed price and annual termination.
- [F5] Cara's market note, 30 October 2026, supplied by Ana: part-number ordering and 70% email/phone baseline.
- [F6] Butikkskyen quote, 3 November 2026, supplied by Ana: partner build, connector, pricing app; licence scope/price corrected by F12.
- [F7] Composa quote, 4 November 2026, supplied by Ana: licence, build including frontend, no standard connector.
- [F8] Fram CMS, 4 November 2026, supplied by Ana: module licence/build, marketing stays in Fram.
- [F9] Agder Maskin (Butikkskyen customer) reference call, 5 November 2026, supplied by Ana.
- [F10] Vestlandsdeler (Composa customer) reference call, 6 November 2026, supplied by Ana.
- [F11] Ola Nordmann, 11 November 2026, supplied by Ana on 16 November: Composa requires custom Dynamics 365 integration; estimated 800,000 NOK and four months before shop work can start.
- [F12] Butikkskyen correction, 12 November 2026, supplied by Ana on 16 November: 600,000 NOK annual licence was for two stores; one store is 450,000 NOK annually.
- [F13] Fram CMS, 12 November 2026, supplied by Ana on 16 November: commerce module support ends December 2028; recommends customers move to a partner platform.
- [G1] Ana's report of call with Gunnar Holm, 9 November 2026: drop design flexibility; add customer-service section.
- [G2] Ana's report, 16 November 2026: Gunnar agreed today to drop Fram's commerce module because support ends in 2028; treat exclusion as decided.
- Ana, 16 November 2026 follow-up request: next session add a recommendation line on Butikkskyen's indicative go-live counting four months from a December decision; no supplier delivery commitment supplied.
- [S1] Ana's research setup request, 2 November 2026: options, website relationship, December recommendation and multi-session plan. Previously labelled F6; renamed to avoid clash.


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

Start here next session. Supersedes the next steps in the [9 November record](northwind-commerce-session-2026-11-09.md). Current analysis and draft recommendation: [research brief](../acme/northwind/spare-parts-commerce.md).

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

