===== 2026-11-09 Session: commerce platform analysis (record) =====
# 2026-11-09 Session: commerce platform analysis

Session 2 — 9 November 2026. Main brief: page:1686258d-b5b2-4747-8e63-d718e0b56f82.

## What we worked on
- Added sourced findings F6–F10: vendor quotes for Butikkskyen, Composa and Fram CMS commerce, plus Agder Maskin and Vestlandsdeler reference calls.
- Added a provisional comparison against the brief's criteria (item:8c914283-85d3-44ad-8080-7bb43cbb6772). Quoted build + three annual fees: Butikkskyen 2.7m NOK, Composa 4.5m, Fram 2.1m; these are not full TCO. Composa's first-year subtotal is 2.7m, 0.2m above budget.
- Evidence suggests Butikkskyen has stronger speed/connector support; Fram has the lowest quoted subtotal and same-tool marketing fit. Composa's reference raises schedule and integration concerns. References are not Northwind delivery guarantees.

## Decisions and why
- Dropped design flexibility because Gunnar says it does not matter for Northwind. Remaining criteria: time to market, three-year cost, Dynamics 365 fit, marketing usability. This supersedes the design-flexibility row in the earlier comparison; no replacement criterion or weights agreed (item:486e82d2-a710-4446-97e3-ccb8d7d54df3).
- Gunnar requested that the next session begin, before other analysis, with a short section on each option's implications for Northwind's customer service team. This is a requested section, not a scored criterion, and supersedes the prior weights-first agenda. Kept as task:75214ca5-ed9a-4cf8-bd7b-e6c177ef3a83. The corresponding guidance proposal is still awaiting approval, not an active rule: proposal:6c50b8a6-0b98-4eb3-a425-ea473705445f (http://localhost:4480/proposals/6c50b8a6-0b98-4eb3-a425-ea473705445f).
- No platform selected. Ana's leaning towards Composa is tentative personal preference, not evidence or a recommendation (item:dc537d9a-d80a-4a39-89ae-40a04adbaa79); her integration concern remains unresolved.

## Still open
- Customer-service impacts for all three options; no sourced assessment yet.
- Weights/scoring for the four criteria; whether fixed build price and annual termination are exclusion gates; how to evaluate quick reorder.
- Near-real-time Dynamics prices/stock performance, integration ownership/cost and customer-specific pricing. Butikkskyen reference needed workarounds above 2,000 price lists; Northwind's price-list count is unknown and distinct from its 4,000 parts. Fram integration and its recorded 10 requests/second API concern remain unresolved.
- Credible delivery plans to 1 September 2027, full three-year costs, fixed-build commitments and annual-termination terms; Composa's budget excess; marketing workflows, part-number search and quick reorder.
- Ola's Composa integration findings and the second Composa reference remain outstanding. No final recommendation yet; target remains the December steering group.

## Next steps, in order
1. First next session: add the short customer-service implications section for Butikkskyen, Composa and Fram; distinguish evidence, hypotheses and unknowns (task:75214ca5-ed9a-4cf8-bd7b-e6c177ef3a83).
2. Obtain Ola's Composa integration check. He will check during the week of 9–15 November; no exact delivery day promised (item:b443922e-cf2b-47bc-9565-1921dadc4348). Ana's follow-up task is due Friday, 13 November (task:d4856013-2717-439f-a30a-c4b6241b0a94).
3. Ask Composa for a second reference customer (existing task:140dd6b8-2b4d-4705-b70f-a25bb91afb56); F10 alone does not establish a second reference.
4. Then agree weights/must-haves with Gunnar and close the integration, timeline, full-cost and workflow gaps with vendor evidence and demos. Keep findings and open questions in the main brief; work towards the December recommendation.

===== 2026-11-02 Session: commerce platform analysis (record) =====
# 2026-11-02 Session: commerce platform analysis

Session 1, 2 November 2026. Part of the commerce platform analysis for the spare parts shop. The main page is the research brief (page:1686258d-b5b2-4747-8e63-d718e0b56f82).

## What we worked on
- Set up the research brief: question, goals and constraints, criteria, the three options (Butikkskyen, Composa, Fram CMS commerce module), findings F1–F5 with sources, and open questions.

## Decisions and why
- Keep one brief as the base to build on across sessions, so the question, criteria and evidence stay in one place.
- Keep our own early observations apart from the findings and mark them untested. Findings so far describe Northwind's needs only, not the options.
- Ask Composa for a second reference customer. This is a normal evidence request, so the same can be asked of the other vendors.
- No decisions yet on weights, must-haves or the recommendation.

## Still open
- Criteria weights, and whether speed to market is the top weight.
- Whether the fixed build price and yearly-terminable licences are must-haves or criteria, and whether fast reordering should be a criterion.
- All evidence on the options themselves: Dynamics 365 integration, customer-specific prices, timeline to 1 September 2027, three-year cost against the 2.5 million NOK first-year budget, Fram CMS commerce module fit, and the effect of the 10 requests a second API limit.
- The full list is in the brief's open questions.

## Next steps
1. Start the next session by agreeing weights and must-haves with Gunnar, or by deciding what to propose to him.
2. Ask Composa for a second reference customer (task:140dd6b8-2b4d-4705-b70f-a25bb91afb56).
3. Collect evidence per option: vendor documentation, quotes, references, demos. Ask Ola Nordmann what "near real time" means in numbers.
4. Add findings to the brief with their sources.
5. Work towards a recommendation for the December steering group.

===== Research brief: commerce platform for the spare parts shop =====
# Research brief: commerce platform for the spare parts shop

**Status:** started 2 November 2026, built up over several sessions. Update the findings and open questions here each session.

## Question
Which commerce platform should Northwind use for its new spare parts shop? Gunnar Holm wants a recommendation for the steering group in December 2026.

## Goals and constraints
- Sell spare parts online to dealers and workshops: about 4,000 parts. [F1]
- Live by **1 September 2027**. [F1]
- Customer-specific prices. [F1]
- Microsoft Dynamics 365 is the ERP and holds prices and stock. Every option must read prices and stock from it in near real time. [F1, F3]
- First-year budget: **2.5 million NOK**, licences and build included. [F1]
- Northwind's integration team is two people. [F3]
- Procurement wants a fixed price for the build and licences that can be ended yearly. [F4]
- Marketing should manage the shop's content in the same tool as the website. [F2]
- Workshops want to reorder in a few clicks. [F2]

## Criteria (agreed at the kickoff, [F1])
1. Time to market (Gunnar says this matters most to him [F2])
2. Cost over three years
3. Fit with Dynamics 365
4. Ease of use for marketing
5. Design flexibility

Weights and scoring scale are not agreed yet. Two requirements from the interviews are not yet covered by a criterion: fixed build price and yearly-terminable licences [F4], and fast reordering [F2].

## Options
- **A. Butikkskyen**: a SaaS shop platform.
- **B. Composa**: a headless commerce engine with its own frontend.
- **C. Commerce module of Fram CMS**: Fram CMS runs Northwind's new website.

## What we know so far
- **F1** Kickoff notes, 28 October (Ana): scope, go-live date, customer-specific prices, Dynamics 365 as ERP, 2.5 million NOK first-year budget, agreed criteria.
- **F2** Interview with Gunnar Holm, 29 October: speed to market matters most; marketing manages shop content in the same tool as the website; workshops want to reorder in a few clicks.
- **F3** Interview with Ola Nordmann, integration architect, 29 October: near-real-time prices and stock from Dynamics 365 for every option; integration team of two.
- **F4** Interview with Lise Berg, procurement, 30 October: fixed build price; licences that can be ended yearly.
- **F5** Market note from Cara, 30 October: dealers mostly order by part number. 70% of orders come by email and phone today.

No findings on the options themselves yet. Everything above describes Northwind's needs.

## Early observations (our reading, not yet tested)
- "Same tool as the website" [F2] points towards C. Whether it holds depends on what the Fram CMS commerce module can do.
- B (own frontend, custom build) looks hardest to fit with a fixed build price [F4], a two-person integration team [F3] and the date [F1]. To be checked.
- Dealers order by part number [F5], so fast part-number search and quick reorder are probably important in the shop design.

## Open questions
1. Weights for the five criteria. Is speed to market the top weight, as Gunnar's interview suggests?
2. Are the fixed build price and yearly-terminable licences [F4] requirements that rule options out, or just preferences? Should they be added as criteria?
3. What does "near real time" mean in numbers, for prices and stock [F3]?
4. How does each option connect to Dynamics 365 (standard connector or custom build), and who builds and maintains it with a team of two?
5. Can each option handle customer-specific prices for dealers and workshops?
6. Can each option be live by 1 September 2027, and what is the realistic plan?
7. Cost over three years per option, with licences, build, integration and running costs, against the 2.5 million NOK first-year budget.
8. Does the Fram CMS commerce module cover what a spare parts shop needs (part-number search, quick reorder, 4,000 parts)? Does the vendor's API limit of 10 requests a second (known risk in the website relaunch) matter for syncing prices and stock?
9. How will the 70% of orders now placed by email and phone move to the shop? Is that in scope for the recommendation?
10. Which sources do we need for the options: vendor documentation, quotes, references, demos?

F6 — Butikkskyen licence quote, 3 November 2026: 600,000 NOK per year.

F6 — Butikkskyen partner build estimate, 3 November 2026: about 900,000 NOK.

F6 — Butikkskyen's 3 November 2026 quote includes a standard Dynamics 365 connector.

F6 — Butikkskyen's 3 November 2026 quote says customer-specific prices require the B2B Pricing app, included in the licence.

F7 — Composa licence quote, 4 November 2026: 900,000 NOK per year.

F7 — Composa build estimate, 4 November 2026: about 1.8 million NOK, frontend included.

F7 — Composa's 4 November 2026 quote says there is no standard Dynamics 365 connector; integration goes through Composa's API.

F8 — Fram CMS commerce module quote, 4 November 2026: 300,000 NOK per year.

F8 — Fram CMS commerce build estimate, 4 November 2026: about 1.2 million NOK.

F8 — Fram CMS's 4 November 2026 finding says marketing keeps working in Fram for the commerce option.

F9 — Agder Maskin, a Butikkskyen reference customer, reported on 5 November 2026 that it went live in four months. This is a reference outcome, not a Northwind delivery commitment.

F9 — Agder Maskin reported on 5 November 2026 that customer-specific prices worked through Butikkskyen's B2B Pricing app, but needed workarounds above 2,000 price lists. Northwind's price-list count is not established by its roughly 4,000-part catalogue.

F10 — Vestlandsdeler, a Composa reference customer, described the platform as very flexible on 6 November 2026; this is reference testimony, not a demonstrated Northwind design fit.

F10 — Vestlandsdeler reported on 6 November 2026 that its Composa launch took nine months. This is a reference outcome, not a Northwind delivery commitment.

F10 — Vestlandsdeler reported on 6 November 2026 that its Composa integration took longer than planned.

## 2026-11-09 — Comparison against the brief's five criteria

Provisional analysis, not a platform decision. Criteria and constraints: original brief item:44825990-11e3-40ff-afe0-eac092bff5cd [F1–F5]. No weights or scoring scale have been agreed; no numerical scores or weighted winner are assigned. The commerce deadline is 1 September 2027 [F1], distinct from the website relaunch deadline.

| Criterion | A. Butikkskyen | B. Composa | C. Fram CMS commerce |
|---|---|---|---|
| Time to market | Strongest positive reference evidence: Agder Maskin reported four months to live [F9]. Not a commitment for Northwind; validate partner availability, scope and plan. | Higher apparent schedule risk: Vestlandsdeler reported nine months and integration taking longer than planned [F10]. With a December decision and September deadline, slack looks limited; start date is not agreed. | Unknown: no delivery-duration evidence in F8. Keeping marketing in Fram does not establish implementation speed. |
| Cost over three years | Indicative build + 3 annual licences: 0.9 + 3 × 0.6 = **2.7m NOK** [F6]. First-year subtotal 1.5m; 1.0m below the 2.5m budget [F1]. | Indicative build + 3 annual licences: 1.8 + 3 × 0.9 = **4.5m NOK** [F7]. First-year subtotal 2.7m; already 0.2m above budget [F1]. Frontend included in build. | Indicative build + 3 annual module fees: 1.2 + 3 × 0.3 = **2.1m NOK** [F8]. First-year subtotal 1.5m; 1.0m below budget [F1]. Cheapest quoted subtotal, not yet proven lowest total cost. |
| Fit with Dynamics 365 | Standard connector included [F6], suggesting lower integration burden, not proof of near-real-time prices/stock. B2B Pricing app included [F6]; reference reports workarounds above 2,000 price lists [F9]. | No standard connector; API integration [F7]. Reference overrun [F10] increases concern for Northwind's two-person team [F3]. Near-real-time performance and customer-specific pricing remain unverified. | No new evidence on Dynamics 365 integration or customer-specific pricing [F8]. Investigate the 10 requests/second API concern recorded in the original brief before judging fit. |
| Ease of use for marketing | Same-tool-as-website requirement [F2] not demonstrated. Need editorial workflow demo; do not assume SaaS means easy for Northwind. | Frontend is included [F7], but this says nothing about editorial tooling. Same-tool workflow and ease of use unverified. | Strongest direct evidence for same-tool fit: marketing keeps working in Fram [F8], matching F2. Validate commerce editing, preview and publishing in a demo. |
| Design flexibility | No direct evidence yet. Validate templates, customisation constraints and reorder design. | Strongest available indication: reference says very flexible [F10], consistent with own frontend [F7]. Reference testimony is not a demonstrated design fit or proof of unlimited flexibility. | No direct evidence yet. Existing CMS use does not establish commerce design flexibility. |

### Cost assumptions and limitations
Figures are arithmetic on approximate quoted build costs and annual fees, assuming one build and unchanged fees for three full years. They are comparable quoted subtotals, **not complete TCO** or fixed-price commitments. Confirm integration scope, maintenance/support, hosting, transaction charges, upgrades, tax basis, contingency and any incremental Fram base-CMS charges. The included Butikkskyen connector does not establish that all implementation work is included. An annual quoted licence rate does not establish annual termination rights [F4].

### Provisional reading
Butikkskyen currently has the best positive evidence for speed and a standard Dynamics connector. Fram has the lowest quoted subtotal and the strongest same-tool marketing fit, but major integration and timeline gaps. Composa has positive flexibility evidence, but its quoted first-year subtotal exceeds budget and its reference raises schedule/integration concerns. No final winner is justified before weights and mandatory requirements are agreed and the evidence gaps are closed.

### Updated open questions (earlier questions remain unless answered here)
- Agree criterion weights and scoring; confirm whether fixed build price and yearly termination are exclusion gates, and how quick reorder is evaluated [F2, F4].
- Define near real time numerically and test prices/stock end to end for every option [F3]; establish integration builder, maintainer, scope and cost.
- Establish Northwind's number and structure of price lists; test Butikkskyen at that scale. 4,000 parts is not 4,000 price lists. Verify Composa and Fram customer-specific pricing.
- Obtain scoped delivery plans to 1 September 2027, including partner capacity, integration, migration, testing and contingency. Fram timeline evidence is missing; Composa needs a credible mitigation plan.
- Obtain complete three-year costs, binding fixed-build offers and contractual annual-termination terms. Resolve Composa's first-year budget excess.
- Demo marketing workflows and design constraints for all three; test part-number search, few-click reorder and the approximately 4,000-part catalogue [F1, F2, F5]. Investigate Fram's API-limit concern.
- Seek additional comparable references; the open task to ask Composa for a second reference remains open because F10 alone does not establish that a second reference has been obtained.

### New source register
- **F6** Butikkskyen quote, 3 November 2026: licence item:e69335b8-6604-4f5e-87d5-c9da8f87cc97; build item:999b5210-6688-4d36-ae41-a261e29680da; connector item:04b6e04c-d87f-402a-ad4e-70b87c9e7b28; pricing app item:6989a07e-0c17-4142-8d65-f008f0a3fcf2.
- **F7** Composa quote, 4 November 2026: licence item:7bb4942e-76f6-4712-b963-801f517903b0; build/frontend item:bd7dbf08-004e-4b5a-b07b-04286d845f27; integration item:6c07fc70-3655-4ed5-aaa8-09a8e0797e32.
- **F8** Fram CMS, 4 November 2026: module fee item:8cfa768e-5145-453d-b3b1-0f726705d0bc; build item:d969aaf4-c78d-45b1-b15b-125d78d6d659; marketing item:4847bf6a-cc13-429e-900b-493c5468f019.
- **F9** Agder Maskin reference call, 5 November 2026: timeline item:7de1e349-5802-42c0-8645-7c91f1798838; pricing scale item:380d6164-6b18-497c-94f8-1a0210c7c4db.
- **F10** Vestlandsdeler reference call, 6 November 2026: flexibility item:7aef7b65-691e-48e7-a2b8-052102e58bde; timeline item:81c39b7c-af36-4d9c-8b25-c6b92c4c3f58; integration item:bb26dafc-f382-4ccd-90c3-4d7857321759.

Vendor quotes establish proposed scope/prices, not independently verified delivery or performance. Each reference describes one customer's experience; applicability to Northwind remains to be tested.

## 2026-11-09 — Criteria decision following Gunnar call
Ana reports that Gunnar said design flexibility does not matter for Northwind and requested its removal as a criterion. The current criteria are now: (1) time to market, (2) cost over three years, (3) fit with Dynamics 365, (4) ease of use for marketing. Weights and scoring remain unagreed. This supersedes the five-criterion list in item:44825990-11e3-40ff-afe0-eac092bff5cd and the design-flexibility assessment in item:8c914283-85d3-44ad-8080-7bb43cbb6772. Preserve F10's flexibility testimony as historical evidence, but do not count it as an advantage in the current comparison. Customer-service implications are requested as a section, not yet adopted as a scored criterion.

As of 9 November 2026, Ana is leaning towards Composa for Northwind's commerce platform. This is a tentative personal preference, not a platform selection or new evidence about the options.

As of 9 November 2026, Ana is worried about Composa's integration; no resolution has been reported.

Ana reports on 9 November 2026 that Ola Nordmann will check Composa's integration during the week of 9–15 November 2026. Findings are pending; no exact delivery day was specified.
