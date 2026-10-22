===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work is the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

## Spare parts shop platform analysis

[Research brief](spare-parts-commerce.md): compare Butikkskyen, Composa and Fram CMS commerce for a recommendation to the steering group in December 2026. The shop targets launch on 1 September 2027 with a first-year budget of 2.0 million NOK (cut from 2.5 million on 20 November), separate from the website relaunch. [U1], [F1], [F18]

### Sources

- [U1] Ana, initial research request, 2 November 2026.
- [F1] Kickoff notes, 28 October 2026 (Ana); details recorded in the research brief.


===== log.md (record) =====
# Log

- 2026-11-30: Added a short Composa nightly-import alternative note to acme/northwind/spare-parts-commerce.md using [F19] (Ola, 27 Nov): 200,000 NOK estimate, prices up to a day old, conflicts with current near-real-time requirement; 2.9M year-one / 4.7M three-year subtotals if additional to build, still over budget; delivery duration unknown. Recommendation unchanged. Added source and updated index.md.

- 2026-11-23: Added the B2B Pricing app as a third-party dependency to the risks on slide 9 of acme/northwind/steering-group-presentation-outline.md, at Ana's request. No other slides changed.

- 2026-11-23: Revised the draft recommendation in acme/northwind/spare-parts-commerce.md to state the effect of [F14]–[F18] (preference for A stands; 15 Dec deadline, 450,000 NOK headroom and untested version 4/order status flagged; added a fallback if headroom proves too thin). Created acme/northwind/steering-group-presentation-outline.md (10 slides) and added it to index.md.

- 2026-11-23: Updated acme/northwind/spare-parts-commerce.md with [F14]–[F18]: first-year budget now 2.0M NOK; A recalculated on Kodeverket's fixed-price 1.1M build (1.55M year 1 / 2.45M over three years, 450,000 NOK headroom); B budget gaps restated; 3,100 price lists checked against the reference's 2,000 threshold and Butikkskyen's version 4 limit of 10,000 (supplier claim, untested); first customer-service evidence (300 calls a week); 15 December offer deadline flagged; added the pending Butikkskyen go-live scenario (about April 2027, indicative). Updated acme/northwind/overview.md, commerce-internal-follow-up.md and index.md.

- 2026-11-16: Updated acme/northwind/spare-parts-commerce.md with Gunnar's decided exclusion of Fram commerce due to December 2028 support end [U4], keeping historic evidence but closing C's active research and updating recommendation/escalation wording. A remains a conditional preference, not an award.
- 2026-11-16: Saved next-session request in the brief and acme/northwind/commerce-internal-follow-up.md: add an indicative Butikkskyen go-live line counting four months from a December decision, distinct from a supplier commitment [U4]. Updated index.md to reflect C's decided exclusion and pending scenario.

- 2026-11-16: Revisited B in acme/northwind/spare-parts-commerce.md using Ola's [F11] estimate, cost-overlap scenarios and sequential critical path; added consolidated comparison incorporating [F12]–[F13] and draft December steering-group recommendation conditionally preferring A, with pre-award validation gates, alternative dispositions, escalation and confidence limits. Updated status and index.md; no approved selection or numeric scoring.

- 2026-11-16: Updated acme/northwind/spare-parts-commerce.md: added requested customer-service section first (evidence still missing); incorporated [F11]–[F13], corrected one-store Butikkskyen costs, showed Composa integration cost/sequence with quote-overlap caveat, and flagged Fram's December 2028 commerce support end and unpriced transition within the three-year horizon. Refreshed preliminary assessment and next steps; no final recommendation or scores.
- 2026-11-16: Updated acme/northwind/commerce-internal-follow-up.md: customer-service section added but research pending; Ola's findings incorporated; second-reference reminder delivered, request unconfirmed. Private context remains separate from brief.
- 2026-11-16: Updated index.md to reflect the revised commerce brief and evidence through 12 November.

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

Status: updated 23 November 2026 with [F14]–[F18]: first-year budget cut to 2.0 million NOK, Kodeverket fixed-price build offer of 1.1 million NOK (valid until 15 December), Northwind's 3,100 price lists against Butikkskyen's version 4 limit of 10,000, and the first customer-service evidence. A's year-1 headroom is now 450,000 NOK. Draft December steering-group recommendation first added 16 November 2026. Recommend A. Butikkskyen as preferred platform, conditional on technical, workflow, cost and delivery validation before award. Do not select B under the current baseline. **Decided 16 November: Gunnar agreed to drop C. Fram CMS commerce because support ends in December 2028.** [U4], [F13] The preference for A remains a draft recommendation, not an approved selection; no numeric scores. Four criteria remain after design flexibility was dropped on 9 November.
Last updated: 30 November 2026: added [F19] nightly-import alternative under Composa; current near-real-time baseline and conditional preference for A unchanged.
Decision audience: Northwind steering group. Gunnar wants a recommendation in December 2026; exact meeting date to confirm. Kodeverket's fixed-price offer expires on 15 December 2026, so the meeting date matters: if it falls after 15 December, the offer must be extended or accepted conditionally. [U1], [F17]

## Decision question

Which platform should Northwind choose for its new spare parts shop: A. Butikkskyen or B. Composa? C. Fram CMS commerce was in the original shortlist but Gunnar agreed to drop it on 16 November 2026 because support ends in December 2028. Compare delivery feasibility, three-year cost and business fit, and prepare an evidence-backed recommendation for the December steering group. [U1], [U4], [F13]

## Goals and constraints

