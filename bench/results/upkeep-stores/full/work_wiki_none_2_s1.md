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


===== acme/northwind/spare-parts-commerce.md =====
# Spare parts shop: commerce platform research brief

Status: research started; no recommendation or platform scores yet.
Last updated: 2 November 2026.
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

The five criteria below were agreed at kickoff. No numeric weights or scoring scale have been agreed. Gunnar's emphasis on speed should inform the discussion of weighting, not be treated as an approved weighting. [F1], [F2]

| Agreed criterion | Proposed evidence to collect (research plan, not findings) |
| --- | --- |
| Time to market | Credible delivery plan to 1 September 2027, implementation scope, dependencies, integration effort, testing and contingency. |
| Cost over three years | Comparable quotes covering build, licences, hosting, integration, support, maintenance and upgrades; assumptions, exclusions and exit costs. Check first-year spend separately against 2.5 million NOK. |
| Fit with Dynamics 365 | Demonstration of customer-specific pricing and near-real-time price/stock reads; API approach, latency, failure handling and ongoing load on the two-person team. |
| Ease of use for marketing | Demonstration of shop content editing alongside website content, roles, publishing and duplication of work. |
| Design flexibility | Ability to deliver the intended shop experience and website consistency; implementation effort and constraints. |

Additional checks derived from stakeholder evidence, not additional agreed weighted criteria: part-number ordering, quick repeat orders, fixed-price build terms and annual licence termination. [F2], [F4], [F5]

Proposed comparison method: first test feasibility against the launch date, first-year budget and mandatory Dynamics 365 requirements; then compare the five criteria with agreed weights. Confirm the status of marketing and procurement requirements before treating them as pass/fail gates. This method remains a proposal.

## Options and current evidence

Platform descriptions below come from Ana's initial brief, not independent vendor validation. [U1]

| Option | Known description | Key points to establish; not findings |
| --- | --- | --- |
| A. Butikkskyen | SaaS shop platform. | Dynamics 365 integration and customer pricing; content workflow with Fram; design limits; delivery timeline; three-year cost and annual termination terms. |
| B. Composa | Headless commerce engine with its own frontend. | Frontend/content workflow and relationship to Fram; integration and operating responsibilities; delivery effort; cost and contractual terms. |
| C. Fram CMS commerce | Commerce module of Fram CMS, which runs Northwind's new website. | Whether marketing really can manage both in the same tool; maturity for B2B spare parts, pricing and reordering; Dynamics 365 integration; delivery effort, cost and terms. |

No platform-specific evidence yet establishes compliance, relative speed, price or overall superiority. In particular, shared CMS branding is not proof that option C meets the content workflow or integration requirements.

## Open questions and next research

### Decision and scope
- What is the December steering group date, and when must the recommendation and supporting material be ready? Who approves the choice?
- How should the five agreed criteria be weighted? Which requirements are mandatory versus preferences?
- What is the minimum launch scope: dealer/workshop login and permissions, part-number search or bulk entry, repeat orders, checkout, payment/invoicing, order history and fulfilment?
- What measurable outcomes should the shop achieve? Does Northwind have a target for shifting email/phone orders online? The current 70% is a baseline, not a target. [F5]

### Integration and capacity
- Which Dynamics 365 product/version, APIs and existing integrations are available?
- What does “near real time” mean in seconds or minutes? What are acceptable caching, stale-data and outage behaviours?
- How are customers mapped to accounts and price agreements? What are expected traffic, order volumes and peak loads?
- Does scope also include orders flowing back to Dynamics 365, order status or other data? These flows are not specified in the current evidence.
- How much capacity can the two-person integration team commit, and who will own support and upgrades?

### Platform and user validation
- Can each supplier demonstrate a customer-specific price/stock lookup, part-number order and quick reorder using realistic data?
- Can marketing demonstrate the required editing workflow for each option? Is a single tool mandatory, or would an integrated workflow suffice?
- What design requirements must be met, and what can be reused from the website?
- Are website rollout dependencies, Fram API limits or other technical constraints relevant to this shop? The website wiki records a vendor API limit of 10 requests/second affecting migration; its relevance to commerce is unverified, and it must not be assumed to apply to all shop integrations. [W1]

### Commercial and delivery validation
- Will suppliers commit to a fixed-price build with clear scope, exclusions and change control, and licences terminable yearly?
- What does the first-year budget include beyond licences and build, and when does “first year” start? What common three-year costing period and assumptions should all quotes use?
- What are the full implementation, recurring and exit costs for each option?
- What delivery plan, references, integration proof and contractual commitments support each option's claims?

## Continuation notes

Next suggested session: confirm decision date, scope, mandatory requirements and weighting; prepare a common supplier questionnaire/demo script and cost template. No owners or deadlines have been assigned for these research tasks.

As evidence arrives, record its source and date, distinguish supplier claims from verified results, update the option comparison and retain unresolved questions. Do not score missing evidence as confirmed capability. The December recommendation should show trade-offs, costs, risks, confidence and any conditions attached to the preferred option.

## Sources

- [U1] Ana, initial research request, 2 November 2026: three options and platform descriptions; Gunnar's request for a December steering group recommendation; analysis to continue over several sessions.
- [F1] Kickoff notes, 28 October 2026 (Ana): customers, catalogue, launch, pricing/ERP, first-year budget and five agreed criteria.
- [F2] Interview with Gunnar Holm, 29 October 2026: speed priority, same-tool content management and workshop reordering.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026: near-real-time Dynamics 365 price/stock reads for every option; two-person integration team.
- [F4] Interview with Lise Berg, procurement, 30 October 2026: fixed-price build and annually terminable licences.
- [F5] Market note from Cara, 30 October 2026: part-number ordering and 70% email/phone orders.
- [W1] [Website relaunch](website-relaunch/website-relaunch.md), existing wiki page read 2 November 2026: separate website schedule/budget and vendor API migration risk. Page includes a status dated 15 October; commerce applicability not verified.


===== acme/northwind/commerce-internal-follow-up.md =====
# Commerce analysis: internal follow-up for Ana

Internal working note, separate from the research brief and steering group material. Do not copy this context into those documents.

## Next session reminder

Remind Ana to ask Composa for a second reference customer. Status: pending. [U2]

## Context and neutrality

Ana privately reported that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand, unverified context, not evidence of platform performance. Ana explicitly asked that it not color the analysis. Do not use it to score, penalize or rank Composa; evaluate all options against the agreed criteria and verified evidence. [U2]

## Sources

- [U2] Ana, private follow-up request, 2 November 2026: context excluded from the brief; reminder requested for the next session to ask Composa for a second reference customer.

