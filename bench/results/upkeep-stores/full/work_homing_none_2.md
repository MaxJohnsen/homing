===== Spare parts commerce — research brief =====
# Spare parts commerce — research brief

Decision question: Which commerce platform should Northwind use for its new spare parts shop? Active options are A — Butikkskyen, a SaaS shop platform, and B — Composa, a headless commerce engine with its own frontend. C — Fram CMS commerce module was dropped by agreement with Gunnar on 16 November 2026 because support ends in December 2028; retain its research as historical evidence, not an active option. The website CMS is not removed by this decision. Shortlist descriptions are not verified capabilities.

Gunnar wants a platform recommendation for the steering group in December 2026; the exact meeting and recommendation deadline remain to be confirmed.

Northwind's spare parts shop is intended to sell online to dealers and workshops.

The planned spare parts catalogue is approximately 4,000 parts.

The spare parts shop's target go-live is 1 September 2027.

Spare parts customers have customer-specific prices.

Microsoft Dynamics 365 is Northwind's ERP and holds prices and stock.

F18 — Gunnar Holm, 20 November 2026: management has cut the first-year spare parts shop budget to NOK 2.0 million, down from NOK 2.5 million. Assumed to still cover licences and build, as before; confirm that scope and what else (hosting, internal effort, tax, contingency) must fit inside it.

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

## 2026-11-23 Updated platform recommendation — for review, not an approved selection

**Recommendation:** Northwind should take **option A, Butikkskyen, built by Kodeverket**, forward to final validation and commercial negotiation. It should not yet authorise the build or sign a contract. Option B, Composa, is not recommended under the NOK 2.0M first-year budget. Option C, Fram commerce, was removed by Gunnar's decision on 16 November 2026, because support ends in December 2028. The website CMS is unaffected.

**Why A**
- *Cost (F12, F17, F18):* Year 1 is NOK 1.55M (1.1M fixed build + 0.45M one-store licence), NOK 0.45M inside the NOK 2.0M budget. Three-year subtotal is NOK 2.45M.
- *Composa (F7, F11 Ola):* Year 1 is NOK 3.5M, NOK 1.5M over budget. Three-year subtotal is NOK 5.3M.
- *Pricing scale (F15, F16):* Northwind has 3,100 price lists. Butikkskyen says version 4 supports up to 10,000 without workarounds. This is a vendor claim.
- *Dynamics 365 (F6):* Standard connector and B2B Pricing app are claimed as included. Reconfirm for the one-store licence.
- *Time to market:* If a decision is made in December 2026 and implementation starts immediately, a four-month delivery scenario points to April 2027. This uses one reference customer's duration (F9), not a confirmed Northwind delivery commitment; validate scope, capacity, integration and testing. 1 September 2027 remains the agreed target.
- *Customer service (F14):* About 300 calls a week concern order status and prices. Self-service could reduce them, but this is not demonstrated and no saving can be quantified yet.
- *Composa timing:* Composa's four-month integration prerequisite would delay any relief.

**Conditions before commitment**
1. Version 4 demonstration with about 3,100 price lists, with near-real-time Dynamics 365 prices and stock.
2. Kodeverket's written scope and resourced plan to 1 September 2027. Scope should cover connector, price-list set-up and order status.
3. Order-status self-service shown against Dynamics 365.
4. Licence terms: yearly termination and what the one-store licence includes.
5. Marketing workflow shown, and whether same-tool authoring with the website is mandatory.
6. Budget scope confirmed: what must fit inside NOK 2.0M besides licence and build (hosting, internal effort, tax, contingency).
7. Kodeverket's 15 December offer expiry aligned with the steering group date, or extended.

**Fallback:** If A fails validation, reopen the decision. Do not automatically select B. A Fram partner platform would be a new option needing its own evaluation.

**Limits:** Costs are licence and build subtotals, not full TCO. All vendor statements are unverified. No criterion weights or scores are agreed. Gunnar's stated priority is speed to market.

Supersedes the 16 November draft recommendation. Evidence: F6–F9, F11–F18.

Decision, 16 November 2026, reported by Ana: Gunnar agreed to drop option C, Fram CMS's commerce module, because support ends in December 2028. Its removal is decided, not merely an analyst recommendation. A — Butikkskyen and B — Composa remain under consideration; no platform selection has been approved. This decision concerns the commerce module, not the website CMS.

F14 — Hanne Ruud, head of customer service, 17 November 2026: customer service takes about 300 calls a week about order status and prices. Customer service wants customers to be able to see order status themselves. This is a baseline and a stated wish, not a measured saving; the split between status and price calls is not known. Order-status self-service is not one of the four evaluation criteria and is not yet checked against any option (it needs order data from Dynamics 365).

F15 — Ola Nordmann, 18 November 2026: Northwind has 3,100 customer-specific price lists. This is above the 2,000 level where Agder Maskin needed workarounds on Butikkskyen's B2B Pricing app (F9), so the F9 concern applies to Northwind. It resolves the earlier open question about Northwind's price-list count.

F16 — Butikkskyen, 19 November 2026: since version 4, released in October 2026, the B2B Pricing app handles up to 10,000 price lists, and the workarounds Agder Maskin needed are no longer necessary. Vendor statement, unverified. Northwind's 3,100 price lists (F15) are within this limit. Agder Maskin's experience (F9) predates version 4, so there is no reference yet running version 4 at this scale. Needs a demonstration or a reference using 3,000+ price lists, plus confirmation that Dynamics 365 price retrieval stays near real time at that volume.

