===== 2026-11-16 Session: commerce platform analysis (record) =====
# 2026-11-16 Session: commerce platform analysis

## Worked on
Added F11–F13 to the research brief (page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0): Ola's Composa integration estimate (item:30990d49-75f9-4a56-be3e-205cfac21f7e), Butikkskyen's licence correction (item:12c16307-ec66-4201-8b2b-5097c07ad8cf) and Fram's end of support for the commerce module (item:190a61a4-4b0f-40a1-b891-ed209bf0a13c). Updated the cost and time comparison (item:fbf86dc1-040f-4177-bbb3-81cf8177b1e8), revisited Option B (item:22c5cc38-422c-45ad-b6ff-36c40afa9740) and drafted the recommendation (page:aa85a99e-b37e-4b41-bd2d-9f6a35500931). Marked the Ola follow-up task done.

## Decided and why
- **Fram's commerce module (Option C) is dropped.** Gunnar agreed on 16 November, because Fram's support for the module ends in December 2028 (page:fb5f11ed-01da-471a-b8ba-8f11a202d104). The choice is now Butikkskyen (A) against Composa (B).
- **Draft recommendation: Butikkskyen preferred.** It is Ana's draft, not agreed or shared. Reasons: it is the only option within budget (about 1.35M NOK year one, about 2.25M over three years, after the one-store correction F12) and has a standard Dynamics 365 connector and a four-month reference launch. Composa is about 3.5M year one (1.0M over budget) and about 5.3M over three years, with four months of custom integration first [F11].
- Go-live line added to the draft: counting four months from a December decision, Butikkskyen could go live in April 2027. The four months is a reference time, not a vendor commitment.
- F12 supersedes the 600,000 NOK licence in the earlier cost comparison, which is kept as history.

## Still open
- Criteria weights and scoring are unagreed; the ranking rests on Gunnar's "speed first".
- Composa's 800,000 NOK is Ola's estimate and is assumed additional to the 1.8M build; overlap not confirmed.
- Butikkskyen checks: Northwind needs one store; price lists against the 2,000-list threshold; fixed build price and yearly-cancellable licence in writing; partner availability; marketing's same-tool content management is unknown.
- Customer-service section is mostly assumptions; needs demos and input from the team.
- December steering group date unconfirmed.
- Standing-instruction proposal (proposal:a7e4045d-8e22-4023-84b7-aa040afca564) still shows as waiting, with a deadline of 29 October that has passed.
- Second Composa reference task (task:3a9b946f-6f5d-40d1-b818-36d4685d42e1) is open; it would not change the assessment of B.

## Next steps
1. Run the Butikkskyen checks above, and ask Butikkskyen for a written go-live plan and demos of part-number search, quick reorder and customer prices.
2. Ask Northwind customer service about their top order-related requests; fill in the customer-service section.
3. Agree weights with Gunnar; confirm the steering group date; finalise the recommendation.
4. Decide whether to keep or close the second Composa reference task, and check the proposal in Homing.
5. Send any cost figures to Northwind only through the procurement portal, never by email.

===== Steering group presentation: spare parts commerce platform — December 2026 =====
# Steering group presentation: spare parts commerce platform — December 2026

# Steering-group presentation outline — draft, 23 November 2026
Private working draft; not shared or approved. Prepared from recommendation item:bcb6269e-76bf-4fb4-8a01-1e645f8cba64 and findings F1–F18 on page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0. Cost-bearing material must be sent to Northwind only via procurement portal, never email.

## 1. Customer service: make order status and prices self-service
- About 300 calls/week concern order status and prices combined [F14]; customer service wants customers to see order status themselves.
- A: stronger integration starting point, but order-status and price self-service need demonstration. B: longer integration path risks delaying benefits.
- Neither option has proven call reduction; baseline avoidable calls before claiming savings.

## 2. Recommendation: proceed conditionally with Butikkskyen
- Preferred platform A, with Kodeverket as proposed build partner; not an unconditional contract approval.
- Better evidence on speed, lower licence/build subtotal and standard Dynamics 365 connector.
- Customer-service capability, marketing workflow, complete costs and delivery remain approval gates.

## 3. Decision frame: four criteria and clear constraints
- Criteria: time to market; three-year cost; Dynamics 365 fit; marketing usability. Weights/scoring unagreed; speed is Gunnar's stated priority.
- Shop target: 1 September 2027; revised year-one budget: 2.0M NOK [F18].
- Near-real-time prices/stock, customer-specific pricing and two-person integration team constrain delivery. Fixed build/yearly licence cancellation requested by procurement.

## 4. Shortlist: Butikkskyen against Composa
- A: standard connector and included B2B Pricing app; four-month reference launch, not a Northwind promise.
- B: custom integration, estimated four months before shop work; nine-month reference launch and integration overrun. Greater schedule/integration risk.
- Marketing usability unverified for both. C already dropped: commerce-module support ends December 2028; website CMS unaffected.

## 5. New evidence removes the old pricing-capacity concern
- Northwind has 3,100 customer-specific price lists [F15], distinct from its ~4,000 parts.
- Vendor says B2B Pricing v4 supports up to 10,000 lists without the old workarounds [F16]. Do not use the historical 2,000-list threshold as the current limit.
- Validate Northwind's lists and near-real-time sync on v4; vendor capacity statement is not measured performance.

## 6. Economics: 450,000 NOK remains before unquoted costs
- A: annual licence 450,000 + fixed build 1.1M = year one 1.55M; three years 2.45M NOK [F12,F17]. One-store assumption.
- B: year one ~3.5M, ~1.5M over revised budget; three years ~5.3M NOK [F7,F11]. Assumes 800,000 integration is additional to 1.8M build; overlap unconfirmed.
- A build cost increases 200,000; budget falls 500,000; headroom falls from 1.15M to 450,000 NOK.
- Licence/build subtotals, not full TCO: establish hosting, support, operations, escalation, exclusions and tax treatment.

## 7. Delivery: commit to a plan, not a reference date
- Get Kodeverket's capacity, milestones, integration responsibilities, testing and acceptance plan against 1 September 2027.
- Four-month reference does not justify promising an April 2027 Northwind launch.
- Sequence proposed: commercial/technical validation, build and integration, user testing, pilot, launch. Dates need partner commitment.

