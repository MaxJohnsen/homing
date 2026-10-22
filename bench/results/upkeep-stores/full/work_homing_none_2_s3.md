===== Spare parts commerce — research brief =====
# Spare parts commerce — research brief

Decision question: Which commerce platform should Northwind use for its new spare parts shop? Active options are A — Butikkskyen, a SaaS shop platform, and B — Composa, a headless commerce engine with its own frontend. C — Fram CMS commerce module was dropped by agreement with Gunnar on 16 November 2026 because support ends in December 2028; retain its research as historical evidence, not an active option. The website CMS is not removed by this decision. Shortlist descriptions are not verified capabilities.

Gunnar wants a platform recommendation for the steering group in December 2026; the exact meeting and recommendation deadline remain to be confirmed.

Northwind's spare parts shop is intended to sell online to dealers and workshops.

The planned spare parts catalogue is approximately 4,000 parts.

The spare parts shop's target go-live is 1 September 2027.

Spare parts customers have customer-specific prices.

Microsoft Dynamics 365 is Northwind's ERP and holds prices and stock.

The first-year spare parts shop budget is NOK 2.5 million, including licences and build.

Four evaluation criteria apply: time to market; cost over three years; fit with Dynamics 365; ease of use for marketing. The kickoff (F1, 28 October 2026) agreed five; design flexibility was dropped on 9 November 2026 at Gunnar Holm's request (F11). Formal weights and scoring thresholds have not yet been supplied.

Gunnar Holm prioritises speed to market above other considerations; this is his stated priority, not an agreed numerical weighting.

Gunnar wants marketing to manage shop content in the same tool as the website.

Workshops want to reorder in a few clicks, as reported in Gunnar Holm's interview.

Ola Nordmann, integration architect, requires every option to read prices and stock from Dynamics 365 in near real time. A measurable latency target remains undefined.

Northwind's integration team consists of two people.

Procurement wants a fixed price for the shop build.

Procurement wants shop licences that can be ended yearly.

Dealers mostly order by part number, according to Cara's market note.

Cara's 30 October 2026 market note reports that 70% of orders currently arrive by email and phone; this is a baseline, not an agreed online adoption target.

## Research approach and open questions

Status: initial research brief, established 2 November 2026. No platform recommendation or comparative scores yet. The sourced items on this page are the evidence register; F1–F5 are user-supplied notes/interview summaries, not independently verified vendor evidence. Keep new findings attributed and distinguish facts, stakeholder preferences, hypotheses and unresolved questions.

### Evaluation framework — proposed operationalisation, not newly agreed criteria
| Agreed criterion (F1) | Evidence to collect for each option |
|---|---|
| Time to market | Credible delivery plan to the target launch, dependencies, available implementation capacity, integration and testing effort. Gunnar's priority (F2) should inform a weighting discussion, not an invented weight. |
| Cost over three years | Comparable build, licences, hosting, integration, support, maintenance, upgrades and exit costs; separate first-year budget compliance from three-year total cost. |
| Fit with Dynamics 365 | Demonstrated customer-specific pricing and stock retrieval; latency, API limits, failure behaviour, security and ongoing effort for the two-person integration team. |
| Ease of use for marketing | Demonstrate actual shop/website content workflows, permissions and preview; establish what 'same tool' means in practice. |
| Design flexibility | Demonstrate required shop journeys and ability to fit the new website design; quantify custom work and upgrade implications. |

Assess explicit launch, pricing and stock requirements separately from trade-offs. Confirm whether procurement's requested terms and Gunnar's same-tool preference are mandatory gates or negotiable preferences. Do not add reorder UX as an agreed sixth criterion without confirmation; test it as a business need and agree how it affects scoring.

