===== Commerce analysis — private stakeholder context =====
# Commerce analysis — private stakeholder context

Private stakeholder context, separate from the research brief and not evidence of platform quality: Ana reports that Gunnar is skeptical of Composa because a friend's company struggled with it. This anecdote should not influence the platform evaluation; assess Composa using the same criteria and evidence standard as the other options.

===== 2026-11-02 Commerce analysis — session record (record) =====
# 2026-11-02 Commerce analysis — session record

## Worked on
Established the research brief for Northwind's spare parts shop platform decision: A. Butikkskyen, B. Composa, C. Fram CMS commerce. Captured goals, constraints, five kickoff criteria, option descriptions, sourced evidence F1–F5 and open questions. Working brief: page:17b6f44e-717d-4c44-a6d2-aad7a8b37de2 (foundation item:cb4cceba-d305-4e90-811e-859588b95ae4).

## Decisions and rationale
- Keep a persistent, source-linked brief in Northwind to build on across sessions toward Gunnar's December 2026 steering-group recommendation.
- No platform selected or scored. Available evidence describes Northwind's needs, not verified comparative platform capabilities; criterion weights remain unagreed.
- Keep private stakeholder context outside the brief and do not let anecdotal concerns influence the analysis. That context remains separately at page:e18618f5-8c1f-4b94-b691-c64a3d506ca4; it is not platform evidence.
- A feasibility-gates-then-criteria comparison was proposed, not agreed as a final methodology.

## Still open
Exact December steering-group date and decision process; criterion weights and mandatory versus preferred requirements; measurable near-real-time integration needs and Dynamics 365 interfaces; shop scope and buying journeys; shared content workflow; delivery feasibility and support capacity; comparable three-year costs and contract terms; verified evidence for each platform. Full question list is in the working brief.

## Next steps
1. At the next analysis session, remind Ana to ask Composa for a second reference customer. Existing private task: task:df248e33-f3e7-4885-b9ca-edbccc9d6e5b. Do not copy private stakeholder context into the brief.
2. Suggested research sequence: confirm decision timing, criterion weights and mandatory requirements, then gather comparable demonstrations, integration evidence, estimates, commercial terms and customer references for all three options using the same standards.
3. Continue building toward the December recommendation. Existing private task: task:2396963f-116c-4332-8392-20cc13dd87f8; exact deadline awaits confirmation.

This record is private and separate from the research brief.

===== Spare parts shop — commerce platform research brief =====
# Spare parts shop — commerce platform research brief

# Research brief: Northwind spare parts shop

## Decision question
Which commerce platform should Northwind use for its new spare parts shop: A. Butikkskyen, B. Composa, or C. the commerce module of Fram CMS?

## Working status
Research brief opened 2 November 2026 for development across several sessions. No recommendation or platform scoring has been made. The accompanying items on this page hold the goals, constraints, criteria, options and evidence. Source labels F1–F5 refer to the supplied notes and interviews, not independently verified vendor claims.

## Evaluation approach (proposed, not yet agreed)
First test mandatory feasibility requirements, then compare feasible options against the kickoff criteria. Obtain evidence for each option; distinguish verified capabilities, vendor claims, assumptions and unresolved questions. Do not infer that an architecture or an existing CMS guarantees fit.

## Open questions
- Decision process: what is the December steering-group date, who decides, and what evidence and recommendation format do they need?
- Priorities: how should the five kickoff criteria be weighted? Is Gunnar's preference for speed a group-wide priority? Is one content tool a mandatory requirement or a preference?
- Integration: what does 'near real time' mean in measurable terms? Which Dynamics 365 product, APIs and integration services are available? How should customer-specific pricing, authentication, stock availability, ordering, failures and stale data work?
- Shop scope: what are the required part-number search, quick-order, saved-list and reorder journeys? Are customer accounts, approvals, credit terms, payments, shipping, tax, returns, languages and markets in scope? What order volumes and peaks must be supported?
- Content and design: what must marketing edit in one tool? What website/shop navigation, design and identity must be shared? Can each option demonstrate the required workflow?
- Delivery: what work, dependencies and vendor commitments support the 1 September 2027 launch? What can the two-person integration team realistically own and support?
- Commercials: can each supplier offer a fixed-price build and annually terminable licences? What are the three-year costs for implementation, licences, hosting, integration, maintenance, upgrades, support and exit? Which of these count against the first-year budget?
- Platform evidence: validate each option's customer-specific pricing, Dynamics integration, catalogue/search, reorder, content editing, design flexibility, security, operations and exit capabilities. Request comparable demonstrations, estimates and references.
- Website dependencies: confirm whether any existing website hosting, language, security or operational decisions also constrain the shop; do not assume they do.

## Source register
- F1: Kickoff notes, 28 October 2026, Ana.
- F2: Interview with Gunnar Holm, 29 October 2026.
- F3: Interview with Ola Nordmann, integration architect, 29 October 2026.
- F4: Interview with Lise Berg, procurement, 30 October 2026.
- F5: Market note from Cara, 30 October 2026.

Full supplied source excerpts are retained with the evidence items on this page.

## Recommendation milestone
Gunnar wants a commerce-platform recommendation for the steering group in December 2026. The precise meeting date is not yet specified.

## Goal and audience [F1]
Northwind wants to sell spare parts online to its dealers and workshops.

## Catalogue scope [F1]
The planned spare-parts catalogue contains about 4,000 parts.

## Launch constraint [F1]
The spare parts shop must be live by 1 September 2027.

## Pricing requirement [F1]
Customers have customer-specific prices.

## System of record [F1]
Microsoft Dynamics 365 is Northwind's ERP and holds prices and stock.

## First-year budget [F1]
The first-year budget is NOK 2.5 million, including licences and build.

## Agreed evaluation criteria [F1]
The kickoff agreed five criteria: time to market; cost over three years; fit with Dynamics 365; ease of use for marketing; design flexibility. No numerical weights were supplied.

## Stakeholder priority: speed [F2]
Speed to market matters most to Gunnar Holm. This is a stakeholder priority, not evidence of agreed criterion weights.

## Marketing workflow preference [F2]
Gunnar says marketing should manage the shop's content in the same tool as the website. Whether this is a mandatory selection gate remains to be confirmed.

## Workshop buying need [F2]
Workshops want to reorder in a few clicks.

## Mandatory integration requirement [F3]
Ola Nordmann says every option must read prices and stock from Dynamics 365 in near real time. The acceptable latency is not yet quantified.

## Integration capacity [F3]
Northwind's integration team consists of two people.

## Procurement preference: build [F4]
Procurement wants a fixed price for the build.

## Procurement preference: licences [F4]
Procurement wants licences that can be ended yearly.

## Dealer buying behaviour [F5]
Dealers mostly order by part number.

## Current ordering channels [F5]
Cara's market note reports that 70% of orders come by email and phone today (30 October 2026 baseline).

## Option A — Butikkskyen
A SaaS shop platform. No option-specific evidence about capability, costs, delivery or contractual fit has yet been supplied.

## Option B — Composa
A headless commerce engine with its own frontend. No option-specific evidence about capability, costs, delivery or contractual fit has yet been supplied.

## Option C — Fram CMS commerce module
The commerce module of Fram CMS; Fram CMS runs Northwind's new website. Existing website use does not establish the commerce module's suitability. No option-specific evidence about commerce capability, costs, delivery or contractual fit has yet been supplied.