## 8. Approval gates: close the gaps before contract commitment
- Demo order status, correct customer prices, 3,100 lists, near-real-time prices/stock, part-number search and quick reorder.
- Demonstrate marketing workflow; confirm operating workload for the integration team.
- Confirm fixed-price scope/integration, one store, yearly cancellation, full year-one affordability and delivery commitments.
- Proposed contributors, not assigned owners: Hanne for customer service; Ola for technical validation; Lise for commercial checks; marketing representative for content workflow.

## 9. Decision requested and next steps
- Endorse Butikkskyen as preferred, subject to gates; agree accountable owners and who may authorise commitment after validation.
- Kodeverket offer expires 15 December 2026 [F17]; confirm steering date and complete checks in time or seek extension.
- If a material condition fails, return to steering group; do not automatically select Composa or reopen C.
- Send cost-bearing decision material through procurement portal only.

## Slide 8-only amendment — 23 November 2026
In the outline item:6ff168bd-7a7d-405f-9c20-7d029cc29d23, add this bullet to slide 8, “Approval gates: close the gaps before contract commitment” (the risk/validation slide):
- The B2B Pricing app is a third-party dependency.

All existing slide 8 content and its title remain unchanged. Slides 1–7 and 9 remain unchanged. This amendment does not change the recommendation.

===== Draft recommendation: commerce platform for Northwind spare parts shop =====
# Draft recommendation: commerce platform for Northwind spare parts shop

# Draft recommendation (16 November 2026) — for Gunnar Holm, steering group December 2026
Status: DRAFT by Ana Berg. Not agreed, not shared. Weights and scoring are unagreed; the ranking rests on Gunnar's "speed first" [F2]. Contains cost figures: send to Northwind only through the procurement portal, never by email.

## 1. What this means for Northwind's customer service team (requested by Gunnar)
- **Known:** 70% of orders arrive by email and phone today, and dealers mostly order by part number [F5]. Customer service handles that load. Workshops want to reorder in a few clicks [F2].
- **Not evidenced for any option:** how part-number search, quick reorder and customer-specific prices work in each shop, and how many calls and emails they would remove. These are assumptions to test in demos.
- **Assumptions by option:** A and B give the team a new shop to support; whether customer service gets order and price visibility is unknown for both. For C, the shop is part of the CMS that marketing already uses, but a forced migration after December 2028 [F13] would mean a second change for dealers and the team. A late launch (B) means the team keeps the email and phone load for longer.
- **To do:** ask each vendor for a demo of part-number search, quick reorder and per-customer prices, and ask the team what their top order-related requests are.

## 2. Recommendation
**Butikkskyen (Option A) is the preferred option, subject to the checks in section 4.** It is the only option that is within budget, has a standard Dynamics 365 connector and has reference evidence of a fast launch.

## 3. Evidence against the four criteria
| Criterion | A Butikkskyen | B Composa | C Fram CMS |
|---|---|---|---|
| Time to market | Reference live in four months [F9] | Four months' integration first [F11]; reference took nine months [F10]; very tight against 1 Sep 2027 | Unknown |
| Cost, 3 years (licence + build, indicative) | ~2.25M; year one ~1.35M [F6, F12] | ~5.3M; year one ~3.5M, 1.0M over budget [F7, F11] | ~2.1M on paper; module support ends Dec 2028, so migration needed and not costed [F8, F13] |
| Dynamics 365 fit | Standard connector and B2B Pricing app included [F6]; workarounds above 2,000 price lists [F9] | Custom integration, 800,000 NOK [F11] | Unverified |
| Marketing ease of use | Unknown | Unknown | Vendor says marketing keeps working in Fram [F8]; not demonstrated |

Notes: figures are quoted or estimated component costs, not full TCO. Hosting, operation, support and licence escalation are not established. Composa's 800,000 NOK is Northwind's own estimate and is assumed additional to the build.

## 4. Conditions and open checks before the decision
1. Confirm Northwind needs one store (450,000 NOK a year applies to one store [F12]).
2. Count Northwind's price lists against the ~2,000 workaround threshold [F9]. Parts (~4,000) are not price lists.
3. Get a fixed build price and a yearly-cancellable licence in writing [F4]. Confirm partner availability and a delivery plan for 1 Sep 2027.
4. Test marketing's ability to manage shop content (same tool preferred [F2]). This is the one criterion where C leads and A is unknown; if it is decisive, say so before the meeting.
5. Ask Fram which partner platforms it recommends and whether the module can run unsupported. Also resolve the CMS API limit question for shop sync (item:83be18fb-9a52-48d1-99b7-b8b0fcd84ab5).
6. Customer-service checks from section 1.
7. Confirm the December steering group date.

## 5. Why not B or C
- **B:** the highest cost, over budget in year one, and the longest path to launch. No advantage on the current criteria. Worth reopening only on a much cheaper, committed integration offer. The second reference [task:3a9b946f-6f5d-40d1-b818-36d4685d42e1] would not change this.
- **C:** attractive on cost and same-tool marketing, but the commerce module's end of support in December 2028 [F13] makes it a poor base for a three-year decision unless Fram offers a credible, costed path.

Sources: brief page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0; F6 source:ce7013f6-a8de-4f36-a30d-72e91a10b48e; F7 source:aab34480-3b8e-4c85-8d1b-be2edd2460c2; F8 source:f0733005-7a9b-4157-976b-1c7c612e3b86; F9 source:b0c41c5a-201f-4124-8e33-a13d8223052a; F10 source:6cf4c78b-ad68-4598-8e35-1bd3b680883d; F11–F13 items item:30990d49-75f9-4a56-be3e-205cfac21f7e, item:12c16307-ec66-4201-8b2b-5097c07ad8cf, item:190a61a4-4b0f-40a1-b891-ed209bf0a13c.