### Options and research hypotheses — not findings
- **A — Butikkskyen:** SaaS shop platform. Test whether it can meet B2B pricing, near-real-time ERP and content-workflow needs within its extensibility and contractual limits. SaaS does not by itself establish faster delivery or lower cost.
- **B — Composa:** Headless commerce engine with its own frontend. Clarify what the supplied frontend includes, where content is authored, and who owns frontend/integration maintenance. Headless does not by itself establish superior flexibility or greater effort.
- **C — Fram CMS commerce module:** Part of the CMS used for the new website. Test whether it actually offers a shared editorial workflow and adequate B2B commerce/Dynamics integration. A common product family does not establish seamless integration or lowest cost.
- Vendor capabilities, delivery estimates, quotations, licence terms and reference implementations remain unverified for all three.

### Open questions
1. **Decision process:** What is the December steering-group date, submission deadline and decision authority? What weights and evidence thresholds will the group approve?
2. **Launch scope and success:** Which capabilities are essential on day one? What online adoption, order handling or customer-service outcomes define success? F5's 70% email/phone baseline is not an adoption target.
3. **B2B journeys:** How do dealer/workshop accounts, customer-specific price visibility, part-number search, quick order and repeat order work? Are bulk entry, account hierarchies, approvals, credit terms, payment or shipping rules required?
4. **Dynamics integration:** Which Dynamics 365 product/version and APIs are in use? What measurable latency and availability does 'near real time' require? How should stale data, outages, rate limits and order submission be handled? What capacity is actually available from the two-person team?
5. **Content and design:** Is one editorial tool mandatory, and for which content? What parts of the Fram website/design can or must be reused? What are the website/shop dependencies?
6. **Commercials:** What does the first-year budget cover beyond build and licences (e.g. tax, internal effort, support, hosting, contingency)? Can each vendor offer a fixed-price build and annual termination, on what notice/renewal terms? What are three-year costs and exit/data-export implications?
7. **Evidence per option:** Request the same scripted demonstrations, integration proof, delivery estimate, itemised costs and contractual evidence for A/B/C. Which requirements are native, configured, custom-built or unsupported?
8. **Operations:** Who owns support, monitoring, security, releases and integrations after launch? What service levels, accessibility and data/hosting requirements must be met?

### Suggested next session
Confirm the decision timetable, launch scope and must-have versus preferred requirements; agree criterion weights; then create a common evidence matrix and vendor question set. Add evidence and revise conclusions on this page rather than starting a separate brief each session.

### Source key
- F1: Kickoff notes, 28 October 2026 (Ana).
- F2: Interview with Gunnar Holm, 29 October 2026.
- F3: Interview with Ola Nordmann, integration architect, 29 October 2026.
- F4: Interview with Lise Berg, procurement, 30 October 2026.
- F5: Market note from Cara, 30 October 2026.
The source excerpts and individual factual claims are saved alongside this framework on this page.

F6 — Butikkskyen quote, 3 November 2026, with licence scope clarified by F12 on 12 November: the original NOK 600,000/year licence quote covers two stores, not one. Partner build is about NOK 900,000. A standard Dynamics 365 connector and the B2B Pricing app for customer-specific prices are included in the quoted licence. The corrected one-store licence is recorded separately under F12. Vendor statements remain unverified; fixed price, termination terms and inclusion of the same apps/connector in the one-store package need confirmation.

F7 — Composa quote, 4 November 2026: licence NOK 900,000 a year; build about NOK 1.8 million, frontend included. No standard Dynamics 365 connector: the integration goes through Composa's API. (Vendor quote, unverified; fixed price and termination terms not stated.)

F8 — Fram CMS, 4 November 2026: the commerce module costs NOK 300,000 a year; build about NOK 1.2 million. Marketing keeps working in Fram. (Vendor statement, unverified; Dynamics 365 integration approach and cost not stated.)

F9 — Reference call, Agder Maskin (Butikkskyen customer), 5 November 2026: went live in four months. Customer-specific prices worked through the B2B Pricing app but needed workarounds above 2,000 price lists. (One customer reference; how many price lists Northwind needs is not yet known.)

