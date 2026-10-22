===== Spare parts commerce — research brief =====
# Spare parts commerce — research brief

Decision question: Which commerce platform should Northwind use for its new spare parts shop? Compare A: Butikkskyen, a SaaS shop platform; B: Composa, a headless commerce engine with its own frontend; and C: the commerce module of Fram CMS, which runs Northwind's new website. These descriptions establish the shortlist, not verified capabilities.

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

F6 — Butikkskyen quote, 3 November 2026: licence NOK 600,000 a year; build by a partner about NOK 900,000. A standard Dynamics 365 connector is included. Customer-specific prices need the B2B Pricing app, which is included in the licence. (Vendor quote, unverified; fixed price and termination terms not stated.)

F7 — Composa quote, 4 November 2026: licence NOK 900,000 a year; build about NOK 1.8 million, frontend included. No standard Dynamics 365 connector: the integration goes through Composa's API. (Vendor quote, unverified; fixed price and termination terms not stated.)

F8 — Fram CMS, 4 November 2026: the commerce module costs NOK 300,000 a year; build about NOK 1.2 million. Marketing keeps working in Fram. (Vendor statement, unverified; Dynamics 365 integration approach and cost not stated.)

F9 — Reference call, Agder Maskin (Butikkskyen customer), 5 November 2026: went live in four months. Customer-specific prices worked through the B2B Pricing app but needed workarounds above 2,000 price lists. (One customer reference; how many price lists Northwind needs is not yet known.)

F10 — Reference call, Vestlandsdeler (Composa customer), 6 November 2026: described as very flexible; launched after nine months; the integration took longer than planned. (One customer reference; Ana has an open task to ask Composa for a second reference.)

## Comparison against the four current criteria — draft, updated 9 November 2026 (evidence F6–F11; no weights or scores, none agreed yet)

Design flexibility was dropped as a criterion on 9 November (F11). Evidence already gathered on it: Composa reference called it "very flexible" (F10); Composa's build includes the frontend (F7); nothing on the others.

| Criterion | A — Butikkskyen | B — Composa | C — Fram CMS commerce |
|---|---|---|---|
| Time to market (target 1 Sep 2027, F1) | One reference went live in 4 months (F9). | One reference launched after 9 months; integration took longer than planned (F10). | No evidence yet. |
| Cost over three years (licence ×3 + build; quotes only) | Year 1: NOK 1.5M. 3 years: NOK 2.7M (F6). | Year 1: NOK 2.7M, which is NOK 0.2M over the NOK 2.5M budget (F1). 3 years: NOK 4.5M (F7). | Year 1: NOK 1.5M. 3 years: NOK 2.1M (F8). |
| Fit with Dynamics 365 | Standard connector included; customer-specific prices via the B2B Pricing app, included in the licence (F6). Reference: worked, but workarounds above 2,000 price lists (F9). | No standard connector; integration via Composa's API (F7). Reference integration overran (F10). Ola Nordmann is checking this week (F11). | Not stated; no evidence yet. |
| Ease of use for marketing | No evidence yet. | No evidence on where content is authored. | Vendor says marketing keeps working in Fram (F8); matches the same-tool preference (F2). Not yet demonstrated. |

Caveats:
- Quotes are unverified and "about"; fixed-price build and yearly-terminable licences (F4) are not confirmed by any vendor.
- Three-year totals exclude hosting, support, maintenance, internal effort and the Dynamics integration work, which differs by option (included connector for A, own API work for B, unknown for C). The gap between B and the others is therefore probably understated.
- The references are one customer each, chosen by the vendors, and say nothing about Northwind's volumes. Whether Northwind needs more than 2,000 price lists is not known.
- Fram (C) has no evidence on time or Dynamics fit, so it cannot be compared fairly yet.

Next evidence to collect: Ola's integration check on Composa; Fram's Dynamics 365 approach and delivery plan; Northwind's price-list count; fixed-price and termination terms from all three; a second Composa reference; customer service impact per option (requested by Gunnar, F11).

F11 — Call with Gunnar Holm, 9 November 2026 (reported by Ana): design flexibility is dropped as an evaluation criterion because, in his view, it does not matter for Northwind. Four criteria remain: time to market; cost over three years; fit with Dynamics 365; ease of use for marketing. This changes the five criteria agreed at the kickoff (F1). Gunnar also asked for a short section on what each option means for Northwind's customer service team, to come first in the next session's write-up. Ola Nordmann will check the Composa integration this week.

===== Commerce analysis — private stakeholder context =====
# Commerce analysis — private stakeholder context

Ana reports that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand stakeholder context, not verified evidence about Composa's suitability for Northwind. Ana explicitly wants this kept out of the research brief and not to color the platform analysis.

Ana is leaning towards Composa (as of 9 November 2026) but is worried about the integration; Ola Nordmann will check it this week. Private stakeholder context, not evidence about the platforms.
