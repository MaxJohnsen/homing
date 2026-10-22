===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work includes the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

## Spare parts shop

A separate [commerce platform research brief](spare-parts-commerce.md) tracks the choice between Butikkskyen, Composa and Fram CMS commerce. Gunnar wants a recommendation for the steering group in December 2026; the shop's target launch is 1 September 2027. [F1], [F6]

## Sources

- [F1] Ana's kickoff notes, 28 October 2026, supplied 2 November 2026; source details in the research brief.
- [F6] Ana's research setup request, 2 November 2026; source details in the research brief.


===== log.md (record) =====
# Log

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

Status: research started; no recommendation or platform scores yet.
Last updated: 2 November 2026.

## Decision question and timing

Which commerce platform should Northwind use for its new spare parts shop: A. Butikkskyen, B. Composa, or C. Fram CMS commerce? Gunnar wants a recommendation for the steering group in December 2026; the exact meeting date and decision process remain to be confirmed. This brief is the working record for analysis over the coming weeks. [F6]

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

## Options in scope

Only the descriptions below are established so far. There is no supplier-specific evidence yet on cost, delivery, integration, B2B features or contractual terms. [F6]

| Option | Known description | Questions to test, not conclusions |
| --- | --- | --- |
| A. Butikkskyen | SaaS shop platform. [F6] | Can it meet customer-specific pricing and near-real-time Dynamics 365 needs? Can marketing work in the required website/shop content workflow? What are the limits on design and annual termination? |
| B. Composa | Headless commerce engine with its own frontend. [F6] | What exactly is included in the frontend, and who builds and maintains it? Can it support the required marketing workflow and fit the integration team's capacity? |
| C. Fram CMS commerce | Commerce module of Fram CMS, which runs Northwind's new website. [F6] | Does the module actually provide one-tool content management, the required B2B ordering and Dynamics 365 integration? What extra build, licences and support are needed? |

## Evaluation framework

The five criteria were agreed at kickoff. The evidence to collect below is a proposed operationalisation, not an agreed scoring model. [F1]

| Agreed criterion | Evidence to collect for each option |
| --- | --- |
| Time to market | Credible delivery plan to 1 September 2027, implementation scope, supplier capacity, integration dependencies, testing and contingency. Reflect Gunnar's emphasis on speed without inventing numerical weights. [F1], [F2] |
| Cost over three years | Comparable three-year total: build, licences, integration, hosting where applicable, support, maintenance and change costs; assumptions and exclusions. Separately show first-year spend against 2.5 million NOK. [F1] |
| Fit with Dynamics 365 | Demonstrated customer-specific pricing and near-real-time price/stock reads; integration architecture, failure handling and operational burden for a two-person team. [F1], [F3] |
| Ease of use for marketing | Demonstration of everyday editing and publishing, including whether website and shop content can be managed in the same tool. [F1], [F2] |
| Design flexibility | Demonstration of design/customisation options and restrictions, with their effect on build effort and ongoing maintenance. [F1] |

Proposed assessment approach: first establish whether each option can meet launch, first-year budget, customer-specific pricing and near-real-time ERP requirements; then compare it against the five criteria. Track procurement terms and ordering usability explicitly rather than silently adding new weighted criteria. Agree gates, trade-offs, weights and scoring with Northwind before ranking options. Record missing evidence as unknown, not a low score.

## Open questions and next research

### Confirm with Northwind

- What is the December steering-group date, who decides, and what format and confidence level are expected for the recommendation? [F6]
- Are the deadline and budget absolute gates? What is the minimum launch scope and what may be deferred? Does the budget also need to cover internal effort, VAT, hosting and support? [F1]
- What weights should the five criteria carry? How should speed be traded against cost and flexibility? [F1], [F2]
- Is one-tool marketing content management mandatory or a preference? Which content and workflows must be shared with the website? [F2]
- What does “near real time” mean in measurable latency, availability and data-freshness terms? Which Dynamics 365 product, APIs and existing integrations are in use? What happens if the ERP is unavailable? [F1], [F3]
- How much capacity can the two-person integration team actually allocate, and who will support the shop after launch? [F3]
- Are fixed-price build and annual licence termination mandatory? What notice periods and exit/data-export provisions are acceptable? [F4]
- What are the launch requirements for accounts and access, price visibility, part-number search, quick ordering and reorder? Validate actual buyer journeys, including payment, delivery and order handoff to the ERP; these details are not established yet. [F1], [F2], [F5]
- What adoption or business outcomes should the shop target? The 70% email/phone baseline is known, but no target for shifting orders online has been supplied. [F5]

### Collect comparable evidence for A, B and C

- Request written proposals with the same launch scope, delivery milestones, fixed-price terms, first-year and three-year costs, annual termination terms, assumptions and exclusions.
- Ask each supplier to demonstrate customer-specific pricing and stock from Dynamics 365, part-number ordering, rapid reorder and marketing's content workflow.
- Review the integration architecture and operating responsibilities with Ola; establish any need for a technical proof of concept.
- Verify Fram commerce capabilities rather than assuming that the website's CMS automatically meets shop requirements. Check dependencies on the separate [website relaunch](website-relaunch/website-relaunch.md).

## Continuation record

- 2 November 2026: Created brief from the supplied kickoff, interviews, market note and option descriptions. No vendor research, estimates, scoring or recommendation yet.
- Next session: confirm decision timing and requirement priorities; begin collecting comparable supplier and integration evidence. Add dated findings with sources here and revise the option comparison as evidence arrives.

## Sources

- [F1] Kickoff notes, 28 October 2026 (Ana), supplied by Ana: customers, catalogue, launch deadline, pricing, ERP, budget and five agreed criteria.
- [F2] Interview with Gunnar Holm, 29 October 2026, supplied by Ana: speed priority, shared content tool and workshop reordering.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026, supplied by Ana: near-real-time price/stock requirement and two-person integration team.
- [F4] Interview with Lise Berg, procurement, 30 October 2026, supplied by Ana: fixed-price build and annually terminable licences.
- [F5] Market note from Cara, 30 October 2026, supplied by Ana: part-number ordering and 70% email/phone baseline.
- [F6] Ana's research setup request, 2 November 2026: three option descriptions, relationship to Fram CMS website, December steering-group recommendation and multi-session research plan. F6 is a local source label added for this brief.


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