F10 — Reference call, Vestlandsdeler (Composa customer), 6 November 2026: described as very flexible; launched after nine months; the integration took longer than planned. (One customer reference; Ana has an open task to ask Composa for a second reference.)

## Customer service impact — implications to test, 16 November 2026
70% of orders currently arrive by email/phone (F5); no evidence yet quantifies workload reduction for any option. Validate part-number ordering and quick reordering, customer-specific prices, stock accuracy and exception handling with customer service.
- **A — Butikkskyen:** Potential for self-service ordering, conditional on Northwind-specific workflows. The reference's workarounds above 2,000 price lists (F9) could create manual exceptions if Northwind has comparable volumes; Northwind's price-list count is unknown.
- **B — Composa:** The four-month integration prerequisite (F11 Ola) increases the risk that current manual ordering persists longer. A custom integration needs clear support, monitoring and fallback ownership; no evidence establishes lower service workload.
- **C — Fram commerce:** Support ending December 2028 (F13) creates a migration/continuity risk, potentially requiring retraining and customer support through another transition. These are implications, not measured outcomes.

## Comparison against the four current criteria — draft, 16 November 2026
Four criteria remain following Gunnar's 9 November decision: time to market; three-year cost; Dynamics 365 fit; marketing usability. Design flexibility is not scored. No agreed numerical weights or scores. Source-label collision: **F11 Gunnar, 9 November** is the criteria/customer-service note; **F11 Ola, 11 November** is the integration assessment. Preserve both, qualified by author/date.

| Criterion | A — Butikkskyen | B — Composa | C — Fram CMS commerce |
|---|---|---|---|
| Time to market; target 1 September 2027 | One reference launched in four months (F9), not a Northwind commitment. | Ola estimates four months of integration before shop work starts (F11 Ola). No Northwind total delivery plan. The reference's nine months (F10) is a separate project, not a duration to add mechanically. | No delivery evidence. Support ends December 2028, only about 16 months after target launch; a partner migration would need planning. |
| Three-year cost; first-year budget NOK 2.5M | One-store licence NOK 450k/year (F12), build about NOK 900k (F6): year 1 **NOK 1.35M**; three years **NOK 2.25M**. Reduction versus previous comparison: NOK 150k in year 1 and NOK 450k over three years. | Licence NOK 900k/year + build NOK 1.8M (F7) + estimated integration NOK 800k (F11 Ola): year 1 **NOK 3.5M**, NOK 1M over budget; three years **NOK 5.3M**. Assumes integration is additional to build; confirm overlap and licence commencement. | Previous arithmetic remains year 1 NOK 1.5M, three years NOK 2.1M (F8), but **not a credible supported three-year option without a migration/replacement plan and its costs**. Support ends during the three-year period following target launch. |
| Dynamics 365 fit | F6 includes connector and B2B Pricing app; confirm these remain included in corrected one-store licence. Reference needed workarounds above 2,000 price lists (F9). Demonstrate Northwind's near-real-time pricing/stock requirements. | Custom integration required per Ola, with cost and sequential schedule estimates. No proven latency, resilience or support ownership; consider two-person integration-team capacity. | Still no integration approach or cost evidence; partner route would require its own evaluation. |
| Ease of use for marketing | No demonstrated workflow evidence. | Content-authoring workflow not established. | F8 says marketing remains in Fram, not demonstrated. Do not assume a partner platform preserves the same workflow. |

### Provisional direction, not a final selection
Prioritise **Butikkskyen for validation**, given corrected cost, included-connector claim and reference evidence. It is not yet proven to meet requirements. Composa needs an explicit budget exception/cost reduction and a credible sequential delivery plan. Recommend against starting a new build on Fram's commerce module as the long-term solution unless a supported, costed transition is justified. A Fram partner platform is a different solution to evaluate, not automatically equivalent to C.