| Area | What we know | Source |
| --- | --- | --- |
| Customers and catalogue | Sell spare parts online to dealers and workshops; about 4,000 parts. | [F1] |
| Launch | Live by 1 September 2027. | [F1] |
| First-year budget | **2.0 million NOK** since 20 November, when management cut it from 2.5 million NOK (kickoff figure, including licences and build). Whether the cut changes what the budget includes is not stated; other cost inclusions need clarification. | [F18], [F1] |
| Pricing and stock | Customers have customer-specific prices; Microsoft Dynamics 365 is the ERP and holds prices and stock. Every option must read prices and stock from Dynamics 365 in near real time. Northwind has 3,100 customer-specific price lists. | [F1], [F3], [F15] |
| Integration capacity | Northwind's integration team has two people. | [F3] |
| Sponsor priority | Speed to market matters most to Gunnar. | [F2] |
| Marketing workflow | Gunnar wants marketing to manage shop content in the same tool as website content. Whether this is a mandatory requirement is not yet confirmed. | [F2] |
| Workshop experience | Workshops want to reorder in a few clicks. | [F2] |
| Procurement preferences | Procurement wants a fixed-price build and licences that can be ended yearly. Confirm whether these are mandatory acceptance conditions. Kodeverket has now offered a fixed-price build for A (see cost section); annual licence termination is still unconfirmed for every option. | [F4], [F17] |
| Current ordering behaviour | Dealers mostly order by part number; 70% of orders arrive by email and phone today. | [F5] |
| Customer service | Customer service takes about 300 calls a week about order status and prices, and wants customers to see order status themselves. Whether this is a mandatory shop requirement is not yet confirmed. | [F14] |

The shop launch and budget above are separate from the website relaunch, whose current wiki page records a 1 March 2027 launch and a 450,000 NOK budget. Do not merge the two project baselines. [W1]

## Evaluation criteria