## Update, 16 November 2026
- **Option C dropped.** Gunnar agreed today to drop the Fram CMS commerce module because its support ends in December 2028. The choice is now between A Butikkskyen and B Composa. Section 5 on C is background only, and checks 4 and 5 (marketing workflow in Fram, Fram's partner platforms) are no longer needed for the decision. Marketing's same-tool content management remains an open check for A.
- **Butikkskyen go-live line (for the recommendation):** "Counting four months from a decision in December 2026, Butikkskyen could go live in April 2027, about four to five months before the 1 September 2027 target." The four months is the reference customer's launch time [F9], not a Butikkskyen commitment for Northwind. The exact date depends on the steering group date (unconfirmed) and on partner availability. Compare Composa: integration alone takes four months before shop work starts [F11], so a December decision gives a go-live no earlier than the summer, and likely later.

## Updated draft assessment — 23 November 2026 (F14–F18)
Private analytical draft, not an agreed platform decision. Supersedes the 16 November draft's costs, budget, price-list threshold and customer-service gaps where changed. Option C remains dropped by Gunnar's 16 November decision (item:2ca2096d-1e0f-4fe5-99b3-380510626740).

### Customer-service impact first
Hanne reports approximately 300 calls/week about order status and prices combined [F14, item:b35c6c9f-6068-4b92-b730-b79f7d544d0e], and wants customer self-service order status (item:37b92c07-c716-4bbc-9a46-fb2ccd8e3cf0). For A and B, self-service order status, correct customer-price visibility and actual call reduction are unproven. A's standard connector and updated pricing capacity improve its starting position, but do not prove order-status functionality. B's longer integration path risks prolonging the current call burden. Do not assume all 300 calls disappear or calculate staffing savings without evidence. Demo both capabilities with customer service; distinguish order-status and price calls and measure avoidable calls. C is not reopened.

### Recommendation and updated costs
Butikkskyen remains the preferred option, conditionally; no platform has been selected. Four criteria remain time, three-year cost, Dynamics 365 fit and marketing usability; weights/scoring are unagreed (item:ff0ff6b3-9dfe-4145-b81c-57399dc3d570).

| Component / comparison | A Butikkskyen | B Composa |
|---|---:|---:|
| Annual licence | 450,000 NOK, one-store assumption [F12] | 900,000 NOK [F7] |
| Build/integration | 1,100,000 NOK fixed offer from Kodeverket [F17] | ~2,600,000 NOK, assuming 800,000 integration additional to 1.8M build [F11] |
| Year-one licence + build | 1,550,000 NOK | ~3,500,000 NOK |
| Against revised 2,000,000 NOK budget [F18] | 450,000 NOK remaining before unquoted costs | ~1,500,000 NOK over |
| Three-year licence + build | 2,450,000 NOK | ~5,300,000 NOK |

Same component basis as item:fbf86dc1-040f-4177-bbb3-81cf8177b1e8: one build plus three annual licences at unchanged rates; not full TCO. Hosting, support, operations, escalation, tax and scope comparability remain unestablished. A rises 200,000 NOK against the last draft; its headroom falls from 1.15M to 450,000 NOK because the budget also falls 500,000 NOK. Do not describe total affordability as proven.

### Dynamics 365 / pricing update
Northwind has 3,100 price lists [F15, item:0621d14b-70a2-49fc-8722-61c9be198da4]. Vendor says version 4 supports 10,000 without the old workarounds [F16, item:0e9c507d-d349-4d6b-828d-d146a9931dbb]. The historical 2,000-list limitation is no longer the stated current-version blocker; validate Northwind's 3,100 lists on version 4 and near-real-time prices/stock. Do not treat a vendor capacity claim as measured Northwind performance.

### Conditions before commitment
- Obtain Kodeverket's written fixed-price scope, exclusions and integration coverage; confirm v4 and included pricing app. Offer expires 15 December 2026 [F17, items item:743b4971-eb82-410c-8e2b-a4d8f19209c5 and item:d3850b6f-237b-4fd2-a998-93f038aa2aa4]. Fixed-price evidence now exists; contractual completeness remains open.
- Confirm one store, yearly cancellation, full first-year costs within the remaining 450,000 NOK and partner capacity.
- Obtain a committed delivery plan against 1 September 2027. Four-month reference launch is not a Northwind delivery commitment; April 2027 is only an illustrative extrapolation, not a forecast to promise (item:d6583737-d9c6-4746-9918-541a3c7650cb).
- Demo customer order status, customer prices, part-number search and quick reorder; test marketing content workflow.
- Confirm the December steering group date before the offer expires, or seek an extension. Do not infer authority to accept.

Budget source: F18 item:369e363f-2801-4659-ac6c-7344b7010d48. Prior Composa evidence: item:22c5cc38-422c-45ad-b6ff-36c40afa9740. Keep all cost-bearing material private unless approved for sharing; Northwind prices only through procurement portal, never email.

## Steering-group recommendation — 23 November 2026
Status: private draft for review, not a decision or authority to contract. Consolidates F14–F18 and the assessment in item:bcb6269e-76bf-4fb4-8a01-1e645f8cba64; supersedes the 16 November recommendation where inconsistent.

### Customer-service impact
Approximately 300 weekly calls concern order status and prices combined [F14]. Customers should be able to see order status themselves. Butikkskyen has the better evidenced integration starting point; Composa's longer integration path risks delaying benefits. Neither has demonstrated Northwind order-status self-service, price visibility or call reduction. No staffing savings are claimed. Fram commerce remains excluded.

### Recommended course
Proceed with Butikkskyen as preferred platform and Kodeverket as proposed build partner, subject to validation and commercial checks before commitment. This is a qualitative recommendation on the four current criteria, not an agreed weighted score. Standard Dynamics 365 connector, updated pricing capacity and stronger reference timing favour A; marketing usability is unproven for both A and B.

For one store, A's 450,000 NOK annual licence plus Kodeverket's 1.1M fixed build offer gives 1.55M NOK in year one and 2.45M over three years. Against the revised 2.0M first-year budget, 450,000 NOK remains before unquoted costs. B is ~3.5M in year one, ~1.5M over budget, and ~5.3M over three years, assuming the 800,000 integration estimate is additional to its 1.8M build. These are licence/build subtotals, not full TCO.

Northwind's 3,100 price lists fall below Butikkskyen's vendor-stated v4 capacity of 10,000 [F15–F16]. The old 2,000-list workaround is historical; demonstrate current-version performance and near-real-time prices/stock rather than carrying it forward as a blocker.

### Proposed approval gates
1. Demonstrate 3,100 price lists, near-real-time Dynamics 365 sync, order-status self-service, customer prices, part-number search and quick reorder; test marketing workflow.
2. Confirm written fixed-price scope/integration coverage, one-store licence, yearly cancellation, exclusions and all remaining first-year costs within 2.0M NOK.
3. Obtain partner capacity and a committed delivery plan against the shop's 1 September 2027 target. Four-month reference timing is not a Northwind commitment; no April launch promise.
4. Confirm the steering decision date before the offer expires on 15 December 2026, or secure an extension; do not bypass validation to meet expiry.

Proposed steering decision: endorse A as preferred, agree the approval gates and accountable owners, and confirm who may authorise contract commitment after the gates pass. If a material gate fails, return to the steering group; do not default to Composa. C stays dropped due to commerce-module support ending December 2028; website CMS is unaffected.

Evidence: item:bcb6269e-76bf-4fb4-8a01-1e645f8cba64 and F14–F18 on page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0. Cost-bearing material for Northwind must go through the procurement portal, never email.

===== Decision: drop Fram CMS commerce module (Option C) =====
# Decision: drop Fram CMS commerce module (Option C)

On 16 November 2026, Gunnar Holm agreed (as reported by Ana) to drop Option C, the Fram CMS commerce module, from the platform choice for the spare parts shop. Reason: Fram's support for the commerce module ends in December 2028, and Fram recommends moving to a partner platform (item:190a61a4-4b0f-40a1-b891-ed209bf0a13c). The comparison is now between A Butikkskyen and B Composa. Fram's strengths (lowest quoted cost on paper, same-tool marketing) are historical evidence only. Related research brief: page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0. This applies to the shop module only; the website relaunch on the Fram CMS is not affected by this decision.

===== 2026-11-23 Session: commerce platform analysis (record) =====
# 2026-11-23 Session: commerce platform analysis

## Worked on
- Saved F14–F18 in the research brief (page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0): ~300 weekly status/price calls and desired order-status self-service; 3,100 price lists; vendor-stated v4 capacity of 10,000 without old workarounds; Kodeverket's fixed 1.1M NOK build offer, valid until 15 December 2026; revised year-one budget 2.0M NOK.
- Updated the recommendation (item:a8e497ae-b370-4732-9a60-5a9c992f924b) and drafted a nine-slide steering presentation (page:4860b841-351c-416f-82e9-4c517721030d, item:6ff168bd-7a7d-405f-9c20-7d029cc29d23).

## Decisions / draft conclusions and why
- Draft still prefers Butikkskyen with Kodeverket, conditionally: stronger speed evidence, standard Dynamics 365 connector and lower licence/build subtotal. No platform selected, contract authorised or material shared. Fram commerce remains dropped under the earlier decision.
- Current A subtotal: 1.55M NOK year one, 2.45M over three years, assuming one store. Only 450,000 NOK remains before unquoted costs. B remains ~3.5M year one (~1.5M over revised budget), ~5.3M over three years, assuming integration is additional. Not full TCO.
- Historical 2,000-list workaround is no longer the vendor-stated current-version blocker; v4 performance still needs validation. Do not promise April 2027 based on a four-month reference launch, or claim all 300 calls will disappear.
- At Ana's explicit request, added only “The B2B Pricing app is a third-party dependency” to slide 8 (risk/approval gates). All other slide content unchanged; recommendation unchanged (item:8f9705c8-76cd-4346-9138-c14b3586d803).

## Still open
- Customer-visible order status, correct prices, v4 performance with 3,100 lists, near-real-time prices/stock, part-number search/quick reorder, marketing workflow and operating workload.
- Written build scope/integration/exclusions, one-store assumption, yearly cancellation, full first-year affordability, partner capacity and committed plan for shop target 1 September 2027.
- December steering date, approval-gate owners and contract authority; Composa build/integration cost overlap; criteria weights/scoring. Contributors in slides are proposed, not assigned.
- Second Composa reference task remains open (task:3a9b946f-6f5d-40d1-b818-36d4685d42e1). Customer-service-first standing-rule proposal is still pending, not active (proposal:a7e4045d-8e22-4023-84b7-aa040afca564).

## Next steps
1. Confirm steering timing and Kodeverket's written offer; complete checks before 15 December 2026 or seek extension (task:07d09a21-2c96-4ad9-a78c-c3a594a6b258).
2. Run technical/customer-service demos with Hanne and Ola, and validate marketing/commercial conditions (task:605fdfc6-44e3-4c6c-b22b-d3e67fe43bab). Split status/price calls before estimating benefits.
3. Agree approval-gate owners and decision authority with Gunnar; finalise recommendation and slides after validation. Review whether to retain the second-reference task; user decides pending rule in Homing.
4. Keep drafts private until sharing is approved. Northwind prices only through procurement portal, never email; do not name other clients in Northwind-facing material.

===== 2026-11-09 Session: commerce platform analysis (record) =====
# 2026-11-09 Session: commerce platform analysis

## Worked on
Added F6–F10 (three vendor quotes and two customer reference calls) and sourced comparisons to the private research brief: page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0.
- Butikkskyen: strongest current evidence for speed (four-month reference launch) and an included Dynamics 365 connector; pricing workarounds above 2,000 price lists need checking against Northwind's actual needs. Parts and price lists are different counts.
- Composa: reference reports flexibility, nine-month launch and integration overrun; no standard Dynamics 365 connector. Quoted first-year licence + build is ~2.7M NOK, 200k above budget before unquoted costs.
- Fram: lowest quoted three-year licence + build and marketing stays in Fram; delivery timing and ERP fit remain unverified.
Indicative three-year licence + build: A 2.7M, B 4.5M, C 2.1M NOK—not full TCO (item:735db84a-f929-40fc-98d3-25555d4f707f). Timing and integration evidence: item:cc596076-0b7f-4a0d-a5d6-ba0042db36e6; item:1be4dd26-bf52-49af-a5e7-d76e4d4093fd.

## Decided and why
- Dropped design flexibility following Ana's 9 November call with Gunnar: he says it does not matter for Northwind. Four current criteria: time to market, three-year cost, Dynamics 365 fit, marketing usability (item:ff0ff6b3-9dfe-4145-b81c-57399dc3d570). This supersedes the earlier five-criterion basis; design evidence stays historical.
- Gunnar requested a short customer-service impact section for each option before anything else in future platform analyses. This is an added analysis section, not an agreed scoring criterion. Standing-instruction proposal:a7e4045d-8e22-4023-84b7-aa040afca564 awaits approval; not yet an active rule.
- No platform selected. Ana tentatively leans towards Composa but is concerned about integration (item:bf9ce7db-bd78-472a-84e0-23fec7bfed4f; item:f3a7c8c4-ada9-4eb0-9a53-3558db793e21). Her preference is not evidence or a final recommendation. Brief and session record remain private.

## Still open
- Customer-service impacts have not yet been analysed; criteria weights and scoring remain unagreed.
- Ola's Composa integration check is pending for 9–15 November (item:92202ef0-0585-4762-830a-1385f3a379e5).
- Like-for-like full TCO, Composa budget gap, fixed build prices and yearly cancellation rights; realistic Northwind delivery dates and workload for the two-person integration team.
- Near-real-time prices/stock, pricing scale, Fram integration and applicability of the flagged CMS API limit; marketing workflow for A/B and ordering by part number/quick reorder. Whether procurement and ordering needs become formal criteria or requirements remains unresolved.
- Second Composa reference task remains open; F10 alone does not establish that it fulfils that task. December steering group date remains unconfirmed.

## Next steps
1. Next analysis: start with the requested customer-service impact section for all three options, distinguishing evidence from assumptions and gaps. User to decide the standing-instruction proposal in Homing: http://localhost:4480/proposals/a7e4045d-8e22-4023-84b7-aa040afca564.
2. Follow up Ola's integration check this week and capture findings (task:1813ab18-ac94-40c0-b38c-ad967b42e2db).
3. Resume the existing second-reference task (task:3a9b946f-6f5d-40d1-b818-36d4685d42e1) and remaining evidence gaps; agree weights before a scored recommendation.
4. Confirm December steering group date and work back to the recommendation. Northwind prices only through the procurement portal, never email.

===== Research brief: commerce platform for Northwind spare parts shop =====
# Research brief: commerce platform for Northwind spare parts shop

## Question
Which commerce platform should Northwind use for its new spare parts shop? Gunnar Holm wants a recommendation for the steering group in December 2026. Built over several sessions.

## Options
- **A. Butikkskyen**: a SaaS shop platform.
- **B. Composa**: a headless commerce engine with its own frontend.
- **C. Fram CMS commerce module**: the commerce module of the CMS that runs Northwind's new website.

## Goals and constraints
- Sell spare parts online to dealers and workshops; about 4,000 parts. [F1]
- Live by 1 September 2027. [F1]
- Customer-specific prices. [F1]
- Dynamics 365 is the ERP and holds prices and stock; every option must read both from it in near real time. [F1, F3]
- First-year budget 2.5 million NOK, licences and build included. [F1]
- Integration team at Northwind is two people. [F3]
- Procurement wants a fixed price for the build and licences that can be ended yearly. [F4]
- Marketing should manage shop content in the same tool as the website. [F2]
- Workshops want to reorder in a few clicks. [F2]
- Handling rule: Northwind prices go only through their procurement portal, never by email.

## Criteria (agreed at kickoff, 28 October) [F1]
1. Time to market (Gunnar: matters most [F2])
2. Cost over three years
3. Fit with Dynamics 365
4. Ease of use for marketing
5. Design flexibility

Not yet agreed: weights and scoring scale. Procurement's needs (fixed build price, yearly-cancellable licences [F4]) and ordering by part number / quick reorder [F2, F5] are not criteria yet; treat them as requirements or add them, to be decided.

## What we know so far (sources)
- [F1] Kickoff notes, 28 Oct (Ana): ~4,000 parts, dealers and workshops, live 1 Sep 2027, customer-specific prices, Dynamics 365 holds prices and stock, first-year budget 2.5M NOK incl. licences and build, five criteria agreed.
- [F2] Interview, Gunnar Holm, 29 Oct: speed to market matters most; marketing manages shop content in the same tool as the website; workshops want to reorder in a few clicks.
- [F3] Interview, Ola Nordmann (integration architect), 29 Oct: every option must read prices and stock from Dynamics 365 in near real time; integration team is two people.
- [F4] Interview, Lise Berg (procurement), 30 Oct: fixed price for the build; licences that can be ended yearly.
- [F5] Market note, Cara, 30 Oct: dealers mostly order by part number; 70% of orders come by email and phone today.

No evidence yet on how any of the three options performs against the criteria.

## Open questions
- Do A, B and C each support customer-specific prices, and a Dynamics 365 connection with near-real-time prices and stock? Is the connector ready-made or built? [F1, F3]
- Can each vendor give a fixed build price and yearly-cancellable licences? [F4]
- Realistic time to launch for each against 1 Sep 2027? [F1, F2]
- Three-year cost per option (licences, build, running); does the first year fit 2.5M NOK? [F1]
- Can the two-person integration team run each option? [F3]
- Can marketing manage shop content in the website tool (strongest for C?) [F2]
- Part-number search, quick reorder and fast ordering for dealers who mostly order by email/phone today. [F2, F5]
- Criteria weights: who decides, and does Gunnar's "speed first" mean top weight?
- Does the Fram CMS API limit (10 requests a second, a risk noted in Website relaunch, item:8dafc426-948b-47d7-9501-6937f372ec95) matter for shop sync? Check whether it is the same vendor.
- Exact date of the December steering group meeting.

## Comparison — time to market (9 November 2026)
Basis: agreed criterion 1 (item:ef6a85a2-0761-49fc-8622-91ce7e26a4aa); launch target 1 September 2027 [F1], speed matters most to Gunnar [F2].
- **A Butikkskyen:** one customer went live in four months [F9]. Strongest positive delivery-time evidence so far, not a Northwind delivery commitment. Partner build [F6]; partner availability and scope remain unverified.
- **B Composa:** one customer launched after nine months; integration took longer than planned [F10]. Material schedule risk: nine months from a December 2026 decision leaves little or no buffer before 1 September 2027. This is a reference experience, not a Northwind estimate.
- **C Fram CMS:** no delivery-duration evidence in F8. Unknown, not assumed faster because it is the existing CMS.
Sources: F6 source:ce7013f6-a8de-4f36-a30d-72e91a10b48e; F9 source:b0c41c5a-201f-4124-8e33-a13d8223052a; F10 source:6cf4c78b-ad68-4598-8e35-1bd3b680883d; F1–F2 item:1a01b3f4-adbb-48fd-9fe3-7933158ee8d5.

## Comparison — cost over three years (9 November 2026)
Agreed criterion 2, item:ef6a85a2-0761-49fc-8622-91ce7e26a4aa. Indicative calculations assume one build plus three full annual licence payments at unchanged quoted rates; not full TCO. NOK, rounded estimates:
| Option | Annual licence | Build | Three-year licence + build | First-year licence + build | Against 2.5M first-year budget [F1] |
|---|---:|---:|---:|---:|---|
| A Butikkskyen [F6] | 600,000 | ~900,000 (partner) | ~2,700,000 | ~1,500,000 | ~1,000,000 remaining before unquoted costs |
| B Composa [F7] | 900,000 | ~1,800,000 (frontend included) | ~4,500,000 | ~2,700,000 | ~200,000 over, before unquoted costs |
| C Fram CMS [F8] | 300,000 (commerce module) | ~1,200,000 | ~2,100,000 | ~1,500,000 | ~1,000,000 remaining before unquoted costs |
C has the lowest quoted subtotal; A is next; B is highest and exceeds the first-year budget on quoted components alone. Scope is not proven like-for-like. Hosting, operation, support, maintenance, integration scope, ongoing CMS costs for C, licence escalation and tax treatment are not established. Build estimates are not confirmed fixed-price offers. Annual prices do not establish yearly cancellation rights [F4].
Sources: F6 source:ce7013f6-a8de-4f36-a30d-72e91a10b48e; F7 source:aab34480-3b8e-4c85-8d1b-be2edd2460c2; F8 source:f0733005-7a9b-4157-976b-1c7c612e3b86; F1/F4 item:1a01b3f4-adbb-48fd-9fe3-7933158ee8d5.

## Comparison — fit with Dynamics 365 (9 November 2026)
Agreed criterion 3 (item:ef6a85a2-0761-49fc-8622-91ce7e26a4aa). Near-real-time prices and stock, customer-specific pricing, and a two-person integration team are the relevant constraints [F1,F3].
- **A Butikkskyen:** standard Dynamics 365 connector included; B2B Pricing app for customer-specific prices included in licence [F6]. Reference confirms customer-specific pricing worked, but required workarounds above 2,000 price lists [F9]. Best evidenced starting point for integration, not proof of near-real-time performance or low operational workload. Northwind's number of price lists is unknown; ~4,000 parts is not ~4,000 price lists.
- **B Composa:** no standard Dynamics 365 connector; integration via Composa API [F7]. Reference experienced integration delay [F10]. Higher indicated custom-integration/delivery risk for a two-person team; actual effort and operating burden unquantified. Near-real-time sync and customer-specific prices unverified.
- **C Fram CMS:** Dynamics 365 connector, customer-specific prices and sync performance unverified in F8. Existing CMS use does not establish ERP fit. Whether the previously flagged CMS API limit applies to Fram and affects shop sync remains unresolved (item:83be18fb-9a52-48d1-99b7-b8b0fcd84ab5).
Sources: F6 source:ce7013f6-a8de-4f36-a30d-72e91a10b48e; F7 source:aab34480-3b8e-4c85-8d1b-be2edd2460c2; F8 source:f0733005-7a9b-4157-976b-1c7c612e3b86; F9 source:b0c41c5a-201f-4124-8e33-a13d8223052a; F10 source:6cf4c78b-ad68-4598-8e35-1bd3b680883d; F1/F3 item:1a01b3f4-adbb-48fd-9fe3-7933158ee8d5.

## Comparison — ease of use for marketing (9 November 2026)
Agreed criterion 4 (item:ef6a85a2-0761-49fc-8622-91ce7e26a4aa). Gunnar wants marketing to manage shop content in the same tool as the website [F2].
- **A Butikkskyen:** marketing workflow and same-tool content management not evidenced in F6/F9; unknown.
- **B Composa:** marketing workflow and same-tool content management not evidenced in F7/F10; included frontend does not prove editor usability or CMS integration.
- **C Fram CMS:** vendor states marketing keeps working in Fram [F8]. Strongest evidence of alignment with the same-tool preference. Actual shop-editing usability, capabilities and effort have not been demonstrated or independently validated.
Sources: F2 item:1a01b3f4-adbb-48fd-9fe3-7933158ee8d5; F8 source:f0733005-7a9b-4157-976b-1c7c612e3b86.

## Comparison — design flexibility (9 November 2026)
Agreed criterion 5 (item:ef6a85a2-0761-49fc-8622-91ce7e26a4aa).
- **A Butikkskyen:** no direct design-flexibility evidence in F6/F9; unknown, not assumed inflexible because it is SaaS.
- **B Composa:** reference customer describes it as very flexible [F10]; strongest qualitative flexibility signal so far. The statement does not isolate visual/frontend flexibility, so design-specific capability remains to be demonstrated. Frontend included in build estimate [F7], but that alone does not establish flexibility.
- **C Fram CMS:** no direct design-flexibility evidence in F8; unknown.
Sources: F7 source:aab34480-3b8e-4c85-8d1b-be2edd2460c2; F10 source:6cf4c78b-ad68-4598-8e35-1bd3b680883d.

## Current criteria — revised 9 November 2026
Ana reports that Gunnar said design flexibility does not matter for Northwind and should be dropped. The current criteria are:
1. Time to market.
2. Cost over three years.
3. Fit with Dynamics 365.
4. Ease of use for marketing.
This supersedes the five-criterion list in item:ef6a85a2-0761-49fc-8622-91ce7e26a4aa and the earlier decision to retain all five in item:9468d1d6-9eaa-4309-a697-545b5504e6af. The design comparison item:87e030cc-1c92-4d64-9c7b-b62c58907529 is historical evidence, no longer an active criterion. Weights and scoring remain unagreed. Gunnar's requested customer-service impact section is an additional analysis section, not an agreed new scoring criterion.

As of 9 November 2026, Ana is leaning towards Composa. This is a tentative personal preference, not a platform decision or evidence that Composa best meets the criteria.

As of 9 November 2026, Ana is concerned about Composa's integration.

Ola will check Composa's integration during the week of 9–15 November 2026, according to Ana on 9 November. No outcome has yet been reported.

## Finding F11 — Composa custom Dynamics 365 integration (Ola Nordmann, 11 November 2026)
Ola Nordmann (integration architect) says Composa needs a custom integration with Dynamics 365. His estimate: 800,000 NOK and four months, before the shop work can start. This is the outcome of the integration check expected for 9–15 November (item:92202ef0-0585-4762-830a-1385f3a379e5). It confirms F7 (no standard connector). It is an estimate, not a quote. Not yet established: whether the 800,000 NOK overlaps with Composa's ~1,800,000 NOK build estimate [F7], and whether it includes ongoing operation by the two-person team.

## Finding F12 — Correction to Butikkskyen licence price (Butikkskyen, 12 November 2026)
Butikkskyen corrects F6: the 600,000 NOK annual licence was for two stores. For one store it is 450,000 NOK a year. This supersedes the 600,000 NOK figure in the cost comparison (item:735db84a-f929-40fc-98d3-25555d4f707f), which was Ana's earlier record and is left unchanged as history. The assumption that Northwind needs one store is not yet confirmed in the brief. Build estimate (~900,000 NOK, partner) is unchanged.

## Finding F13 — Fram CMS commerce module end of support (Fram CMS, 12 November 2026)
Fram CMS says support for the commerce module ends in December 2028. Fram recommends that customers move to a partner platform. Option C's quote [F8] covers this module. The statement is about the commerce module; it does not say the CMS itself loses support (the website relaunch runs on the CMS). Not yet established: which partner platforms Fram means, whether the module can be bought and run unsupported, and whether Fram's quote [F8] reflects this.

## Comparison update — cost, time and risk after F11–F13 (16 November 2026)
Supersedes the figures in item:735db84a-f929-40fc-98d3-25555d4f707f where they differ. Same basis: one build plus three annual licences, quoted rates, not full TCO. NOK, rounded.

| Option | Annual licence | Build incl. integration | First-year | Three-year | Against 2.5M first year |
|---|---:|---:|---:|---:|---|
| A Butikkskyen [F6, F12] | 450,000 | ~900,000 | ~1,350,000 | ~2,250,000 | ~1,150,000 remaining |
| B Composa [F7, F11] | 900,000 | ~1,800,000 + ~800,000 integration = ~2,600,000 | ~3,500,000 | ~5,300,000 | ~1,000,000 over |
| C Fram CMS [F8, F13] | 300,000 | ~1,200,000 | ~1,500,000 | ~2,100,000 on paper, but see below | ~1,000,000 remaining |

- **A:** cheapest of the three after the correction (F12), assuming one store for Northwind (to confirm). Previous figures: licence 600,000, three-year ~2.7M, first year ~1.5M.
- **B:** F11 adds ~800,000 NOK on the assumption that it is additional to the ~1.8M build [F7]; if part of it overlaps, the total is lower. Composa moves from ~200,000 to ~1,000,000 over budget on quoted and estimated components alone, and is the most expensive over three years. Time: integration takes four months before shop work can start. From a December 2026 decision (date unconfirmed) that is about April 2027, leaving about four to five months for the shop against 1 September 2027. The reference customer needed nine months in total [F10]. The schedule is now very tight, and Composa's quoted timeline is not yet known.
- **C:** the commerce module loses support in December 2028 [F13]. The three-year figure of ~2.1M assumes a module that is supported for all three years. If the shop launches 1 September 2027, the module is supported for about 15 months of use; a migration to another platform would probably be needed during the 3-year period and is not costed. C's cost advantage over A is therefore not reliable. Timing and Dynamics 365 fit for C are still unverified.
- Gaps: Fram's partner platforms and whether the module can run unsupported; Composa build/integration overlap; Butikkskyen store count; fixed prices and yearly cancellation [F4].

Ana's tentative lean towards Composa (item:bf9ce7db-bd78-472a-84e0-23fec7bfed4f) was recorded on 9 November, before F11–F13. The new evidence goes against it on cost, time and integration risk; whether her view changes is for Ana to decide.

## Option B Composa — revisited after Ola's estimate (16 November 2026)
Against the four current criteria (item:ff0ff6b3-9dfe-4145-b81c-57399dc3d570), with F11 (Ola, 11 Nov) included.
- **Time to market:** Ola's four months of custom integration must be done before shop work starts [F11]. From a mid-December 2026 decision (steering group date unconfirmed) integration ends about mid-April 2027, leaving about 4.5 months for the shop before 1 September 2027. The reference customer needed nine months in total, with an integration overrun [F10]. Nine months from December reaches September with no buffer; if integration is additional to those nine months, the date is missed. Composa itself has not given a timeline for Northwind. Weakest option on speed, which Gunnar rates most important [F2].
- **Cost over three years:** about 3.5M NOK in year one (1.0M over the 2.5M budget) and about 5.3M over three years, roughly 2.4 times Butikkskyen's 2.25M. This assumes Ola's 800,000 NOK is additional to the 1.8M build [F7]. The overlap is not confirmed. The 800,000 NOK is Northwind's internal estimate, not a Composa quote.
- **Dynamics 365 fit:** confirmed as a custom build, with no standard connector [F7, F11]. Northwind would own it, and a two-person integration team would maintain it. Operating effort, near-real-time performance and customer-specific prices are not verified.
- **Marketing ease of use:** no evidence for B, as before. The included frontend does not prove same-tool content management.
- **What B still has:** the reference describes it as very flexible [F10]. Design flexibility is no longer a criterion, so it does not count now.
- **Assessment:** on the evidence so far B is the weakest on time, cost and integration, and has no advantage on the active criteria. It would only be worth revisiting if Composa or a partner offers a much cheaper, faster integration and a committed schedule for Northwind. Ana's earlier lean (item:bf9ce7db-bd78-472a-84e0-23fec7bfed4f) predates this evidence.

[F14] Hanne Ruud, head of customer service, reported on 17 November 2026 that customer service receives about 300 calls per week about order status and prices. This is a combined count, not 300 order-status calls plus price calls.

[F14] Hanne Ruud reported on 17 November 2026 that customer service wants customers to be able to see order status themselves. Capability and call reduction are not yet demonstrated for either active platform option.

[F15] Ola Nordmann reported on 18 November 2026 that Northwind has 3,100 customer-specific price lists. This resolves the previously unknown price-list count; it is distinct from the approximately 4,000 parts.

[F16] Butikkskyen stated on 19 November 2026 that B2B Pricing version 4, released in October 2026, supports up to 10,000 price lists and removes the need for the workarounds reported by the earlier reference [F9]. The old 2,000-list workaround threshold is historical, not the stated current-version limit. This is a vendor claim; Northwind performance and near-real-time Dynamics 365 sync remain to be tested.

[F17] Lise Berg reported on 19 November 2026 that Butikkskyen partner Kodeverket offers the build for a fixed 1,100,000 NOK. Use this offer instead of the earlier approximately 900,000 NOK build estimate for current comparisons. Written scope, integration coverage, exclusions, tax treatment and delivery commitment are not established by the finding.

[F17] The Kodeverket fixed-price build offer reported by Lise Berg on 19 November 2026 is valid until 15 December 2026.

[F18] Gunnar Holm reported on 20 November 2026 that management has reduced the first-year budget for the spare parts shop to 2,000,000 NOK. This supersedes the previous 2,500,000 NOK budget [F1]; do not use the old budget in current affordability comparisons.

## Finding F19 — Composa with nightly import instead of custom integration (Ola Nordmann, 27 November 2026; Gunnar's question)
Option B Composa, follow-up to F11 and item:22c5cc38-422c-45ad-b6ff-36c40afa9740. Ola Nordmann says a nightly import of prices and stock would cost about 200,000 NOK instead of the 800,000 NOK custom integration [F11], but prices in the shop could be up to a day old. This is an estimate, not a Composa quote.

- **Cost (same basis as item:fbf86dc1-040f-4177-bbb3-81cf8177b1e8; licence + build, not full TCO; assumes the integration cost is additional to the ~1.8M build, overlap unconfirmed):** build + integration ~2.0M NOK (was ~2.6M); year one ~2.9M NOK (was ~3.5M), about 0.9M over the revised 2.0M budget [F18]; three years ~4.7M NOK (was ~5.3M). Still the most expensive option and still over the first-year budget. Butikkskyen with Kodeverket remains 1.55M year one, 2.45M over three years.
- **Requirement conflict:** every option was to read prices and stock from Dynamics 365 in near real time [F1, F3]. A nightly import does not meet this: prices up to a day old, and stock presumably as well, which could mean wrong prices or unavailable parts shown. Whether Northwind accepts day-old prices is a business decision (Gunnar, procurement, customer service) and is not established here.
- **Customer service:** day-old prices could add price-related calls, which are part of the ~300 calls a week [F14]. Not measured. Order-status self-service is not covered by F19.
- **Not established by F19:** the time to deliver the nightly import (F11's four months applied to the custom integration); whether it removes the custom-integration timing risk against 1 September 2027; ongoing operation by the two-person team; how customer-specific prices (3,100 price lists [F15]) would be handled in a nightly import.
- **Assessment:** F19 narrows B's cost gap but does not remove it, and trades the cost for a weaker fit with Dynamics 365. The draft recommendation (Butikkskyen preferred, conditionally) is unchanged; the draft and slides have not been updated for F19. Whether the view changes is for Ana and Gunnar to decide.

===== 2026-11-02 Session: commerce platform analysis (record) =====
# 2026-11-02 Session: commerce platform analysis

## Worked on
Set up the research brief for Northwind's spare parts shop platform choice: page:1d46ebfc-5ef6-496c-9987-bd0b65a626a0. It holds the question, goals and constraints, the five kickoff criteria, the three options (A Butikkskyen, B Composa, C Fram CMS commerce module), findings F1–F5 with sources, and open questions.

## Decided
- The five criteria from the kickoff (28 Oct) stay as the basis. They were agreed with Northwind, so we did not change them.
- Collect evidence on all three options in the same way, so the comparison is fair.
- Ask Composa for a second reference customer (task:3a9b946f-6f5d-40d1-b818-36d4685d42e1), so that Option B is judged on the same kind of evidence as the others.
- The brief stays private to Ana for now. Nothing is shared yet.

## Still open
- Criteria weights and scoring scale. Procurement's needs (fixed build price, yearly-cancellable licences) and part-number ordering/quick reorder are not yet criteria or requirements.
- No evidence yet on how any option meets the criteria. Open questions are listed in the brief: Dynamics 365 connection, customer-specific prices, fixed build price, time to launch, three-year cost, workload for the two-person integration team, content in the website tool.
- Whether the CMS vendor's 10 requests a second API limit applies to Fram and matters for the shop.
- Exact date of the December steering group meeting.

## Next steps
1. Agree criteria and weights, and whether procurement's needs and part-number ordering become criteria or requirements.
2. Collect vendor facts per option against the open questions. Northwind prices only through their procurement portal.
3. Ask Composa for a second reference customer.
4. Check the API limit with the CMS vendor (Lars is looking into it).
5. Confirm the December steering group date and work back to a draft recommendation for Gunnar.
