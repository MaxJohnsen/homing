===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work includes the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

## Spare parts shop

A separate [commerce platform research brief](spare-parts-commerce.md) tracks the choice between Butikkskyen, Composa and Fram CMS commerce. Gunnar wants a recommendation for the steering group in December 2026; the shop's target launch is 1 September 2027. As of 9 November the brief holds supplier quotes, two reference calls and a comparison against the five criteria; no recommendation yet. [F1], [S1]

## Sources

- [F1] Ana's kickoff notes, 28 October 2026, supplied 2 November 2026; source details in the research brief.
- [S1] Ana's research setup request, 2 November 2026 (earlier labelled F6); source details in the research brief.


===== log.md (record) =====
# Log

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

Status: supplier quotes and two reference calls are in (F6–F10); comparison against the four current criteria added below. No recommendation or numeric scores yet: weights and gates are not agreed with Northwind. Design flexibility was dropped as a criterion on 9 November. Ola is checking the Composa integration in the week of 9 November.
Last updated: 9 November 2026.

## Decision question and timing

Which commerce platform should Northwind use for its new spare parts shop: A. Butikkskyen, B. Composa, or C. Fram CMS commerce? Gunnar wants a recommendation for the steering group in December 2026; the exact meeting date and decision process remain to be confirmed. This brief is the working record for analysis over the coming weeks. [S1]

The shop must be live by **1 September 2027**, with a **first-year budget of 2.5 million NOK including licences and build**. These are shop constraints, not the separate website relaunch's dates or budget. [F1]

## Northwind's goals, requirements and preferences

| Area | What we know | Source |
| --- | --- | --- |
| Customers and catalogue | Sell spare parts online to dealers and workshops; approximately 4,000 parts. | [F1] |
| Commercial model | Customers have customer-specific prices. | [F1] |
| ERP and data | Microsoft Dynamics 365 holds prices and stock. Every option must read both in near real time. | [F1], [F3] |
| Delivery capacity | Northwind's integration team has two people. | [F3] |
| Priority | Speed to market matters most to Gunnar. No criterion weights have been agreed in the supplied evidence. | [F2] |
| Marketing workflow | Gunnar wants marketing to manage shop content in the same tool as the website. Treat as a stakeholder requirement to validate, not proof that any option meets it. | [F2] |
| Workshop buying experience | Workshops want to reorder in a few clicks. | [F2] |
| Dealer buying behaviour | Dealers mostly order by part number; 70% of orders currently arrive by email and phone. | [F5] |
| Procurement preferences | Procurement wants a fixed-price build and licences that can be ended yearly. Supplier acceptance is unconfirmed. | [F4] |
| Design flexibility | Not a criterion: Gunnar says it does not matter for Northwind. | [G1] |

## Options in scope

| Option | Description | Source |
| --- | --- | --- |
| A. Butikkskyen | SaaS shop platform; build by a partner. | [S1], [F6] |
| B. Composa | Headless commerce engine with its own frontend (frontend included in the build quote). | [S1], [F7] |
| C. Fram CMS commerce | Commerce module of Fram CMS, which runs Northwind's new website. | [S1], [F8] |

## Comparison against the four criteria (9 November 2026)

"Unknown" means no evidence yet, not a poor result. The two reference calls are one customer per supplier (none for Fram), so they are indications, not proof.

### Quoted prices (NOK)

| | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Licence per year | 600,000 [F6] | 900,000 [F7] | 300,000 [F8] |
| Build (approx.) | 900,000, by a partner [F6] | 1,800,000, frontend included [F7] | 1,200,000 [F8] |
| First year (licence + build) | 1,500,000 | 2,700,000 | 1,500,000 |
| Against 2.5 M first-year budget | Within, 1.0 M margin | **Over by 0.2 M** | Within, 1.0 M margin |
| Three years (3 × licence + build) | 2,700,000 | 4,500,000 | 2,100,000 |