Five criteria were agreed at kickoff [F1]. On 9 November Gunnar told Ana that design flexibility does not matter for Northwind, so it is dropped and **four criteria remain**. [U3] (This comes from Ana's report of her call with Gunnar; confirm with the steering group if the criteria need formal sign-off.) Evidence collected before the change, such as the Composa reference calling the platform "very flexible" [F10], is not used in the comparison.

No numeric weights or scoring scale have been agreed. Gunnar's emphasis on speed should inform the discussion of weighting, not be treated as an approved weighting. [F1], [F2]

| Agreed criterion | Proposed evidence to collect (research plan, not findings) |
| --- | --- |
| Time to market | Credible delivery plan to 1 September 2027, implementation scope, dependencies, integration effort, testing and contingency. |
| Cost over three years | Comparable quotes covering build, licences, hosting, integration, support, maintenance and upgrades; assumptions, exclusions and exit costs. Check first-year spend separately against the 2.0 million NOK budget (cut from 2.5 million on 20 November). |
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
| C. Fram CMS commerce — dropped | Commerce module of Fram CMS, which runs Northwind's new website. Excluded by Gunnar's agreement on 16 November 2026 because commerce support ends December 2028. [U4], [F13] |

**Decision record:** C is no longer under evaluation. Its evidence and comparison entries below are retained as decision rationale/history, not as an active alternative or outstanding validation task. The decision concerns the commerce module, not the website CMS. A remains conditionally preferred; Gunnar's agreement to drop C is not approval to award A. [U4]

## Implications for customer service — evidence still needed

Gunnar requested this section. [U3]

**First direct evidence (17 November):** Hanne Ruud, head of customer service, says the team takes about 300 calls a week about order status and prices, and wants customers to see order status themselves. [F14] This gives two concrete service needs to test against each option: (1) customers can see order status without calling; (2) customers can see their own prices. The 300 calls a week is a baseline, not a savings estimate: we do not know how many calls each option would remove, and no option has yet been shown to provide order-status self-service. Order status lives in Dynamics 365 and is not covered by any quote or by Ola's estimate, so it may be extra integration scope (see open questions). The 70% email/phone ordering baseline is a separate measure and does not show how much workload any option would remove. [F5], [F14]

The items below remain validation questions, not confirmed benefits or shortcomings.

| Option | What to investigate with customer service |
| --- | --- |
| A. Butikkskyen | Test order status visible to customers (the [F14] need), customer-specific price display, account administration, order history and quick reorders; establish who resolves pricing-app or connector exceptions, including any price-list workarounds. Connector and app evidence does not demonstrate these service workflows. [F6], [F9] |
| B. Composa | Test the same service workflows; define ownership and escalation for custom-integration failures and incorrect/stale prices or stock, plus training and post-launch support. Ola's integration estimate does not establish service capability. [F11] |
| C. Fram CMS commerce | Test the same workflows and establish how service support, training and continuity would be maintained through a partner-platform move before commerce-module support ends in December 2028. Scope and cost of that move are unknown. [F13] |

For all options, ask suppliers (for A, Butikkskyen and Kodeverket) to demonstrate order-status self-service fed from Dynamics 365 and customer-specific price display, and gather service-team input on account administration, assisted ordering, training and support ownership. Keep claims separate from demonstrated results; no service workload savings are quantified yet. [F14]

## Comparison against the criteria (preliminary, updated 23 November 2026)

Evidence types: **Quote/supplier statement** = [F6]–[F8], [F12], [F13], [F16], [F17]; **Reference** = one customer's account ([F9], [F10]); **Architect estimate** = Ola's integration assessment [F11], not a fixed-price commitment or tested delivery plan. No Northwind-data demo/test has been recorded. "No evidence" means not yet established, not a weakness. Numeric scores are deliberately not given because weights and scale are not agreed.

### Cost over three years

Planning subtotals use build + 3 × annual licence, with Composa's custom integration shown separately. These are not complete three-year costs: hosting, support, maintenance, upgrades and exit costs remain unpriced. Fram additionally needs an unpriced partner-platform transition within the horizon. [F13]

| | A. Butikkskyen (one store) | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Annual licence | 450,000 NOK (corrected) | 900,000 NOK | 300,000 NOK |
| Build | 1,100,000 NOK fixed price, Kodeverket, offer valid until 15 December (replaces the earlier approx. 900,000 NOK partner figure) | 1,800,000 NOK (approx.), frontend included | 1,200,000 NOK (approx.) |
| Custom Dynamics 365 integration | Standard connector included; other effort unpriced | 800,000 NOK estimate; confirm overlap with build quote | Unpriced/unknown |
| Year 1 planning subtotal | 1,550,000 NOK | 3,500,000 NOK if integration is additional | 1,500,000 NOK, excluding transition |
| Build + 3 licence years, plus stated integration estimate | 2,450,000 NOK | 5,300,000 NOK if integration is additional | 2,100,000 NOK arithmetic only; not a supported three-year solution cost |
| Against 2.0M first-year budget (since 20 Nov) | 450,000 NOK headroom (22.5% of budget) before omitted costs | 1,500,000 NOK over if integration is additional; even the original 2.7M is 700,000 NOK over | 500,000 NOK headroom before omitted costs; dropped, lifecycle risk unresolved |
| Sources | [F6], [F12], [F17], [F18] | [F7], [F11], [F18] | [F8], [F13], [F18] |

Update 23 November: A's figures now use Kodeverket's fixed-price build of 1.1M NOK [F17] instead of the earlier approximate 900,000 NOK, and all budget comparisons use the cut 2.0M NOK budget [F18]. Together these reduce A's year-1 headroom from 1,150,000 NOK (1.35M against 2.5M) to 450,000 NOK (1.55M against 2.0M). A stays within budget on current figures, but with much less room for unpriced items. B and C figures are unchanged apart from the budget comparison.

Notes:
- One store is the comparison assumption; confirm Northwind's store count. [F12] corrects the earlier 600,000 NOK licence: that price covered two stores. For one store the correction reduces year 1 by 150,000 NOK and three years by 450,000 NOK.
- Year 1 assumes a full annual licence and build/integration spend in the first budget year. Licence commencement, payment timing and budget coverage need confirming; [F1] leaves inclusions beyond licences and build unclear.
- Ola estimates 800,000 NOK for Composa's required custom integration. [F11] Treating this as additional to the 1.8M build is a conservative planning assumption, not a confirmed quote breakdown. Confirm overlap before approving a total; if fully included, the original 2.7M year-1 / 4.5M three-year subtotals apply. The reference's integration overrun remains a risk. [F7], [F10]
- Fram's December 2028 support end falls inside a three-year horizon from either early-2027 implementation or September-2027 launch. Its 2.1M arithmetic excludes partner-platform licences, migration/rebuild, retesting, training and potential dual running; it must not be ranked cheapest on a like-for-like supported basis. A transition-inclusive cost would have been needed for comparison; this is no longer an active research task after C was dropped. Support ending is not evidence that the module stops operating then. [F13], [U4]
- Kodeverket, described as Butikkskyen's partner, offers the build at a fixed price of 1.1M NOK, valid until 15 December. This is a supplier offer. The documents so far do not say whether Kodeverket is the partner behind the earlier ~900,000 NOK figure, or what the price includes (Dynamics 365 connector configuration, B2B Pricing app set-up for 3,100 price lists, testing, training, order-status display). The fixed price meets procurement's build preference only for the scope it covers; get the scope and change-control terms in writing. Neither this nor any other quote establishes annual licence termination. B's and C's build figures are approximate, not fixed. [F4], [F6], [F7], [F8], [F17]
- The budget cut and the build price rise partly offset each other's visibility: the 200,000 NOK build increase on A plus the 500,000 NOK budget cut take 700,000 NOK out of the headroom. Spend timing and what the 2.0M includes still need confirming with Gunnar. [F18]

### Time to market (launch 1 September 2027)

| Option | Evidence | Source |
| --- | --- | --- |
| A | Reference customer Agder Maskin went live in four months. One customer; its scope and complexity are not recorded. | [F9] |
| B | Ola estimates four months for the custom Dynamics 365 integration **before shop work can start**. Reference customer Vestlandsdeler took nine months overall, including an integration overrun. | [F11], [F10] |
| C | No initial delivery estimate. Commerce support ends December 2028; Fram recommends moving to a partner platform. | [F13] |

Reading: a December decision and early-January 2027 start leave about eight months to 1 September. Composa's four-month prerequisite would leave roughly four months for shop work, end-to-end testing and contingency. This is a major schedule risk, not proof that launch is impossible; get a dated sequential plan and resource commitments. Do not add four months to the reference's nine months: that reference already included integration and is not Northwind's shop-build estimate. Butikkskyen's four-month reference suggests a potentially better fit but does not establish Northwind's delivery time. Fram needs both a credible initial launch plan and a transition plan ahead of December 2028 (roughly 16 months after the target launch); the website CMS's support status is not established by the commerce-module notice. [F9]–[F11], [F13]

### Fit with Dynamics 365

| Option | Evidence | Source |
| --- | --- | --- |
| A | Quote: standard Dynamics 365 connector included. Customer-specific prices go through the B2B Pricing app, included in the licence. Reference: customer-specific prices worked via the app, but Agder Maskin needed workarounds above 2,000 price lists. Northwind has 3,100 price lists, above that threshold. Butikkskyen says that since version 4 (released October 2026) the app handles up to 10,000 price lists and the workarounds are no longer necessary. 3,100 is 31% of that limit. This is a supplier statement: no one has tested it with Northwind's data, and the reference's own experience predates it. Near-real-time price/stock reads not yet demonstrated. | [F6], [F9], [F3], [F15], [F16] |
| B | No standard connector; Ola confirms a required custom Dynamics 365 integration, estimated at 800,000 NOK and four months before shop work starts. Build/support ownership and capacity commitments from the two-person team or a partner remain open. Estimate does not demonstrate customer-specific pricing or near-real-time performance. Reference integration overran. | [F7], [F10], [F11], [F3] |
| C | No evidence on the Dynamics 365 integration, customer-specific pricing or near-real-time reads. | n/a |

### Ease of use for marketing

| Option | Evidence | Source |
| --- | --- | --- |
| A | No evidence on how shop content relates to Fram. | n/a |
| B | No evidence on content workflow. It has its own frontend (included in the build); the relationship to Fram is not established. | [F7], [U1] |
| C | Quote: "Marketing keeps working in Fram". This is a supplier claim and has not been demonstrated for shop content. | [F8] |

### Summary of what the evidence shows so far

- **A. Butikkskyen** is the strongest candidate for further validation: the strongest documented Dynamics 365 story (connector and pricing app included), fastest reference delivery (four months), and one-store subtotals of 1.55M in year 1 / 2.45M over three years using Kodeverket's fixed-price build. That is within the 2.0M budget with 450,000 NOK headroom. The earlier price-list concern is largely addressed on paper: Northwind's 3,100 lists exceed the reference's 2,000-list workaround threshold, but Butikkskyen says version 4 handles 10,000 lists. That claim is untested. Open risks: verifying version 4 with Northwind's 3,100 lists, near-real-time performance, order-status and marketing workflows, what the fixed price includes, the 15 December offer deadline and unpriced costs against a thin headroom. This is not a final selection. [F6], [F9], [F12], [F15]–[F18]
- **B. Composa** has major feasibility risks: about 3.5M in year 1 / 5.3M over three years if Ola's 800,000 NOK estimate is additional, with four months of integration before shop work can begin. Confirm quote overlap; even the original year-1 subtotal exceeds budget. A viable budget and dated delivery plan are needed before it can be recommended. Only one reference is recorded. [F7], [F10], [F11]
- **C. Fram CMS commerce** retains the single-tool marketing claim, but its December 2028 support end and recommended partner move undermine the apparent low cost: the 2.1M subtotal excludes a transition within the three-year horizon. **Dropped by Gunnar's agreement on 16 November 2026 because of the support end; this is decided, not a conditional rejection.** Dynamics 365, pricing, reordering and initial delivery were unvalidated when it was dropped. This notice concerns the commerce module, not an established end of support for the whole website CMS. [F8], [F13], [U4]
- A now has a fixed-price build offer from Kodeverket (valid until 15 December); no option is yet shown to have annually terminable licences. The draft recommendation below conditionally prefers A; no approved selection or numerical scores exist. Feasibility gaps and the weighting of the four criteria remain unresolved. [F4]

## Reassessment of B. Composa

**Nightly-import alternative — added 30 November:** Ola estimates a nightly import of prices and stock at about **200,000 NOK instead of 800,000 NOK**, but shop prices could be up to a day old. [F19] This is a cheaper alternative integration approach, not removal of integration, and it **does not meet the current near-real-time price/stock requirement**. It is viable for reconsideration only if Northwind explicitly approves relaxing that requirement and accepts the stale-data risks; stock freshness also needs clarification. If the import is additional to the 1.8M build, planning subtotals become **2.9M NOK in year 1 / 4.7M over three years**, saving 600,000 NOK versus the additional-custom-integration scenario but still 900,000 NOK over the 2.0M first-year budget before omitted costs. Quote overlap remains unresolved; even the original 2.7M year-one subtotal exceeds budget. No delivery duration is given for this alternative, so do not carry over the four-month integration estimate or assume the launch risk is resolved. **Recommendation unchanged:** do not select B under the current baseline. [F3], [F7], [F11], [F18], [F19] The assessment below concerns the original near-real-time custom-integration approach.

Ola's estimate changes B from an unquantified integration risk to a material, costed prerequisite: custom Dynamics 365 work of approximately 800,000 NOK and four months **before** shop work begins. This is evidence of required effort, not evidence that Composa cannot technically meet Northwind's needs. Customer-specific pricing, latency and failure handling remain untested. [F3], [F11]

- **Budget:** on the additional-integration assumption, 1.8M build + 0.8M integration + 0.9M licence = **3.5M NOK in year 1**, 75% above the 2.0M budget (cut on 20 November; it was 40% above the earlier 2.5M) before omitted costs. Over three years, 1.8M + 0.8M + 3 × 0.9M = **5.3M NOK**, 2.85M more than A's 2.45M subtotal. Even if all integration is included in the build quote, B remains at 2.7M in year 1, 700,000 NOK over budget, and 4.5M over three years. Partial overlap lies between these scenarios. Reconcile scope and payment timing rather than treating 3.5M as an agreed fixed price. [F1], [F6], [F7], [F11], [F12]
- **Critical path:** with a January start, integration would occupy roughly January–April, leaving May–August for shop implementation, testing, acceptance and contingency. No Northwind shop-build duration or committed resources have been supplied. The nine-month reference reinforces concern but must not be added to Ola's four months; it includes its own integration. B's date is therefore unsubstantiated and high-risk, not demonstrably impossible. [F10], [F11]
- **Operating burden:** custom integration creates a build and maintenance responsibility that must be assigned and resourced against the two-person integration team's capacity. No evidence yet establishes that the team has capacity or that a partner will own it. A's standard connector is a relative advantage, not proof of zero integration effort. [F3], [F6], [F7], [F11]
- **Countervailing benefits:** B's frontend is included, but marketing's relationship to Fram is unproven. There is no demonstrated advantage against the remaining criteria sufficient to justify the present cost and schedule exposure. Design flexibility is excluded by agreement and cannot be used to offset those risks. Missing evidence is not a finding that B lacks capability. [F7], [U3]

**Disposition:** do not recommend B under the current budget and launch baseline. Reconsider only with a reconciled, acceptable commercial offer (or an explicitly approved budget change), a credible sequential delivery plan to 1 September 2027, committed integration/support ownership and demonstrated business workflows. Obtain a second comparable reference. This is a project-fit judgment, not a general rejection of Composa. [F1], [F3], [F7], [F10], [F11]

## Draft recommendation — December steering group

**Draft preference for A, first drafted 16 November 2026 and updated 23 November 2026 with [F14]–[F18]; no award approved. C's exclusion was decided by Gunnar's agreement on 16 November.** [U4] The new evidence strengthens A's Dynamics 365 case (3,100 price lists against a stated 10,000 limit) and gives it a fixed-price build, but the budget cut leaves only 450,000 NOK headroom. The preference stands, with three points the steering group must see: the 15 December offer deadline, the thin headroom, and that version 4 and order status are untested. This is a qualitative recommendation using the four remaining criteria and current feasibility evidence, not an agreed weighted score. A presentation outline is in [steering-group-presentation-outline.md](steering-group-presentation-outline.md). C's column is retained below solely as the rationale for its exclusion.

### Proposed decision

**Select A. Butikkskyen as the preferred platform, conditional on validation and commercial/delivery sign-off before contract award. Do not authorize an unconditional purchase yet.** It offers the best evidenced route to the September 2027 launch within the stated budget: a standard Dynamics 365 connector and pricing app (version 4 handles up to 10,000 price lists against Northwind's 3,100), a four-month customer reference, a fixed-price build offer, and a one-store subtotal of 1.55M NOK in year 1 / 2.45M over three years against the 2.0M first-year budget. These are supplier/reference signals, not a Northwind-tested solution or complete ownership cost. [F1], [F6], [F9], [F12], [F15]–[F18]

**Indicative go-live scenario for A (requested 16 November):** counting the four-month reference time [F9] from a December 2026 decision, Butikkskyen could go live around **April 2027**: mid-April if work starts on 15 December, the date Kodeverket's offer expires, or end of April if it starts at the end of December. If work only starts in early January, as assumed elsewhere in this brief, the scenario is early May 2027. Either way it leaves roughly four months before 1 September 2027. This is a reference-based scenario, not a supplier commitment or delivery forecast. It rests on one customer's four months, and Agder Maskin's scope is not recorded. Confirm an immediate start, partner resources and Northwind's scope, including order status and 3,100 price lists, before relying on it. [F9], [F15], [F17]

### Comparative rationale

| Criterion | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
| --- | --- | --- | --- |
| Time to market | Most encouraging evidence: four-month reference; Northwind plan still required | Four-month integration prerequisite; remaining shop schedule unproven and reference took nine months | Initial delivery unproven; support ends December 2028, adding an early transition |
| Three-year cost | 2.45M NOK planning subtotal with fixed-price build; 1.55M year 1 leaves 450,000 NOK against the 2.0M budget for unpriced items | 5.3M if integration additional; 4.5M if fully included. Year 1 (3.5M or 2.7M) exceeds the 2.0M budget in either scenario | 2.1M quoted arithmetic omits a transition inside the horizon; supported cost unknown |
| Dynamics 365 fit | Connector/app and one pricing reference are strongest evidence; version 4 claim (10,000 lists) covers Northwind's 3,100 on paper, but volume and near-real-time behaviour are untested | Required custom integration is estimated, not demonstrated; ownership/capacity unresolved | No integration evidence recorded |
| Marketing ease | Workflow alongside Fram unknown | Workflow alongside Fram unknown | Same-tool supplier claim, offset by module lifecycle; no demonstrated workflow |
| Evidence | [F6], [F9], [F12], [F15]–[F18] | [F7], [F10], [F11], [F18] | [F8], [F13] |

A is preferred for feasibility and relative evidence, **not** because it is cheapest on every raw quote or already proven on every requirement. C's lower arithmetic subtotal is not comparable without migration costs. No current evidence establishes a marketing advantage for A; its workflow alongside Fram remains an award condition, but C's former same-tool claim is no longer an active option trade-off because C has been dropped. Gunnar's speed priority supports this direction but is not an approved numeric weight. [F2], [F8], [F13], [U4]

### Conditions before award to A

1. **Dynamics 365 acceptance:** Northwind has 3,100 customer-specific price lists, above the 2,000 at which the reference needed workarounds. Butikkskyen says version 4 (October 2026) handles up to 10,000 and removes the workarounds. Get this confirmed in writing and test version 4 with Northwind's real price lists and data. Test customer-specific prices and near-real-time stock/prices with realistic load, agreed latency, outage behaviour and escalation. Ask how much room above 3,100 lists remains for growth, and whether Agder Maskin (or another customer) runs a comparable volume on version 4. [F3], [F9], [F15], [F16]
2. **Dated delivery commitment:** obtain a scoped partner plan through 1 September 2027, including integration, testing, acceptance, training, resources and contingency. Confirm capacity rather than transferring the four-month reference directly to Northwind. [F1], [F3], [F6], [F9]
3. **Comparable costs and terms:** confirm one-store scope, full first-year budget inclusions and spend timing against the 2.0M cap; secure a priced three-year schedule covering hosting, apps, integration/configuration, support, maintenance, upgrades and exit. Get Kodeverket's written scope for the 1.1M fixed-price build (what is included, exclusions, change control, whether it covers order status and 3,100 price lists) and decide before its 15 December expiry, or obtain an extension or conditional acceptance if the steering group meets later. Seek annual licence termination; clarify whether it is mandatory before accepting deviations. The 450,000 NOK apparent headroom is not a contingency allocation or proof of budget compliance. [F1], [F4], [F6], [F12], [F17], [F18]
4. **Marketing and business acceptance:** decide whether same-tool content management is mandatory; demonstrate and obtain acceptance of A's workflow alongside Fram. Validate part-number ordering and quick reorder with dealer/workshop users. Also validate customer-visible order status and prices, the need behind customer service's roughly 300 calls a week, plus account/order-support workflows, training and support ownership. No quantified service savings are claimed. [F2], [F5], [F14], [U3]

### Alternatives and escalation

- **B:** do not select on current evidence. Reopen only after the budget, sequential schedule, integration ownership and workflow conditions in the reassessment above are satisfied. [F7], [F10], [F11]
- **C — exclusion decided:** Gunnar agreed on 16 November 2026 to drop Fram's commerce module because support ends in December 2028. Do not continue module validation or transition-plan research as a condition for retaining C. The decision does not concern the website CMS. [U4], [F13]
- **If A's headroom proves too thin:** the 450,000 NOK between A's 1.55M year-1 subtotal and the 2.0M budget must cover hosting, support, order-status work and contingency, none of which is priced. If validation shows these exceed the headroom, the steering group needs to decide on a budget change or a scope cut. Do not switch to B, which is further over budget. [F18]
- **If A fails a mandatory gate:** return to the steering group with the failed condition and revised alternatives. Do not default automatically to B or reopen dropped C. Any budget, launch-date or mandatory-workflow trade-off needs explicit approval; any new partner-platform option would be a separate scope decision and require its own validation.

**Confidence:** moderate in A as the preferred direction, limited in unconditional delivery/cost commitments until validation. Evidence comprises approximate quotes, one reference each for A/B, Ola's estimate and Fram's support notice; no Northwind-data acceptance tests are recorded. Before the December meeting, confirm the meeting date, assign validation owners/deadlines and close or explicitly escalate the award conditions. Those owners and deadlines are not yet agreed.

## Open questions and next research

### Decision and scope
- What is the December steering group date, and when must the recommendation and supporting material be ready? Who approves the choice?
- How should the four remaining criteria be weighted? Which requirements are mandatory versus preferences?
- What is the minimum launch scope: dealer/workshop login and permissions, part-number search or bulk entry, repeat orders, checkout, payment/invoicing, order history and fulfilment?
- What measurable outcomes should the shop achieve? Does Northwind have a target for shifting email/phone orders online? The current 70% is a baseline, not a target. [F5]

### Integration and capacity
- Which Dynamics 365 product/version, APIs and existing integrations are available?
- Ola's check is received: 800,000 NOK and four months before shop work. Confirm estimate scope, confidence, ownership, staffing and dependencies; reconcile it with the 1.8M build quote and get a dated end-to-end launch plan. [F11], [F7]
- What does "near real time" mean in seconds or minutes? What are acceptable caching, stale-data and outage behaviours?
- Answered: Northwind has 3,100 customer-specific price lists, above Butikkskyen's earlier 2,000-list workaround threshold [F15], [F9]. Still open: does version 4's 10,000-list capacity hold up in a test with Northwind's data, and how many lists will Northwind need in future? [F16]
- How are customers mapped to accounts and price agreements? What are expected traffic, order volumes and peak loads?
- Does scope also include orders flowing back to Dynamics 365, order status or other data? Customer service wants customers to see order status themselves [F14], so order-status data flowing from Dynamics 365 to the shop is likely in scope, but no quote or estimate covers it. Is it in the minimum launch scope, and what would it cost and take for A and B?
- How much capacity can the two-person integration team commit, and who will own support and upgrades? For Composa, who builds and maintains the API integration, and is it included in the 1.8M? [F7]

### Platform and user validation
- Can each supplier demonstrate a customer-specific price/stock lookup, part-number order and quick reorder using realistic data?
- Can marketing demonstrate the required editing workflow for each option, especially Butikkskyen and Composa alongside Fram? Is a single tool mandatory, or would an integrated workflow suffice?
- Fram commerce research is closed following Gunnar's agreement to drop C; no further module demos, references or transition quotes are required for this comparison. Continue validating A/B alongside the website CMS, whose support end has not been established by the commerce notice. [U4], [F13]
- Are website rollout dependencies, Fram API limits or other technical constraints relevant to this shop? The website wiki records a vendor API limit of 10 requests/second affecting migration; its relevance to commerce is unverified, and it must not be assumed to apply to all shop integrations. [W1]
- Get comparable references: only one reference each for A and B and none for C. What were their scopes, catalogue sizes, and what caused delays or workarounds? [F9], [F10]

### Commercial and delivery validation
- Kodeverket has offered a fixed-price build for A [F17]. Is Kodeverket the partner behind the earlier ~900,000 NOK figure, why is the price 200,000 NOK higher, and what is the scope, exclusions and change control? Will Composa commit to fixed price, and will any supplier terminate licences yearly?
- Does the 20 November budget cut to 2.0M NOK change what the budget includes or when the first year starts? Will management reconsider if the 15 December offer deadline or the validation work needs more than the 450,000 NOK headroom? [F18]
- What does the first-year budget include beyond licences and build, and when does "first year" start? What common three-year costing period and assumptions should all quotes use (hosting, support, upgrades, exit)?
- What delivery plan, dated milestones and contractual commitments support each option's claims against 1 September 2027?

## Continuation notes

The customer-service section was added on 16 November and received its first direct evidence on 23 November ([F14]: about 300 calls a week on order status and prices). Supplier demonstrations and service-team input on order-status self-service are still missing. Ola's integration findings are incorporated. [U3], [F11], [F14]

**Done 23 November:** the Butikkskyen go-live line requested on 16 November is in the draft recommendation, labelled an indicative reference-based scenario (about April 2027), not a supplier commitment. [U4], [F9]

Next: confirm decision date (before or after Kodeverket's 15 December expiry), store count, scope including order status, mandatory requirements and weighting; get Kodeverket's written scope for the fixed price; test Butikkskyen's version 4 price-list capacity with Northwind's 3,100 lists and validate marketing/service workflows; reconcile Composa's integration/build costs and obtain a feasible sequential schedule. C is dropped; do not request a Fram commerce transition plan. Send A/B a common questionnaire/demo script and cost template covering remaining gaps. Get comparable references. No owners or deadlines have been assigned for these research tasks. [U4]

As evidence arrives, record its source and date, distinguish supplier claims from verified results, update the option comparison and retain unresolved questions. Do not score missing evidence as confirmed capability. The December recommendation should show trade-offs, costs, risks, confidence and any conditions attached to the preferred option.

## Sources

- [U1] Ana, initial research request, 2 November 2026: three options and platform descriptions; Gunnar's request for a December steering group recommendation; analysis to continue over several sessions.
- [U4] Ana, 16 November 2026: Gunnar agreed today to drop Fram's commerce module because support ends in 2028; treat exclusion as decided. Next session, add a line to the recommendation on Butikkskyen's possible go-live counting four months from a December decision.
- [U3] Ana, report of her call with Gunnar Holm, 9 November 2026: design flexibility dropped as a criterion; Gunnar asked for a customer service section; Ola Nordmann to check the Composa integration this week.
- [F1] Kickoff notes, 28 October 2026 (Ana): customers, catalogue, launch, pricing/ERP, first-year budget and five agreed criteria (since reduced to four, see [U3]).
- [F2] Interview with Gunnar Holm, 29 October 2026: speed priority, same-tool content management and workshop reordering.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026: near-real-time Dynamics 365 price/stock reads for every option; two-person integration team.
- [F4] Interview with Lise Berg, procurement, 30 October 2026: fixed-price build and annually terminable licences.
- [F5] Market note from Cara, 30 October 2026: part-number ordering and 70% email/phone orders.
- [F6] Quote from Butikkskyen, 3 November 2026: originally stated licence 600,000 NOK a year (clarified by [F12] as two stores, not one); partner build about 900,000 NOK; standard Dynamics 365 connector included; B2B Pricing app included in licence.
- [F7] Quote from Composa, 4 November 2026: licence 900,000 NOK a year; build about 1.8 million NOK, frontend included; no standard Dynamics 365 connector, integration through Composa's API.
- [F8] Fram CMS, 4 November 2026: commerce module 300,000 NOK a year; build about 1.2 million NOK; marketing keeps working in Fram.
- [F9] Reference call with Agder Maskin (Butikkskyen customer), 5 November 2026: live in four months; customer-specific prices worked via B2B Pricing app, with workarounds above 2,000 price lists.
- [F10] Reference call with Vestlandsdeler (Composa customer), 6 November 2026: launched after nine months; integration took longer than planned. (Its "very flexible" comment is not used, as design flexibility is no longer a criterion.)
- [F11] Ola Nordmann, 11 November 2026: Composa requires custom Dynamics 365 integration; estimated 800,000 NOK and four months before shop work can start.
- [F12] Butikkskyen correction, 12 November 2026: 600,000 NOK annual licence was for two stores; one store costs 450,000 NOK a year.
- [F13] Fram CMS, 12 November 2026: support for the commerce module ends in December 2028; customers are advised to move to a partner platform.
- [F14] Hanne Ruud, head of customer service, 17 November 2026: about 300 calls a week about order status and prices; wants customers to see order status themselves.
- [F15] Ola Nordmann, 18 November 2026: Northwind has 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: since version 4 (released October 2026) the B2B Pricing app handles up to 10,000 price lists; the workarounds Agder Maskin needed are no longer necessary. Supplier statement, untested.
- [F17] Lise Berg, 19 November 2026: Butikkskyen's partner Kodeverket offers the build at a fixed price of 1.1 million NOK; offer valid until 15 December 2026.
- [F18] Gunnar Holm, 20 November 2026: management has cut the first-year budget to 2.0 million NOK.
- [F19] Ola Nordmann, 27 November 2026: a nightly import of prices and stock would cost about 200,000 NOK instead of 800,000 NOK, but prices in the shop could be up to a day old.
- [W1] [Website relaunch](website-relaunch/website-relaunch.md), existing wiki page read 2 November 2026: separate website schedule/budget and vendor API migration risk. Page includes a status dated 15 October; commerce applicability not verified.


===== acme/northwind/commerce-internal-follow-up.md =====
# Commerce analysis: internal follow-up for Ana

Internal working note, separate from the research brief and steering group material. Do not copy this context into those documents.

## Next session reminders

- **Done 23 November:** the Butikkskyen go-live line (about April 2027, counting four months from a December 2026 decision) is in the recommendation, labelled an indicative reference-based scenario, not a supplier commitment. [U4], [F9]
- **Time-sensitive:** Kodeverket's fixed-price offer (1.1M NOK) expires on 15 December 2026. Ask Ana for the steering group date; if it is after 15 December, an extension or conditional acceptance is needed. [F17]
- **Decided:** Gunnar agreed on 16 November to drop Fram's commerce module because support ends in 2028. Do not carry forward module validation or a transition quote as active work. A remains conditionally preferred, not awarded. [U4]

1. **Customer service:** section added on 16 November 2026. First direct evidence arrived on 23 November (about 300 calls a week on order status and prices, per Hanne Ruud [F14]). Supplier demos of order-status self-service and service-team input are still missing, and no savings are quantified. [U3], [F14]
2. Remind Ana to ask Composa for a second reference customer. Status: reminder delivered on 16 November 2026; request/response not confirmed. [U2]
3. Add Ola's findings on the Composa integration. Status: incorporated on 16 November 2026: 800,000 NOK estimate and four months before shop work; quote overlap, ownership and end-to-end schedule remain open. [F11]

## Context and neutrality

Ana privately reported that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand, unverified context, not evidence of platform performance. Ana explicitly asked that it not color the analysis. Do not use it to score, penalize or rank Composa; evaluate all options against the agreed criteria and verified evidence. [U2]

Ana said on 9 November that she is leaning towards Composa but is worried about the integration. This is a personal leaning, not evidence; the brief stays neutral and evaluates all options on the same criteria and verified evidence. [U3]

## Sources

- [U4] Ana, 16 November 2026: Gunnar agreed to drop Fram commerce because support ends in 2028; next session add Butikkskyen go-live scenario counting four months from a December decision.
- [F9] Agder Maskin reference call, 5 November 2026: Butikkskyen customer went live in four months; Northwind comparability unverified.

- [U2] Ana, private follow-up request, 2 November 2026: context excluded from the brief; reminder requested for the next session to ask Composa for a second reference customer.
- [U3] Ana, 9 November 2026: customer service section to be added first next session; Ola checking the Composa integration this week; Ana's leaning towards Composa and concern about integration.
- [F11] Ola Nordmann, 11 November 2026, supplied by Ana on 16 November: required custom Composa–Dynamics 365 integration estimated at 800,000 NOK and four months before shop work starts.


===== acme/northwind/steering-group-presentation-outline.md =====
# Steering group presentation outline: spare parts shop platform

Outline for the December 2026 steering group, 10 slides. Built from the [research brief](spare-parts-commerce.md), updated 23 November 2026 with [F14]–[F18]. Figures are planning subtotals from quotes and estimates, not Northwind-tested results. The meeting date is not confirmed. Kodeverket's offer expires on 15 December, so the date shapes slides 9 and 10.

## 1. Decision requested

- Recommendation: choose **Butikkskyen** as the preferred platform for the spare parts shop, **conditional** on validation and commercial sign-off before contract award.
- Why: the best-evidenced route to the 1 September 2027 launch within the 2.0M NOK first-year budget.
- What we ask today: agree the preference, agree the award conditions, and decide how to handle Kodeverket's 15 December offer deadline.
- This is a preference, not an unconditional purchase.

## 2. What the shop must do

- Sell spare parts (about 4,000 parts) online to dealers and workshops; live by 1 September 2027. [F1]
- First-year budget is **2.0M NOK**, cut from 2.5M on 20 November. [F18]
- Read customer-specific prices and stock from Dynamics 365 in near real time. Northwind has **3,100 price lists**. [F3], [F15]
- Today 70% of orders arrive by email and phone, and dealers mostly order by part number. [F5]
- Customer service takes about **300 calls a week** about order status and prices, and wants customers to see order status themselves. [F14]
- Integration capacity is a two-person team. [F3]

## 3. How we compared the options

- Four criteria: time to market, three-year cost, fit with Dynamics 365, ease of use for marketing. Design flexibility was dropped on 9 November. [U3]
- Options: **A. Butikkskyen** (SaaS shop platform) and **B. Composa** (headless engine with its own frontend).
- Fram CMS commerce was dropped by Gunnar's agreement on 16 November because commerce support ends December 2028. [U4], [F13]
- Evidence: supplier quotes, one reference customer each, and the integration architect's estimate. No Northwind-data tests yet.
- No numeric scores: weights have not been agreed, and speed is the sponsor's stated priority.

## 4. Time to market

- **A:** reference customer Agder Maskin went live in four months. Counting four months from a December decision gives an **indicative go-live around April 2027** (early May if work starts in January). That leaves about four months before 1 September. [F9]
- **B:** custom Dynamics 365 integration takes about four months **before shop work can start**. Its reference customer took nine months in total, with an integration overrun. [F10], [F11]
- Caveat: the A scenario is based on one reference, not a supplier commitment. A dated partner plan is a condition of award.

## 5. Cost: three years and first year against the 2.0M budget

| | A. Butikkskyen | B. Composa |
| --- | --- | --- |
| Build | 1.1M, **fixed price** (Kodeverket) | 1.8M approx. |
| Annual licence | 0.45M | 0.9M |
| Custom integration | Standard connector included | 0.8M estimate |
| Year 1 | **1.55M** | 2.7M–3.5M |
| Three years | **2.45M** | 4.5M–5.3M |
| Against 2.0M budget | **0.45M headroom** | 0.7M–1.5M over |

- B's range depends on whether the integration is inside the build quote; it is over budget either way. [F7], [F11]
- Excluded for both: hosting, support, maintenance, upgrades, exit costs and order-status work.
- A's headroom has narrowed from 1.15M to 0.45M because of the budget cut and the higher fixed build price. [F17], [F18]

## 6. Fit with Dynamics 365 and customer prices

- **A:** standard Dynamics 365 connector and B2B Pricing app are included in the licence. [F6]
- Price lists: the reference needed workarounds above 2,000 lists. Butikkskyen says version 4 (October 2026) handles up to 10,000, so Northwind's 3,100 fit on paper. [F9], [F15], [F16]
- That is a supplier claim. It must be tested with Northwind's real price lists and near-real-time stock reads.
- **B:** no standard connector; the integration is custom-built. Ownership and capacity in the two-person team are unresolved. [F3], [F11]

## 7. Business fit: marketing, dealers and customer service

- Marketing: the sponsor wants shop content managed in the same tool as the website. No evidence yet for A or B. Whether it is mandatory is to be decided. [F2]
- Dealers and workshops: part-number ordering and quick reorder must be demonstrated with real users. [F2], [F5]
- Customer service: customers seeing order status and prices themselves is the need behind the 300 weekly calls. No quote covers order-status display, so it may add scope and cost. [F14]
- We have not estimated how many calls the shop would remove.

## 8. Recommendation and confidence

- **Select A as preferred platform, conditional on the award conditions on the next slide.**
- **B:** not recommended under the current budget and launch baseline. Reconsider only with a reconciled offer or approved budget change, a credible sequential plan and committed integration ownership. This is not a rejection of Composa in general.
- Confidence: moderate in A as the direction; limited on delivery and cost commitments until validation.
- A is preferred for feasibility and relative evidence, not because it is proven on every requirement.

## 9. Conditions before award and key risks

1. **Dynamics 365 test:** version 4 with Northwind's 3,100 price lists and near-real-time stock and prices, confirmed in writing.
2. **Delivery commitment:** dated partner plan to 1 September 2027, with resources and contingency.
3. **Costs and terms:** written scope for the 1.1M fixed price (including order status and price-list set-up); confirm what the 2.0M budget includes; seek annual licence termination.
4. **Business acceptance:** marketing workflow, part-number and reorder flow, and order-status self-service.
- Risks: thin budget headroom (0.45M) for unpriced items; the 15 December offer deadline; untested version 4 claim; the B2B Pricing app is a third-party dependency, and customer-specific pricing for Northwind's 3,100 price lists runs through it.
- If A fails a mandatory gate, return to the steering group. Do not default to B.

## 10. Decisions and next steps

- Decisions requested: (1) agree A as preferred platform, conditional; (2) confirm which requirements are mandatory (same-tool marketing, annual licence termination, order status); (3) decide how to handle the 15 December offer: accept conditionally, or ask Kodeverket for an extension; (4) confirm what the 2.0M budget includes and who covers an overrun.
- Next steps: Kodeverket's written scope; Butikkskyen demonstration and price-list test; dated partner plan; service-team input on order status.
- Owners and deadlines: not yet assigned; propose them in the meeting.

## Notes for the presenter

- Open items to settle before the meeting: the meeting date relative to 15 December, Northwind's store count (one store assumed), and the weights for the four criteria.
- Slide 5 uses the one-store licence of 450,000 NOK. [F12]
- Keep supplier claims ([F16], [F17]) and references ([F9], [F10]) labelled as such on the slides.

## Sources

- Research brief: [spare-parts-commerce.md](spare-parts-commerce.md), updated 23 November 2026, which lists [U1], [U3], [U4] and [F1]–[F18].
- [F14] Hanne Ruud, 17 November 2026; [F15] Ola Nordmann, 18 November 2026; [F16] Butikkskyen, 19 November 2026; [F17] Lise Berg, 19 November 2026; [F18] Gunnar Holm, 20 November 2026.

