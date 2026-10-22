===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work is the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

## Spare parts shop platform analysis

[Research brief](spare-parts-commerce.md): compare Butikkskyen, Composa and Fram CMS commerce for a recommendation to the steering group in December 2026. The shop targets launch on 1 September 2027 with a first-year budget of 2.5 million NOK, separate from the website relaunch. [U1], [F1]

### Sources

- [U1] Ana, initial research request, 2 November 2026.
- [F1] Kickoff notes, 28 October 2026 (Ana); details recorded in the research brief.


===== log.md (record) =====
# Log

- 2026-10-20: The wiki holds Acme, Northwind, Fjord Bank and Ana’s own pages.
- 2026-11-02: Created acme/northwind/spare-parts-commerce.md: initial platform research brief with decision question, goals, constraints, agreed criteria, three options, sourced evidence [F1]–[F5], open questions and proposed next research steps; no recommendation yet.
- 2026-11-02: Updated acme/northwind/overview.md with a link to the commerce research brief and its separate decision, launch and budget context.
- 2026-11-02: Updated index.md to list the Northwind spare parts commerce research brief.
- 2026-11-02: Created acme/northwind/commerce-internal-follow-up.md for Ana's next-session reminder and internal context, kept separate from the unchanged research brief; added its entry to index.md.
- 2026-11-09: Updated acme/northwind/spare-parts-commerce.md with quotes [F6]–[F8] and reference calls [F9]–[F10]: added a preliminary comparison of the three options against the five agreed criteria (incl. three-year cost calculation), refreshed open questions; still no recommendation or scores. Index entry updated.
- 2026-11-09: Updated acme/northwind/spare-parts-commerce.md after Ana's call with Gunnar: dropped design flexibility as a criterion (four remain) and removed its comparison section; noted Ola's pending Composa integration check; added "customer service section" as the first task next session.
- 2026-11-09: Updated acme/northwind/commerce-internal-follow-up.md with next-session reminders (customer service section first, Composa second reference, Ola's findings) and Ana's stated leaning, kept out of the brief.


===== acme/northwind/spare-parts-commerce.md =====
# Spare parts shop: commerce platform research brief

Status: quotes and first references received for all three options (9 November 2026); comparison below is preliminary. No recommendation or platform scores yet. Design flexibility dropped as a criterion on 9 November (four criteria remain). Ola Nordmann is checking the Composa integration this week.
Last updated: 9 November 2026.
Decision audience: Northwind steering group. Gunnar wants a recommendation in December 2026; exact meeting date to confirm. [U1]

## Decision question

Which platform should Northwind choose for its new spare parts shop: A. Butikkskyen, B. Composa, or C. Fram CMS commerce? Compare delivery feasibility, three-year cost and business fit, and prepare an evidence-backed recommendation for the December steering group. [U1]

## Goals and constraints

| Area | What we know | Source |
| --- | --- | --- |
| Customers and catalogue | Sell spare parts online to dealers and workshops; about 4,000 parts. | [F1] |
| Launch | Live by 1 September 2027. | [F1] |
| First-year budget | 2.5 million NOK, including licences and build. Other cost inclusions need clarification. | [F1] |
| Pricing and stock | Customers have customer-specific prices; Microsoft Dynamics 365 is the ERP and holds prices and stock. Every option must read prices and stock from Dynamics 365 in near real time. | [F1], [F3] |
| Integration capacity | Northwind's integration team has two people. | [F3] |
| Sponsor priority | Speed to market matters most to Gunnar. | [F2] |
| Marketing workflow | Gunnar wants marketing to manage shop content in the same tool as website content. Whether this is a mandatory requirement is not yet confirmed. | [F2] |
| Workshop experience | Workshops want to reorder in a few clicks. | [F2] |
| Procurement preferences | Procurement wants a fixed-price build and licences that can be ended yearly. Confirm whether these are mandatory acceptance conditions. | [F4] |
| Current ordering behaviour | Dealers mostly order by part number; 70% of orders arrive by email and phone today. | [F5] |

The shop launch and budget above are separate from the website relaunch, whose current wiki page records a 1 March 2027 launch and a 450,000 NOK budget. Do not merge the two project baselines. [W1]

## Evaluation criteria

Five criteria were agreed at kickoff [F1]. On 9 November Gunnar told Ana that design flexibility does not matter for Northwind, so it is dropped and **four criteria remain**. [U3] (This comes from Ana's report of her call with Gunnar; confirm with the steering group if the criteria need formal sign-off.) Evidence collected before the change, such as the Composa reference calling the platform "very flexible" [F10], is not used in the comparison.

No numeric weights or scoring scale have been agreed. Gunnar's emphasis on speed should inform the discussion of weighting, not be treated as an approved weighting. [F1], [F2]

| Agreed criterion | Proposed evidence to collect (research plan, not findings) |
| --- | --- |
| Time to market | Credible delivery plan to 1 September 2027, implementation scope, dependencies, integration effort, testing and contingency. |
| Cost over three years | Comparable quotes covering build, licences, hosting, integration, support, maintenance and upgrades; assumptions, exclusions and exit costs. Check first-year spend separately against 2.5 million NOK. |
| Fit with Dynamics 365 | Demonstration of customer-specific pricing and near-real-time price/stock reads; API approach, latency, failure handling and ongoing load on the two-person team. |
| Ease of use for marketing | Demonstration of shop content editing alongside website content, roles, publishing and duplication of work. |

Additional checks derived from stakeholder evidence, not additional agreed weighted criteria: part-number ordering, quick repeat orders, fixed-price build terms and annual licence termination. [F2], [F4], [F5]

Proposed comparison method: first test feasibility against the launch date, first-year budget and mandatory Dynamics 365 requirements; then compare the four criteria with agreed weights. Confirm the status of marketing and procurement requirements before treating them as pass/fail gates. This method remains a proposal.

## Options

Platform descriptions come from Ana's initial brief, not independent vendor validation. [U1]

| Option | Known description |
| --- | --- |
| A. Butikkskyen | SaaS shop platform. |
| B. Composa | Headless commerce engine with its own frontend. |
| C. Fram CMS commerce | Commerce module of Fram CMS, which runs Northwind's new website. |

## Comparison against the criteria (preliminary, 9 November 2026)

Evidence types: **Quote** = supplier statement ([F6], [F7], [F8]); **Reference** = one customer's account ([F9], [F10]). Neither is verified by a demo or test with Northwind data. "No evidence" means not yet established, not a weakness. Numeric scores are deliberately not given because weights and scale are not agreed.

### Cost over three years

Calculated from the quotes as build + 3 × annual licence. Quotes give "about" figures for the build and say nothing on hosting, support, maintenance, upgrades, exit costs, fixed-price terms or licence termination, so these totals are a floor for comparison, not full three-year cost.

| | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Annual licence | 600,000 NOK | 900,000 NOK | 300,000 NOK |
| Build (approx.) | 900,000 NOK, by a partner | 1,800,000 NOK, frontend included | 1,200,000 NOK |
| Year 1 (build + one licence year) | 1,500,000 NOK | 2,700,000 NOK | 1,500,000 NOK |
| Build + 3 licence years | 2,700,000 NOK | 4,500,000 NOK | 2,100,000 NOK |
| Against 2.5M first-year budget | Within, on these figures | Over by about 200,000 NOK | Within, on these figures |
| Sources | [F6] | [F7] | [F8] |

Notes:
- The year 1 figure assumes the licence is paid from the first year and that the 2.5M budget covers only licence and build; both need confirming ([F1] says other inclusions are unclear).
- Composa: the quote says the integration goes through Composa's API, and it is not stated whether integration work is in the 1.8M build. [F7] Its reference said integration took longer than planned, which is a cost risk. [F10]
- Butikkskyen's build is by a partner; whether this is a fixed price is not stated. [F6]
- None of the quotes states a fixed price, so none is yet shown to meet procurement's preference. [F4]

### Time to market (launch 1 September 2027)

| Option | Evidence | Source |
| --- | --- | --- |
| A | Reference customer Agder Maskin went live in four months. One customer; its scope and complexity are not recorded. | [F9] |
| B | Reference customer Vestlandsdeler launched after nine months, and the integration took longer than planned. One customer. | [F10] |
| C | No evidence on delivery time. | n/a |

Reading: if the decision is made in December and work starts in early 2027, there are about eight months to 1 September 2027. Four months would fit; nine months would not, unless Northwind's scope is smaller than the reference's. This is an inference from single references, not a delivery plan. Each supplier should give a dated plan.

### Fit with Dynamics 365

| Option | Evidence | Source |
| --- | --- | --- |
| A | Quote: standard Dynamics 365 connector included. Customer-specific prices go through the B2B Pricing app, included in the licence. Reference: customer-specific prices worked via the app, but needed workarounds above 2,000 price lists. Northwind's number of price lists/price agreements is not known yet, so the relevance of the 2,000 threshold is open. Near-real-time price/stock reads not yet demonstrated. | [F6], [F9], [F3] |
| B | Quote: no standard connector; integration goes through Composa's API, which means custom integration work, likely falling on the two-person integration team or a partner. Reference: integration took longer than planned. Ola Nordmann is assessing the integration this week; result pending. | [F7], [F10], [F3], [U3] |
| C | No evidence on the Dynamics 365 integration, customer-specific pricing or near-real-time reads. | n/a |

### Ease of use for marketing

| Option | Evidence | Source |
| --- | --- | --- |
| A | No evidence on how shop content relates to Fram. | n/a |
| B | No evidence on content workflow. It has its own frontend (included in the build); the relationship to Fram is not established. | [F7], [U1] |
| C | Quote: "Marketing keeps working in Fram". This is a supplier claim and has not been demonstrated for shop content. | [F8] |

### Summary of what the evidence shows so far

- **A. Butikkskyen** has the strongest documented Dynamics 365 story (connector and pricing app included) and the fastest reference delivery (four months), at a mid-level cost. Open risks: the 2,000 price-list limit versus Northwind's actual volume, and unknown marketing workflow.
- **B. Composa** is the most expensive (about 2.7M in year 1, over the 2.5M budget on these figures) and its reference points to the longest delivery and integration effort, which puts the 1 September 2027 date at risk. Only one reference so far. The integration assessment by Ola is pending.
- **C. Fram CMS commerce** is the cheapest on the quotes and the only option with a claim of single-tool marketing use, but there is no evidence yet on Dynamics 365 fit, pricing, reordering, delivery time or maturity for B2B spare parts. It cannot yet be compared with A and B on those criteria.
- No option is yet shown to be fixed-price or annually terminable. [F4]

## Open questions and next research

### Decision and scope
- What is the December steering group date, and when must the recommendation and supporting material be ready? Who approves the choice?
- How should the four remaining criteria be weighted? Which requirements are mandatory versus preferences?
- What is the minimum launch scope: dealer/workshop login and permissions, part-number search or bulk entry, repeat orders, checkout, payment/invoicing, order history and fulfilment?
- What measurable outcomes should the shop achieve? Does Northwind have a target for shifting email/phone orders online? The current 70% is a baseline, not a target. [F5]

### Integration and capacity
- Which Dynamics 365 product/version, APIs and existing integrations are available?
- Ola's check of the Composa integration (this week): what effort, risks and ownership does he find? Does it change the delivery estimate? [U3]
- What does "near real time" mean in seconds or minutes? What are acceptable caching, stale-data and outage behaviours?
- How many customer-specific price lists or price agreements does Northwind have? This decides whether Butikkskyen's 2,000 price-list workaround threshold matters. [F9]
- How are customers mapped to accounts and price agreements? What are expected traffic, order volumes and peak loads?
- Does scope also include orders flowing back to Dynamics 365, order status or other data? These flows are not specified in the current evidence.
- How much capacity can the two-person integration team commit, and who will own support and upgrades? For Composa, who builds and maintains the API integration, and is it included in the 1.8M? [F7]

### Platform and user validation
- Can each supplier demonstrate a customer-specific price/stock lookup, part-number order and quick reorder using realistic data?
- Can marketing demonstrate the required editing workflow for each option, especially Butikkskyen and Composa alongside Fram? Is a single tool mandatory, or would an integrated workflow suffice?
- Fram CMS: what do the commerce module's Dynamics 365 integration, customer-specific pricing, reorder and part-number features look like, and is there a B2B reference customer? [F8]
- Are website rollout dependencies, Fram API limits or other technical constraints relevant to this shop? The website wiki records a vendor API limit of 10 requests/second affecting migration; its relevance to commerce is unverified, and it must not be assumed to apply to all shop integrations. [W1]
- Get comparable references: only one reference each for A and B and none for C. What were their scopes, catalogue sizes, and what caused delays or workarounds? [F9], [F10]

### Commercial and delivery validation
- Will suppliers commit to a fixed-price build with clear scope, exclusions and change control, and licences terminable yearly?
- What does the first-year budget include beyond licences and build, and when does "first year" start? What common three-year costing period and assumptions should all quotes use (hosting, support, upgrades, exit)?
- What delivery plan, dated milestones and contractual commitments support each option's claims against 1 September 2027?

## Continuation notes

**First task next session (requested by Gunnar):** before anything else, add a short section on what each option means for Northwind's customer service team. No evidence on this has been collected yet, so gather it first (for example: order-status and order-history self-service, handling of price or stock queries, customer account administration, who supports the shop after launch, training) and keep supplier claims separate from verified results. [U3]

After that: confirm decision date, scope, mandatory requirements and weighting; add Ola's Composa integration findings; send a common supplier questionnaire and demo script covering the gaps above (especially Fram CMS commerce and the marketing workflow); get Northwind's price-list count; request a cost template with common assumptions. No owners or deadlines have been assigned for these research tasks.

As evidence arrives, record its source and date, distinguish supplier claims from verified results, update the option comparison and retain unresolved questions. Do not score missing evidence as confirmed capability. The December recommendation should show trade-offs, costs, risks, confidence and any conditions attached to the preferred option.

## Sources

- [U1] Ana, initial research request, 2 November 2026: three options and platform descriptions; Gunnar's request for a December steering group recommendation; analysis to continue over several sessions.
- [U3] Ana, report of her call with Gunnar Holm, 9 November 2026: design flexibility dropped as a criterion; Gunnar asked for a customer service section; Ola Nordmann to check the Composa integration this week.
- [F1] Kickoff notes, 28 October 2026 (Ana): customers, catalogue, launch, pricing/ERP, first-year budget and five agreed criteria (since reduced to four, see [U3]).
- [F2] Interview with Gunnar Holm, 29 October 2026: speed priority, same-tool content management and workshop reordering.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026: near-real-time Dynamics 365 price/stock reads for every option; two-person integration team.
- [F4] Interview with Lise Berg, procurement, 30 October 2026: fixed-price build and annually terminable licences.
- [F5] Market note from Cara, 30 October 2026: part-number ordering and 70% email/phone orders.
- [F6] Quote from Butikkskyen, 3 November 2026: licence 600,000 NOK a year; partner build about 900,000 NOK; standard Dynamics 365 connector included; B2B Pricing app included in licence.
- [F7] Quote from Composa, 4 November 2026: licence 900,000 NOK a year; build about 1.8 million NOK, frontend included; no standard Dynamics 365 connector, integration through Composa's API.
- [F8] Fram CMS, 4 November 2026: commerce module 300,000 NOK a year; build about 1.2 million NOK; marketing keeps working in Fram.
- [F9] Reference call with Agder Maskin (Butikkskyen customer), 5 November 2026: live in four months; customer-specific prices worked via B2B Pricing app, with workarounds above 2,000 price lists.
- [F10] Reference call with Vestlandsdeler (Composa customer), 6 November 2026: launched after nine months; integration took longer than planned. (Its "very flexible" comment is not used, as design flexibility is no longer a criterion.)
- [W1] [Website relaunch](website-relaunch/website-relaunch.md), existing wiki page read 2 November 2026: separate website schedule/budget and vendor API migration risk. Page includes a status dated 15 October; commerce applicability not verified.


===== acme/northwind/commerce-internal-follow-up.md =====
# Commerce analysis: internal follow-up for Ana

Internal working note, separate from the research brief and steering group material. Do not copy this context into those documents.

## Next session reminders

1. **Do first:** add a short section to the research brief on what each option means for Northwind's customer service team. Gunnar asked for it, and Ana asked that it come before anything else next time. Status: pending. [U3]
2. Remind Ana to ask Composa for a second reference customer. Status: pending. [U2]
3. Add Ola's findings on the Composa integration (he is checking this week) to the brief. Status: pending. [U3]

## Context and neutrality

Ana privately reported that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand, unverified context, not evidence of platform performance. Ana explicitly asked that it not color the analysis. Do not use it to score, penalize or rank Composa; evaluate all options against the agreed criteria and verified evidence. [U2]

Ana said on 9 November that she is leaning towards Composa but is worried about the integration. This is a personal leaning, not evidence; the brief stays neutral and evaluates all options on the same criteria and verified evidence. [U3]

## Sources

- [U2] Ana, private follow-up request, 2 November 2026: context excluded from the brief; reminder requested for the next session to ask Composa for a second reference customer.
- [U3] Ana, 9 November 2026: customer service section to be added first next session; Ola checking the Composa integration this week; Ana's leaning towards Composa and concern about integration.