Totals are our arithmetic from the quoted figures. They assume the full annual licence is paid in year one, no price changes, and that the build figures are the whole build. Not yet in any quote: Dynamics 365 integration work (outside A's standard connector), hosting, support, maintenance, change requests, internal effort and VAT. Whether the build prices are fixed is not stated in the sources; all three build figures are given as "about". [F6], [F7], [F8]

### Criteria

| Criterion | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Time to market (live by 1 Sept 2027) | Reference customer Agder Maskin went live in four months. [F9] Indicates room against the deadline; one customer, scope unknown. | Reference customer Vestlandsdeler launched after nine months, and the integration took longer than planned. [F10] A nine-month project started in December would end about September 2027, with no margin. Our inference. | Unknown: no timeline or reference yet. |
| Cost over three years | 2.7 M NOK quoted; mid-range. [F6] | 4.5 M NOK quoted; highest. First-year figure exceeds the budget before any integration cost. [F7] | 2.1 M NOK quoted; lowest. [F8] |
| Fit with Dynamics 365 | Standard Dynamics 365 connector included. Customer-specific prices via the B2B Pricing app, included in the licence. [F6] Worked at Agder Maskin, but needed workarounds above 2,000 price lists. [F9] Near-real-time price/stock not yet verified. | No standard connector; integration goes through Composa's API. [F7] Integration took longer than planned at the reference customer. [F10] Heaviest load on the two-person integration team. [F3] Our inference. Ola is checking this week. | Unknown: the quote says nothing on Dynamics 365 or customer-specific prices. [F8] |
| Ease of use for marketing | Unknown: nothing on the content tool or whether it is shared with the website. | Unknown: nothing on editing workflow. | Marketing keeps working in Fram, so likely the same tool as the website. [F8] Supplier statement, to be demonstrated. |

Design flexibility was a fifth criterion agreed at kickoff [F1] and was dropped on 9 November [G1]. The related evidence is kept for the record only: Composa's reference called it "very flexible" [F10], and its frontend is included in the build quote [F7].

### Reading the evidence so far

- **A. Butikkskyen:** the best-evidenced option. Within budget, a standard connector, pricing handled by an included app, and a four-month reference. Main open points: how many price lists Northwind has (the reference needed workarounds above 2,000) and marketing's content workflow. [F6], [F9]
- **B. Composa:** the most expensive, over the first-year budget, and the weakest on delivery time and Dynamics integration so far. Its main open point is the integration, which Ola is checking. [F7], [F10]
- **C. Fram CMS commerce:** cheapest and the strongest on the one-tool marketing preference, but there is no evidence on Dynamics 365, customer-specific prices, B2B ordering or delivery time. It is not yet comparable on the criteria that carry the most risk. [F8]
- Nothing is ranked yet. Weights, gates (are the deadline and budget absolute?) and the speed-versus-cost trade-off still need to be agreed with Northwind.

## Evaluation framework

Four criteria remain from the five agreed at kickoff; design flexibility was dropped. The evidence to collect below is a proposed operationalisation, not an agreed scoring model. [F1], [G1]

| Criterion | Evidence to collect for each option |
| --- | --- |
| Time to market | Credible delivery plan to 1 September 2027, implementation scope, supplier capacity, integration dependencies, testing and contingency. Reflect Gunnar's emphasis on speed without inventing numerical weights. [F1], [F2] |
| Cost over three years | Comparable three-year total: build, licences, integration, hosting where applicable, support, maintenance and change costs; assumptions and exclusions. Separately show first-year spend against 2.5 million NOK. [F1] |
| Fit with Dynamics 365 | Demonstrated customer-specific pricing and near-real-time price/stock reads; integration architecture, failure handling and operational burden for a two-person team. [F1], [F3] |
| Ease of use for marketing | Demonstration of everyday editing and publishing, including whether website and shop content can be managed in the same tool. [F1], [F2] |

Proposed assessment approach: first establish whether each option can meet launch, first-year budget, customer-specific pricing and near-real-time ERP requirements; then compare it against the four criteria. Track procurement terms and ordering usability explicitly rather than silently adding new weighted criteria. Agree gates, trade-offs, weights and scoring with Northwind before ranking options. Record missing evidence as unknown, not a low score.

## Open questions and next research

### Confirm with Northwind

- What is the December steering-group date, who decides, and what format and confidence level are expected for the recommendation? [S1]
- Are the deadline and budget absolute gates? What is the minimum launch scope and what may be deferred? Does the budget also need to cover internal effort, VAT, hosting and support? [F1]
- What weights should the four criteria carry? How should speed be traded against cost? [F1], [F2]
- How many customer-specific price lists will the shop need? Butikkskyen's reference needed workarounds above 2,000. [F9]
- Is one-tool marketing content management mandatory or a preference? Which content and workflows must be shared with the website? [F2]
- What does "near real time" mean in measurable latency, availability and data-freshness terms? Which Dynamics 365 product, APIs and existing integrations are in use? What happens if the ERP is unavailable? [F1], [F3]
- How much capacity can the two-person integration team actually allocate, and who will support the shop after launch? [F3]
- Are fixed-price build and annual licence termination mandatory? What notice periods and exit/data-export provisions are acceptable? [F4]
- What are the launch requirements for accounts and access, price visibility, part-number search, quick ordering and reorder? Validate actual buyer journeys, including payment, delivery and order handoff to the ERP. [F1], [F2], [F5]
- What adoption or business outcomes should the shop target? The 70% email/phone baseline is known, but no target for shifting orders online has been supplied. [F5]
- What does each option mean for Northwind's customer service team? Gunnar asked for a short section on this; no evidence has been collected yet. [G1]

### Collect comparable evidence for A, B and C

- Ask all three for written proposals on the same scope: confirm whether the build prices are fixed, what the integration to Dynamics 365 costs, annual termination terms, support and hosting, and assumptions and exclusions.
- **Composa (B):** Ola is checking the Dynamics 365 integration this week; record his findings with the date. Ask Composa for the integration scope, a realistic timeline to 1 September 2027, and the cost of integrating through its API. Get more than one reference customer.
- **Fram (C):** the biggest gap. Ask about Dynamics 365 integration, customer-specific prices, part-number ordering and reorder, delivery time and references. Verify rather than assume that the website's CMS meets shop requirements. Check dependencies on the separate [website relaunch](website-relaunch/website-relaunch.md).
- **Butikkskyen (A):** ask about marketing's content workflow, whether the partner build price is fixed, and the near-real-time behaviour of the Dynamics connector.
- Ask each supplier to demonstrate customer-specific pricing and stock from Dynamics 365, part-number ordering, rapid reorder and marketing's content workflow.
- Review the integration architecture and operating responsibilities with Ola; establish any need for a technical proof of concept.

## Continuation record

- 2 November 2026: Created brief from the supplied kickoff, interviews, market note and option descriptions. No vendor research, estimates, scoring or recommendation yet.
- 9 November 2026: Added supplier quotes (F6–F8) and reference calls (F9–F10), a comparison against the five criteria with first-year and three-year costs, and updated open questions. The earlier local label F6 (setup request) was renamed S1, because F6 is now the Butikkskyen quote. No recommendation or scores yet.
- 9 November 2026 (later): After Ana's call with Gunnar, dropped design flexibility as a criterion [G1]. Gunnar asked for a short section on what each option means for the customer service team; to be added first next session. Ola checks the Composa integration this week.
- Next session: first, add the customer service section. Then record Ola's findings; confirm decision timing, weights and gates with Northwind; fill the gaps for Fram; seek a second Composa reference; then consider scoring.

## Sources

- [F1] Kickoff notes, 28 October 2026 (Ana), supplied by Ana: customers, catalogue, launch deadline, pricing, ERP, budget and the five criteria agreed at kickoff.
- [F2] Interview with Gunnar Holm, 29 October 2026, supplied by Ana: speed priority, shared content tool and workshop reordering.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026, supplied by Ana: near-real-time price/stock requirement and two-person integration team.
- [F4] Interview with Lise Berg, procurement, 30 October 2026, supplied by Ana: fixed-price build and annually terminable licences.
- [F5] Market note from Cara, 30 October 2026, supplied by Ana: part-number ordering and 70% email/phone baseline.
- [F6] Quote from Butikkskyen, 3 November 2026, supplied by Ana: licence, partner build, standard Dynamics 365 connector, B2B Pricing app.
- [F7] Quote from Composa, 4 November 2026, supplied by Ana: licence, build including frontend, no standard Dynamics 365 connector.
- [F8] Fram CMS, 4 November 2026, supplied by Ana: commerce module licence and build; marketing stays in Fram.
- [F9] Reference call with Agder Maskin (Butikkskyen customer), 5 November 2026, supplied by Ana.
- [F10] Reference call with Vestlandsdeler (Composa customer), 6 November 2026, supplied by Ana.
- [G1] Ana's call with Gunnar Holm, 9 November 2026, reported by Ana: design flexibility is not a criterion; add a customer service section.
- [S1] Ana's research setup request, 2 November 2026: three option descriptions, relationship to Fram CMS website, December steering-group recommendation and multi-session research plan. Previously labelled F6 in this brief; renamed to avoid a clash with the Butikkskyen quote.


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

