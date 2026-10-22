===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work is the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

A second piece of work is the choice of commerce platform for the new spare parts shop, due for a steering group recommendation in December 2026. See [the research brief](commerce-platform/research-brief.md).


===== log.md (record) =====
# Log

- 2026-11-09: Created acme/northwind/commerce-platform/session-2026-11-09.md with today's work, decisions and reasons, open questions and ordered next steps; added it to index.md. Customer-service implications remain the first task next session; no platform selected.

- 2026-11-09: Updated commerce-platform/research-brief.md to remove design flexibility from current criteria and comparison, preserve ordering requirements, and record Ana's provisional Composa preference and Ola's integration check planned this week. Updated commerce-platform/next-session.md to make Gunnar's requested customer-service implications section the first task before anything else next session, retaining other follow-ups. Updated index.md descriptions for the brief and reminders. Source: Ana, 9 November 2026.

- 2026-11-09: Updated acme/northwind/commerce-platform/research-brief.md with findings [F6]–[F10], a comparison against all five agreed criteria, indicative first-year and three-year costs, provisional synthesis and remaining validation questions; updated its index description. No platform selected or criteria weights assigned.

- 2026-10-20: The wiki holds Acme, Northwind, Fjord Bank and Ana’s own pages.
- 2026-11-02: Created acme/northwind/commerce-platform/research-brief.md (platform choice for Northwind's spare parts shop) and added it to the index.
- 2026-11-02: Created acme/northwind/commerce-platform/next-session.md with a reminder list for the next session.
- 2026-11-02: Created acme/northwind/commerce-platform/session-2026-11-02.md, a record of the first commerce platform session, and added it to the index.


===== acme/northwind/commerce-platform/research-brief.md =====
# Commerce platform for Northwind's spare parts shop: research brief

Type: analysis brief
Status: comparison updated 9 November 2026 with findings [F6]–[F10]. No platform selected.
Deadline: recommendation to the steering group in December 2026 (Gunnar Holm wants it).

## Question

Which commerce platform should Northwind use for its new spare parts shop: Butikkskyen, Composa or the commerce module of Fram CMS?

## Northwind's goals

- Sell spare parts online to dealers and workshops. About 4,000 parts. [F1]
- Go live by 1 September 2027. [F1]
- Speed to market matters most to Gunnar. [F2]
- Marketing manages the shop's content in the same tool as the website. [F2]
- Workshops can reorder in a few clicks. [F2]
- Dealers mostly order by part number. [F5] Today 70% of orders come by email and phone. [F5]

## Constraints

- Customer-specific prices. [F1]
- Dynamics 365 is the ERP and holds prices and stock. [F1]
- Every option must read prices and stock from Dynamics 365 in near real time. [F3]
- Northwind's integration team is two people. [F3]
- The first-year budget is 2.5 million NOK, licences and build included. [F1]
- Procurement wants a fixed price for the build. [F4]
- Procurement wants licences that can be ended yearly. [F4]

## Criteria

Current criteria, following Gunnar's update on 9 November 2026 (reported by Ana):

1. Time to market
2. Cost over three years
3. Fit with Dynamics 365
4. Ease of use for marketing

These four remain from the kickoff criteria [F1]. Gunnar dropped design flexibility because it does not matter for Northwind. [Ana, 9 November 2026] Historical reference comments about flexibility remain evidence, but are no longer a scoring advantage.

Weights are not set yet. Gunnar puts speed first [F2]. No weighted score or final ranking is assigned below.

### Current position and follow-up

- Ana is leaning towards Composa, but is worried about the integration. This is a provisional preference, not a platform decision or evidence of better fit. Ola will check Composa's integration this week (9–15 November 2026); results are pending. [Ana, 9 November 2026]
- **First task next session, before anything else:** add a short section on what each option means for Northwind's customer service team, as requested by Gunnar. This is queued work, not an added scoring criterion or an assessment already completed. [Ana, 9 November 2026]

## Options and new findings

| | A. Butikkskyen | B. Composa | C. Fram CMS commerce module |
|---|---|---|---|
| Type | SaaS shop platform | Headless commerce engine with its own frontend | Commerce module of Fram CMS, which runs Northwind's new website |
| Annual licence | 600,000 NOK; B2B Pricing app included. [F6] | 900,000 NOK. [F7] | 300,000 NOK for the commerce module. [F8] |
| Indicative build | About 900,000 NOK, by a partner. [F6] | About 1.8 million NOK, frontend included. [F7] | About 1.2 million NOK. [F8] |
| Dynamics 365 | Standard connector included; customer-specific prices require the included B2B Pricing app. [F6] | No standard connector; integration through Composa's API. [F7] | No integration evidence supplied yet. |
| Reference evidence | Agder Maskin went live in four months. Customer-specific prices worked through B2B Pricing, but needed workarounds above 2,000 price lists. [F9] | Vestlandsdeler reports high flexibility, a nine-month launch and integration taking longer than planned. [F10] | No reference evidence supplied yet. |
| Marketing workflow | Not yet established. | Not yet established. | Marketing keeps working in Fram. [F8] |

## Comparison against the four current criteria

The assessments below are our interpretation of the cited evidence, not vendor guarantees. Reference projects may differ from Northwind's scope; their launch durations are not forecasts for Northwind.

| Criterion | A. Butikkskyen | B. Composa | C. Fram CMS commerce module |
|---|---|---|---|
| **1. Time to market** | **Strongest positive evidence so far:** four-month reference launch [F9] and an included Dynamics 365 connector [F6]. These suggest a shorter route, but Northwind's schedule and pricing scale still need validation. | **Higher schedule risk:** nine-month reference launch, with integration taking longer than planned [F10]; no standard Dynamics 365 connector [F7]. This is a concern against the 1 September 2027 deadline [F1], not proof that it cannot be met. | **Unknown:** retaining Fram for marketing [F8] may reduce workflow change, but there is no delivery estimate or reference timeline. Cannot yet judge launch feasibility. |
| **2. Cost over three years** | **2.7 million NOK** in quoted licence-plus-build costs; first year **1.5 million NOK**, 1.0 million below budget before unpriced costs. [F6; calculation below] | **4.5 million NOK**, highest of the three; first year **2.7 million NOK**, 200,000 above budget before unpriced costs. [F7; calculation below] | **2.1 million NOK**, lowest quoted licence-plus-build cost; first year **1.5 million NOK**, 1.0 million below budget before unpriced costs. Module cost only; confirm any additional Fram charges. [F8; calculation below] |
| **3. Fit with Dynamics 365** | **Best-supported starting point:** standard connector and included pricing app [F6], with reference confirmation of customer-specific prices [F9]. However, workarounds above 2,000 price lists [F9] and unverified near-real-time price/stock behaviour remain material risks. | **Greater integration burden likely:** API integration rather than a standard connector [F7], plus reference overrun [F10], raises risk for Northwind's two-person team [F3]. Customer-specific pricing and near-real-time price/stock behaviour are unproven. | **Unknown:** no evidence yet on connector, customer-specific pricing or near-real-time price/stock behaviour. This is a major gap against [F1][F3], not evidence of poor capability. |
| **4. Ease of use for marketing** | **Unknown:** no evidence on editor usability or whether content can be managed in Fram as requested [F2]. SaaS alone does not establish ease of use. | **Unknown:** frontend inclusion [F7] does not establish the editorial workflow or same-tool content management [F2]. Needs demonstration. | **Strongest workflow fit:** marketing stays in Fram [F8], matching the same-tool goal [F2]. Commerce editing tasks and actual usability still need testing. |

### Cost calculation and limits

All figures below are in million NOK. Calculations use one build plus one annual licence for year one, and one build plus three annual licences for three years. Assume unchanged annual rates, a single build and comparable scope; these are indicative subtotals, **not complete total cost of ownership**. [F6][F7][F8]

| Cost item | A. Butikkskyen [F6] | B. Composa [F7] | C. Fram commerce [F8] |
|---|---:|---:|---:|
| Annual licence | 0.60 | 0.90 | 0.30 |
| Indicative build | 0.90 | 1.80 | 1.20 |
| First year: build + annual licence | **1.50** | **2.70** | **1.50** |
| Headroom against 2.50 first-year budget [F1] | **1.00** | **−0.20 (over budget)** | **1.00** |
| Three years: build + 3 × annual licence | **2.70** | **4.50** | **2.10** |

The quoted builds are approximate, not confirmed fixed-price commitments. [F6][F7][F8] Confirm scope and any additional charges for integration, hosting, maintenance/support, upgrades, internal team effort, migration and pricing workarounds; confirm tax treatment and licence escalation. Composa includes its frontend [F7], and Butikkskyen includes its connector and B2B Pricing app [F6], but inclusion does not establish all implementation costs. Fram's figure is for the commerce module [F8]; check treatment of existing CMS costs and any incremental charges. Yearly termination rights remain unverified for all three. [F4]

### Provisional synthesis — not a selection

- **Butikkskyen is the most promising option to validate first for speed and integration**, given Gunnar's priority [F2], the four-month reference [F9] and included connector [F6]. Validate Northwind's price-list scale before relying on that advantage: 4,000 parts [F1] is not the same as 4,000 price lists and does not establish whether the reference's 2,000-list issue applies. [F9]
- **Fram has the lowest quoted three-year subtotal and the clearest marketing workflow fit.** [F8] Its unknown integration capability and delivery time prevent a confident overall comparison.
- **Composa remains above the first-year budget on current quoted figures and has an integration/schedule warning from its reference.** [F7][F10] Design flexibility is no longer a criterion and is not a reason to offset these concerns. Ana's provisional preference for Composa is recorded separately above; Ola's integration check this week is pending. [Ana, 9 November 2026] Budget and delivery feasibility still need resolving.
- **No option is yet proven to meet all constraints.** Near-real-time Dynamics 365 prices and stock [F3], fixed build price and yearly-terminable licences [F4] still need explicit validation. Quick reorder, part-number search and bulk entry also remain untested against the ordering needs [F2][F5].

## Open questions

1. **Weights:** How are the four remaining criteria weighted? Does Gunnar's "speed matters most" [F2] mean time to market gets the highest weight? Design flexibility has been removed. [Ana, 9 November 2026]
2. **Hard requirements:** Which constraints rule an option out and which only count in the scoring? Candidates: near-real-time Dynamics 365 data [F3], fixed build price [F4], yearly-terminable licences [F4]. How should Composa's current first-year budget overrun be handled?
3. **Dynamics 365 integration:** Demonstrate customer-specific prices and stock in near real time for each option. Confirm connector/API scope, implementation ownership and load on the two-person team. For Butikkskyen, establish Northwind's price-list count and complexity and test the limitations reported above 2,000 lists [F9]. For Fram, establish the integration approach at all. (Ola Nordmann [F3])
4. **Timeline:** Obtain Northwind-specific delivery plans from each vendor/partner for 1 September 2027. Reference launches of four and nine months [F9][F10] are not delivery commitments.
5. **Cost and terms:** Obtain comparable scoped, fixed-price build offers, full three-year running costs, annual termination terms and licence escalation. Clarify whether all integration work is included and whether Fram has incremental CMS charges beyond the module. [F4][F6][F7][F8]
6. **Fram CMS:** Is the commerce module a mature product? Which Fram version does Northwind's new website run? Does the website's licence or contract affect the module's terms? Is the Fram vendor the same as the one Lars Moe works for? (Not confirmed.) Obtain a relevant reference.
7. **Ordering requirements:** Demonstrate quick reorder, part-number search and bulk entry in each option. These practical ordering needs [F2][F5] remain relevant despite removal of design flexibility; confirm whether they should be formal must-haves. How should we support moving the 70% of orders now coming by email and phone [F5]?
8. **Marketing:** Demonstrate routine commerce content tasks in each option. Fram continuity is confirmed [F8], but ease of use is not tested; the Butikkskyen and Composa workflows remain unknown.
9. **Decision process:** What format and length does the steering group want? Gunnar prefers short summaries [Gunnar Holm page]. The next steering group meeting is on 11 November. Is the December meeting date fixed?
10. **Missing voices and references:** Have we spoken to dealers/workshops, IT operations and finance? Validate reference comparability and retain the follow-up to ask Composa for a second reference customer; it is not yet clear whether Vestlandsdeler fulfils that reminder.

## Next steps

- **Before anything else next session:** add a short section comparing what each option means for Northwind's customer service team, at Gunnar's request. [Ana, 9 November 2026]
- Follow up on Ola's Composa integration check this week (9–15 November 2026); results are pending. [Ana, 9 November 2026]
- Agree weights for the four remaining criteria and hard requirements with Gunnar.
- Request comparable delivery plans, fixed-price scopes and full cost/contract details from all three vendors.
- Continue Dynamics 365 and pricing-scale validation with Ola, including Fram's integration evidence gap and Butikkskyen's price-list limitation.
- Arrange marketing and ordering demonstrations and close reference gaps.
- Update the comparison once these gaps are closed, then draft a short December recommendation.

## Related pages

- [Northwind overview](../overview.md)
- [Gunnar Holm](../website-relaunch/gunnar-holm.md), sponsor
- [Lise Berg](../website-relaunch/lise-berg.md), procurement
- [Next-session reminders](next-session.md)
- [Session record, 2 November](session-2026-11-02.md): historical record of the initial brief, before findings [F6]–[F10].
- [Website relaunch](../website-relaunch/website-relaunch.md): a separate project. It goes live on 1 March 2027 and has a 450,000 NOK budget. The shop has its own date (1 September 2027) and budget (2.5 million NOK).

## Sources

- [F1] Kickoff notes, 28 October 2026 (Ana)
- [F2] Interview with Gunnar Holm, 29 October 2026
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026
- [F4] Interview with Lise Berg, procurement, 30 October 2026
- [F5] Market note from Cara, 30 October 2026
- [F6] Butikkskyen quote, 3 November 2026: annual licence 600,000 NOK; partner build about 900,000 NOK; standard Dynamics 365 connector included; required B2B Pricing app for customer-specific prices included in the licence.
- [F7] Composa quote, 4 November 2026: annual licence 900,000 NOK; build about 1.8 million NOK including frontend; no standard Dynamics 365 connector, integration through Composa's API.
- [F8] Fram CMS, 4 November 2026: commerce module 300,000 NOK annually; build about 1.2 million NOK; marketing keeps working in Fram.
- [F9] Reference call with Agder Maskin, Butikkskyen customer, 5 November 2026: live in four months; customer-specific prices worked through B2B Pricing, with workarounds needed above 2,000 price lists.
- [F10] Reference call with Vestlandsdeler, Composa customer, 6 November 2026: very flexible; launch after nine months; integration took longer than planned.
- Gunnar Holm page (wiki): preference for short summaries; carried forward from the initial brief.
- Ana, 9 November 2026: report of today's call with Gunnar removing design flexibility as a criterion and requesting a short customer-service implications section as the first task next session; Ana's provisional lean towards Composa, concern about integration, and Ola's planned integration check this week.


===== acme/northwind/commerce-platform/next-session.md (record) =====
# Commerce platform: reminders for next session

Type: to-do

At the next session on the commerce platform analysis, do the first task below before anything else. Then raise the remaining follow-ups with Ana. Remove items once they are done.

1. **FIRST — before anything else:** add a short section to the research brief on what each option (Butikkskyen, Composa and Fram commerce) means for Northwind's customer service team. Gunnar requested this; do it next session, not just a reminder to discuss it. Distinguish evidence from unknowns. (Added 9 November 2026.)
2. Follow up on Ola's Composa integration check, planned for this week (9–15 November 2026). Ana is leaning towards Composa but worried about integration; no decision has been made and the check's results are pending. (Added 9 November 2026.)
3. Ask Composa for a second reference customer. It is not yet clear whether Vestlandsdeler fulfils this reminder. (Added 2 November 2026; clarified 9 November.)

Context: Gunnar removed design flexibility as a criterion on 9 November; use the four remaining criteria in the brief. Customer-service implications are requested analysis, not automatically a new scoring criterion.

Related: [research brief](research-brief.md)

## Sources

- Ana, 9 November 2026: today's call with Gunnar, next-session priority, provisional Composa preference and Ola's planned check.
- [Session record, 2 November 2026](session-2026-11-02.md): second Composa reference follow-up.


===== acme/northwind/commerce-platform/session-2026-11-02.md (record) =====
# Session record, 2 November 2026

Type: session record

## What we worked on

- Set up the research brief for Northwind's spare parts shop platform choice: [research brief](research-brief.md). It holds the question, goals, constraints, criteria, the three options (A Butikkskyen, B Composa, C Fram CMS commerce module), what we know with sources [F1]–[F5], and open questions.
- Noted one follow-up for the next session: [next-session.md](next-session.md).

## What we decided and why

- **Brief location and structure:** The brief lives in `acme/northwind/commerce-platform/`, so the analysis can be extended over several sessions. It keeps facts (with sources) apart from our unverified readings.
- **Criteria:** We use the five agreed at the kickoff [F1]. We did not add or weight any.
- **Follow-up:** Ask Composa for a second reference customer. We decided to keep the analysis neutral between the options.
- **Platform:** Nothing is decided. No option has been researched yet.

## What is still open

- The ten open questions in the [research brief](research-brief.md). The most important are:
  - the criteria weights, and which constraints rule an option out;
  - how each option connects to Dynamics 365, especially customer-specific prices in near real time with a two-person integration team [F3];
  - a three-year cost comparison for each option against the 2.5 million NOK first-year budget, with a fixed build price and yearly-terminable licences [F1][F4];
  - what Fram CMS's commerce module can actually do.
- Whether to ask all three vendors for references, not only Composa. I suggested it and it is not yet decided.
- Whether part-number search and quick reorder [F2][F5] should become a criterion or a must-have.

## Next steps

1. Agree the criteria weights and the must-haves with Gunnar.
2. Collect vendor information for A, B and C on the same points: Dynamics 365 integration, pricing model, contract terms, delivery time.
3. Ask Composa for a second reference customer (see [next-session.md](next-session.md)).
4. Build the scoring table and the three-year cost comparison.
5. Draft a short recommendation for the steering group in December. Gunnar prefers short summaries.

## Sources

- Session on 2 November 2026 (Ana). The facts [F1]–[F5] are listed in the [research brief](research-brief.md).


===== acme/northwind/commerce-platform/session-2026-11-09.md (record) =====
# Session record, 9 November 2026

Type: session record

## What we worked on

- Added vendor quotes and reference findings [F6]–[F10] to the [research brief](research-brief.md), with a sourced comparison, budget checks and validation gaps.
- Calculated indicative build-plus-licence costs (not full total cost of ownership): Butikkskyen 1.5m NOK in year one / 2.7m over three years; Composa 2.7m / 4.5m; Fram commerce 1.5m / 2.1m. Composa is 200,000 NOK over the 2.5m first-year budget before unpriced costs. [F1][F6]–[F8]
- Updated the comparison after Ana's report of today's call with Gunnar and saved [next-session priorities](next-session.md).

## What we decided and why

- **Remove design flexibility:** Gunnar says it does not matter for Northwind. Four criteria remain: time to market, three-year cost, Dynamics 365 fit and marketing ease of use. Weights remain unset. Reference comments about flexibility remain factual evidence, not a scoring advantage. Practical ordering requirements remain relevant. [Ana, 9 November 2026]
- **Customer service first next session:** before anything else, add a short section on what each option means for Northwind's customer service team, at Gunnar's request. This has not been written yet and is not automatically a new scoring criterion. [Ana, 9 November 2026]
- **No platform decision:** Ana is leaning towards Composa but worried about integration. We recorded this as a provisional preference, not a recommendation, and retained the budget and integration warnings. Ola will check Composa's integration this week (9–15 November); results are pending. [Ana, 9 November 2026]

## What's still open

- Ola's Composa integration findings: no standard Dynamics 365 connector [F7], a reference integration overrun [F10], and Northwind's two-person team [F3] make this material.
- Near-real-time customer-specific prices and stock for all options; Butikkskyen's workarounds above 2,000 price lists [F9] need testing against Northwind's actual price-list scale. Fram's integration approach and delivery timing remain unknown.
- Criteria weights and hard requirements; comparable scoped fixed-price builds, yearly licence termination, full running costs and credible launch plans. Composa's budget overrun remains unresolved.
- Marketing usability, quick reorder, part-number search and bulk entry demonstrations; customer-service implications and relevant stakeholder input.
- Second Composa reference follow-up: it is unclear whether Vestlandsdeler fulfils the earlier reminder.

## Next steps — in order

1. **Before anything else next session, write the short customer-service implications section for all three options**, separating evidence from unknowns.
2. Follow up on Ola's Composa integration check this week; update the assessment from his findings without treating Ana's lean as a decision.
3. Resolve the second Composa reference reminder and other evidence gaps, including Fram integration and Butikkskyen pricing scale.
4. Agree weights and must-haves with Gunnar; obtain delivery, cost and contract commitments and run marketing/ordering demonstrations.
5. Update the neutral comparison and prepare a short recommendation for the steering group in December 2026.

## Sources

- Ana, session and report of call with Gunnar, 9 November 2026: criterion removal, customer-service priority, provisional Composa preference and Ola's planned check.
- [Research brief](research-brief.md): source details for [F1]–[F10], calculations and current comparison. New findings: Butikkskyen quote, 3 November [F6]; Composa quote, 4 November [F7]; Fram CMS, 4 November [F8]; Agder Maskin reference call, 5 November [F9]; Vestlandsdeler reference call, 6 November [F10].
- [Session record, 2 November](session-2026-11-02.md) and [next-session reminders](next-session.md): second Composa reference follow-up.

