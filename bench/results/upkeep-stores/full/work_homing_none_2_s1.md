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

The kickoff agreed five evaluation criteria: time to market; cost over three years; fit with Dynamics 365; ease of use for marketing; and design flexibility. Formal weights and scoring thresholds have not yet been supplied.

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

===== Commerce analysis — private stakeholder context =====
# Commerce analysis — private stakeholder context

Ana reports that Gunnar is skeptical of Composa because a friend's company struggled with it. This is second-hand stakeholder context, not verified evidence about Composa's suitability for Northwind. Ana explicitly wants this kept out of the research brief and not to color the platform analysis.