### Boundaries and next evidence
Costs are indicative build/licence subtotals, not complete TCO. Composa includes Ola's estimated integration in the revised subtotal; hosting, support, maintenance, internal effort, contingency, tax treatment and exit/migration costs remain unpriced. Fram's integration is also unpriced. Confirm cost scope and first-year budget treatment. Fixed-price builds and yearly termination remain unconfirmed. Vendor-selected single references are not Northwind delivery commitments.

Next: validate Northwind's price-list count and Butikkskyen one-store package, near-real-time ERP behaviour, marketing and customer-service workflows; obtain Composa's dependency-based delivery plan, integration ownership and non-overlapping cost breakdown; obtain Fram's written support/migration details and costed partner alternatives; confirm procurement terms and December decision date; obtain second Composa reference. Evidence: F6–F10 on this page, F11 Gunnar (9 Nov), F11 Ola (11 Nov), F12 and F13 (12 Nov).

F11 — Call with Gunnar Holm, 9 November 2026 (reported by Ana): design flexibility is dropped as an evaluation criterion because, in his view, it does not matter for Northwind. Four criteria remain: time to market; cost over three years; fit with Dynamics 365; ease of use for marketing. This changes the five criteria agreed at the kickoff (F1). Gunnar also asked for a short section on what each option means for Northwind's customer service team, to come first in the next session's write-up. Ola Nordmann will check the Composa integration this week.

F11 (Ola Nordmann, 11 November 2026; distinct from F11 Gunnar, 9 November): Composa requires a custom integration with Dynamics 365. This is Ola's reported assessment, not demonstrated integration capability.

F11 (Ola Nordmann, 11 November 2026): Ola estimates the custom Composa–Dynamics 365 integration at NOK 800,000. Treat as an estimate, not a fixed-price commitment; confirm that this is additional to the F7 shop-build estimate.

F11 (Ola Nordmann, 11 November 2026): Ola estimates four months for Composa's custom Dynamics 365 integration, to be completed before shop work can start. This is a sequential prerequisite, not a total shop delivery estimate.

F12 — Butikkskyen correction, 12 November 2026: the licence for one store is NOK 450,000 per year; the previously quoted NOK 600,000 per year was for two stores. Use NOK 450,000/year for the one-store comparison.

F13 — Fram CMS, 12 November 2026: support for Fram's commerce module ends in December 2028. This statement concerns the commerce module, not necessarily the website CMS. Confirm the precise support-end date and contractual implications.

F13 — Fram CMS, 12 November 2026: Fram recommends customers move from its commerce module to a partner platform. No partner platform, migration scope, cost or delivery plan has yet been established for Northwind.

## 2026-11-16 Draft platform recommendation — for review, not an approved selection

### Customer service impact
No option has demonstrated workload savings. Today 70% of orders arrive by email/phone (F5). Butikkskyen could support self-service, but price-list workarounds could create manual exceptions. Composa's integration prerequisite risks delaying any move away from manual ordering; custom integration requires support/fallback ownership. Fram's December 2028 support end creates an additional migration and potential retraining/customer transition. Validate part-number ordering, quick reorder, price/stock accuracy and exception handling with customer service.

### Reassessment of B — Composa
Ola's 11 November assessment changes B from an unpriced integration risk to an estimated NOK800,000 custom integration and four-month prerequisite before shop work starts. Assuming this is additional to F7's NOK1.8M build, year 1 is NOK1.8M + NOK0.8M + NOK0.9M = **NOK3.5M**, or NOK1M/40% above the NOK2.5M budget before other unpriced costs. Three-year subtotal is NOK1.8M + NOK0.8M + 3×NOK0.9M = **NOK5.3M**, NOK3.05M above A's corrected subtotal. Confirm build/integration scope overlap and licence commencement.