F17 — Lise Berg, 19 November 2026: Butikkskyen's partner Kodeverket offers the Butikkskyen build at a fixed price of NOK 1.1 million. This replaces the earlier approximate NOK 900,000 build estimate (F6) for option A and meets procurement's wish for a fixed build price (F4) on the build side. Unconfirmed: whether Kodeverket is the partner behind the NOK 900k estimate, what the scope includes (connector set-up, B2B Pricing configuration with 3,100 price lists, order status), and Kodeverket's delivery timeline to 1 September 2027. Licence terms (yearly termination) are still unconfirmed.

Kodeverket's fixed-price offer (NOK 1.1 million, F17) is valid until 15 December 2026. The December steering group date is still unconfirmed; if the decision falls after 15 December, the offer must be extended or it lapses.

## 2026-11-23 Update after F14–F18 — draft, not an approved selection

**Budget (F18, NOK 2.0M first year):**
- A — Butikkskyen with Kodeverket's fixed build (F17): year 1 = 1.1M build + 0.45M licence (F12) = **NOK 1.55M**, NOK 0.45M inside budget. Three-year subtotal = 1.1M + 3×0.45M = **NOK 2.45M** (previously 2.25M). That headroom has to cover anything not yet priced (hosting, internal effort, tax, contingency).
- B — Composa: year 1 **NOK 3.5M**, NOK 1.5M (75%) over the cut budget; three-year subtotal NOK 5.3M, NOK 2.85M above A. Composa would need to cut its year-1 cost by more than 40% to fit. Not viable on present evidence.
- C — Fram commerce: already dropped (16 November decision).

**Dynamics 365 fit / pricing scale (F15, F16):** Northwind's 3,100 price lists are above the 2,000 level where Agder Maskin needed workarounds (F9), but within Butikkskyen's version 4 limit of 10,000 (F16). The concern is lower only if the vendor's claim holds; it is unverified, and Agder Maskin predates version 4. Validate with a demonstration using about 3,100 price lists or a version 4 reference.

**Customer service (F14):** about 300 calls a week on order status and prices. Butikkskyen could address this through self-service if order status and customer-specific prices are exposed from Dynamics 365. This is not demonstrated and is not yet in any option's scope. Composa's four-month prerequisite would delay any relief. No saving can be quantified until calls are split by status and price.

**Time to market:** A's four-month reference (F9) is not a Kodeverket commitment. Obtain Kodeverket's resourced plan to 1 September 2027.

**Timing risk:** the Kodeverket offer lapses on 15 December (F17); the steering group date is unconfirmed.

**Direction:** Butikkskyen (A) strengthens as the preferred candidate for final validation and negotiation. Its cost fits the lower budget and the price-list scaling concern is addressed on paper. The recommendation still rests on unverified vendor claims. Do not authorise a build or sign a contract before: version 4 scale demonstration, Kodeverket scope and timeline, order-status feasibility, yearly licence termination terms, marketing workflow validation and a confirmed budget scope.

Supersedes the cost and price-list points in the 16 November drafts. Evidence: F9, F12, F14–F18.

Ana, 23 November 2026: the B2B Pricing app is a third-party dependency of option A, Butikkskyen. Customer-specific pricing for Northwind's 3,100 price lists relies on it. Listed as a risk on slide 9 of the steering group outline.

F19 — Ola Nordmann, 27 November 2026: a nightly import of prices and stock for Composa would cost about NOK 200,000 instead of the NOK 800,000 custom integration estimate. Shop prices could be up to a day old. This is an estimated alternative, not an approved replacement for the near-real-time approach; no delivery duration was supplied.

### Composa — nightly-import alternative (F19), comparison addendum, 30 November 2026
Ola estimates nightly prices/stock imports at NOK 200k rather than NOK 800k, saving NOK 600k. With the existing NOK 1.8M build and NOK 900k annual licence (F7), this gives a year-one subtotal of **NOK 2.9M**, still **NOK 900k above the NOK 2.0M budget**, and a three-year subtotal of **NOK 4.7M**. Assumes import cost is one-off and additional to build; figures are not full TCO. Prices could be up to a day old, so this variant **does not meet the current near-real-time prices/stock requirement** (F3). It could only be reconsidered if that requirement is explicitly relaxed and stale-price/stock risks and handling are accepted; F19 is not such approval. Import delivery time, stock freshness/failure handling and order-status scope are unconfirmed; do not assume the earlier four-month integration prerequisite applies or is eliminated. This is a separate scenario, not a replacement of the original Composa baseline. The recommendation to prioritise A for final validation remains unchanged.
Evidence: F19 (item:0bada5e1-3f1c-49ae-afeb-7fedc96b9396); F7 (item:e04f573a-4924-4c57-bcbe-149dfc1bf513); F3 (item:4638e111-38d0-4e77-957c-ce981c6864eb); F18 (item:6dc0efc8-e160-4c4a-8a5d-7394dfe4eeb8).

===== Commerce analysis — private stakeholder context =====
# Commerce analysis — private stakeholder context

Ana reports that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand stakeholder context, not verified evidence about Composa's suitability for Northwind. Ana explicitly wants this kept out of the research brief and not to color the platform analysis.

Ana is leaning towards Composa (as of 9 November 2026) but is worried about the integration; Ola Nordmann will check it this week. Private stakeholder context, not evidence about the platforms.