The four months is a sequential dependency, not a total shop-delivery estimate. If integration starts in January 2027 after a December decision, shop work could start around May, leaving roughly four months to the 1 September target for shop build, testing and readiness. This is an illustrative planning scenario, not an agreed start date or proof that the target is impossible. F10's nine-month customer reference is a separate project: do not add it to Ola's estimate or use it as Northwind's build duration.

Custom integration may be technically feasible but is not proof of near-real-time fit. Validate latency, price/stock correctness, resilience, ownership, monitoring and capacity of the two-person integration team. Marketing usability remains unproven. The reference's flexibility does not offset these gaps under the four current criteria: design flexibility was dropped. On current evidence, do not recommend B for the existing budget and target; reconsider only with a credible funded delivery plan and evidence of benefits material to retained criteria.

### Updated four-criterion comparison
| Criterion | A — Butikkskyen | B — Composa | C — Fram commerce |
|---|---|---|---|
| Time to market | One reference: four months; Northwind delivery commitment still needed. | Four-month integration prerequisite, then shop work; full schedule unproven. | Delivery unknown; support ends December 2028, about 16 months after target launch. |
| Three-year cost | NOK2.25M subtotal; year 1 NOK1.35M, using NOK450k/year one-store licence and NOK900k build. | NOK5.3M subtotal including Ola's estimate; year 1 NOK3.5M, NOK1M over budget. | NOK2.1M old subtotal; year 1 NOK1.5M. Not a supported three-year solution cost: integration and migration/replacement unpriced. |
| Dynamics 365 fit | Included connector and B2B Pricing app claimed in F6; reconfirm for corrected one-store licence. Reference needed workarounds above 2,000 price lists. | Custom integration required; capability and support unproven. | Approach, capability and cost unknown; partner platform needs separate assessment. |
| Marketing usability | Unproven; test same-tool preference. | Content workflow unproven. | Vendor says marketing stays in Fram; not demonstrated and not necessarily retained on partner platform. |

No numerical weights or scores are agreed. Subtotals are not full TCO: hosting, support, maintenance, internal effort, contingency, tax treatment and exit/migration costs remain unresolved. Build quotes are approximate, and fixed-price build/yearly termination terms are unconfirmed.

### Draft recommendation
**Northwind should progress option A, Butikkskyen, as the preferred candidate for final validation and commercial negotiation, not yet authorise a build or sign a contract.** The corrected licence gives an indicative year-one subtotal of NOK1.35M and three-year subtotal of NOK2.25M. Its connector claim and reference provide a stronger current basis for validating delivery and ERP fit than B or C, but are not proof of compliance.

Before commitment: demonstrate Northwind-specific near-real-time prices/stock and pricing scale; confirm one-store package inclusions; validate customer-service journeys and marketing workflow (including whether same-tool authoring is mandatory); obtain a resourced plan to 1 September 2027, complete three-year costs, fixed-price build and annual termination terms.

Do not recommend Composa under the present budget and unproven schedule. Do not start a new Fram commerce build as the long-term solution given support ending during the operating horizon; evaluate a supported partner alternative separately if A fails validation. If A cannot meet critical requirements, reopen the decision rather than automatically select B or C. This is an evidence-based draft, not a stakeholder-approved selection. Qualified source keys: F11 Ola (11 November) is distinct from F11 Gunnar (9 November).

Decision, 16 November 2026, reported by Ana: Gunnar agreed to drop option C, Fram CMS's commerce module, because support ends in December 2028. Its removal is decided, not merely an analyst recommendation. A — Butikkskyen and B — Composa remain under consideration; no platform selection has been approved. This decision concerns the commerce module, not the website CMS.

===== Commerce analysis — private stakeholder context =====
# Commerce analysis — private stakeholder context

Ana reports that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand stakeholder context, not verified evidence about Composa's suitability for Northwind. Ana explicitly wants this kept out of the research brief and not to color the platform analysis.

Ana is leaning towards Composa (as of 9 November 2026) but is worried about the integration; Ola Nordmann will check it this week. Private stakeholder context, not evidence about the platforms.
