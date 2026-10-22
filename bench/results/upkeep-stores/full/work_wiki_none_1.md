===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work is the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

A second piece of work is the platform choice for the spare parts shop, which should go live on 1 September 2027. See [the research brief](commerce-platform/research-brief.md).


===== log.md (record) =====
# Log

- 2026-11-30: Added F19 (Ola, 27 November: Composa nightly import ~0.2m instead of 0.8m, prices up to a day old) as a short note under Composa in the research brief and the draft recommendation's comparison, with recalculated costs (~2.9m year one, ~4.7m three years) and the near-real-time requirement issue. Recommendation unchanged; presentation outline not updated.

- 2026-11-23: Added Ana's note that B2B Pricing is a third-party dependency to the risks section of slide 8 in the steering group presentation outline. Left all other slides and the recommendation unchanged.

- 2026-11-23: Refined the updated recommendation with proposed steering group resolution and explicit return-for-approval before contract commitment; linked a new nine-slide steering group presentation outline covering F14–F18, costs, pricing, self-service, schedule, approval checks and 15 December expiry. Listed the outline in the index. Both remain drafts, not approved decisions.

- 2026-11-23: Updated the commerce-platform research brief and draft recommendation with F14–F18: customer service's ~300 weekly status/price calls and self-service status need; resolved price-list count (3,100) and superseded the old workaround caveat with vendor's v4/10,000-list claim, retaining validation; replaced A's build estimate with Kodeverket's 1.1m fixed offer expiring 15 December; applied the 2.0m first-year budget, recalculating A to 1.55m year one/2.45m three years with 0.45m headroom and B to 1.5m over budget. Revised checks, customer-service analysis and urgent approval/extension next steps; kept A conditional and C dropped; updated index.

- 2026-10-20: The wiki holds Acme, Northwind, Fjord Bank and Ana’s own pages.
- 2026-11-02: Added acme/northwind/commerce-platform/research-brief.md (commerce platform analysis for the Northwind spare parts shop) and listed it in the index.
- 2026-11-02: Added a next step to the research brief: ask Composa for a second reference customer.
- 2026-11-09: Updated acme/northwind/commerce-platform/research-brief.md with findings F6–F10, a sourced five-criteria comparison, indicative first-year and three-year costs, and revised evidence gaps and follow-ups; updated its index entry.
- 2026-11-09: Following Ana's call update, removed design flexibility from the brief's criteria, comparison and evaluation follow-ups; queued the customer service implications section as the first task next session; recorded Ana's provisional Composa preference and Ola's integration check this week, with findings pending. Updated the index entry.
- 2026-11-16: Updated the research brief with F11–F13: Composa integration (800k NOK, four months) added to cost and schedule; Butikkskyen licence corrected to 450k NOK for one store and costs recalculated; Fram commerce module end of support (Dec 2028) noted and its cost subtotal marked not comparable; added the customer service implications section; revised the interim view, open questions and next steps; updated the index entry.
- 2026-11-16: Added an "Option B (Composa) revisited" section to the research brief and created acme/northwind/commerce-platform/recommendation-draft.md (draft, conditional recommendation of Butikkskyen; not agreed with Gunnar); listed it in the index.
- 2026-11-16: Recorded the decision, agreed with Gunnar, to drop Fram's commerce module (option C) because support ends in 2028. Marked C as dropped in the research brief and closed its open questions and next steps. Rewrote the draft recommendation for two options and added the Butikkskyen go-live line (about April 2027, counting four months from a December decision, with the caveat that it rests on Agder Maskin's project). Updated the index.


===== acme/northwind/commerce-platform/research-brief.md =====
# Commerce platform for Northwind's spare parts shop: research brief

Type: analysis brief
Status: updated **23 November 2026** with [F14–F18]. Preliminary comparison; weights, technical validation and contract scope remain open. [Draft recommendation](recommendation-draft.md): Butikkskyen, conditional, not an approved platform decision. **Decided 16 November: Fram commerce (C) is dropped.**

## What changed on 23 November 2026

- **Customer service:** Hanne Ruud reports about **300 calls a week about order status and prices**, and wants customers to see order status themselves [F14]. This is a combined call baseline, not 300 calls for each topic or a forecast of calls saved. Add customer-facing order-status demonstration to the evaluation.
- **Pricing scale:** Northwind has **3,100 customer-specific price lists** [F15]. Butikkskyen says B2B Pricing version 4, released in October, supports **up to 10,000 lists**, without the workarounds Agder Maskin needed [F16]. The old above-2,000-list caveat [F9] is superseded for version 4, not a current reason to reject A. Northwind is within the stated capacity, but performance, pricing correctness and connector behaviour still need validation.
- **Fixed-price build:** Kodeverket, Butikkskyen's partner, offers the build for **1.1m NOK fixed**, valid until **15 December 2026** [F17]. This replaces the earlier ~0.9m build estimate [F6] in the current comparison. Scope, exclusions, delivery and acceptance terms still need checking.
- **Budget cut:** management's first-year limit is now **2.0m NOK** [F18], replacing 2.5m [F1]. A's licence-and-build subtotal is **1.55m in year one**, leaving **0.45m** for unquoted costs, and **2.45m over three years** [F12, F17]. B remains about **3.5m in year one**, now **1.5m over budget** [F7, F11, F18].
- **Decision timing:** the December steering group date remains unknown. Confirm it immediately against the 15 December offer expiry. If approval and checks cannot finish in time, request an extension; do not assume either acceptance or an extension.

## Question and goals

Which commerce platform should Northwind use for its new spare parts shop? Gunnar Holm wants a recommendation for the steering group in December 2026; exact date and decision format remain unknown.

- Sell about 4,000 spare parts online to dealers and workshops; go live **1 September 2027** [F1].
- Speed to market matters most to Gunnar; marketing should manage shop content in the same tool as the website; workshops should reorder in a few clicks [F2].
- Customer service wants customers to see order status themselves [F14]. This is a newly evidenced functional need, not an agreed weighted criterion.

## Constraints and criteria

- Customer-specific prices [F1]; **3,100 customer-specific price lists** [F15]. Parts and price lists are different counts.
- Dynamics 365 holds prices and stock [F1]; all options must read these in near real time [F3]. Northwind's integration team has two people [F3].
- **First-year budget: 2.0m NOK** [F18], superseding the original 2.5m including licences and build [F1].
- Procurement wants fixed-price build and yearly-terminable licences [F4]. A now has a fixed-price build offer [F17]; annual termination is still unconfirmed.

Current criteria: **time to market, cost over three years, fit with Dynamics 365, ease of use for marketing** [F1; Ana's update, 9 November]. Weights are not agreed; Gunnar ranks speed first [F2]. No weighted scores assigned. Design flexibility was removed on 9 November because Gunnar says it does not matter. Historical reference comments on flexibility are not a basis for ranking.

Near-real-time prices/stock are mandatory; Dynamics fit measures effort to achieve this. Fixed price and annual termination, fast reorder, part-number ordering and customer-facing order status need explicit acceptance checks [F2–F5, F14]. Agree with Gunnar how these are treated as pass/fail requirements. Platform longevity beyond the three-year horizon is a suggested requirement, not yet agreed.

## Options and decision history

| | Option | Status |
|---|---|---|
| A | Butikkskyen: SaaS shop, partner build [F6]; Kodeverket fixed-price offer [F17] | Conditional preferred option, not approved. |
| B | Composa: headless engine; quoted build includes frontend [F7]; custom Dynamics integration needed [F11] | Not recommended on current cost and schedule evidence. |
| C | Fram CMS commerce module; marketing stays in Fram [F8] | **Dropped by agreement with Gunnar, 16 November 2026** (Ana's update), because support ends December 2028 [F13]. Not a candidate. |

Ana was leaning towards Composa on 9 November but worried about integration. Ola's subsequent estimate [F11] confirms additional cost and sequencing risk. The reason behind Ana's preference is not recorded; do not infer it.

## Comparison of the remaining options

Assessments are inferences from cited evidence, not vendor guarantees. Unknowns are not scored as failures.

| Criterion | A — Butikkskyen | B — Composa |
|---|---|---|
| Time to market | Strongest reference for speed: Agder Maskin live in four months [F9]. Included connector may reduce work [F6]. Counting four months from a December 2026 decision gives **April 2027**, early or late according to decision date, about four months before the deadline. This is reference-based arithmetic, not Northwind's delivery commitment. Confirm Kodeverket capacity, scope and dated plan. Offer expires 15 December [F17]. | Four months of integration **before shop work starts** [F11]. If begun in December, integration ends around April, leaving about five months for build and testing. Reference launched after nine months with integration overrun [F10]; nine months from December ends around September with no margin. Northwind shop duration is unquoted. |
| Cost over three years | **2.45m NOK** licence + build; **1.55m first year**, with **0.45m headroom** under current budget [F12, F17, F18]. Not full TCO. | **5.3m NOK** licence + build + integration; **3.5m first year**, **1.5m over budget** [F7, F11, F18], before unquoted costs. |
| Fit with Dynamics 365 | Standard connector and B2B Pricing app included [F6]. Northwind's 3,100 lists [F15] are within v4's vendor-stated 10,000 capacity; old workarounds no longer needed [F16]. Most promising evidence for lower effort; near-real-time behaviour, correctness and performance remain unproven. | No standard connector; custom integration estimated at 800,000 NOK and four months [F7, F11]. Reference integration overrun [F10]. High delivery/operations risk with a two-person integration team [F3]. Near-real-time capability unverified. |
| Ease of use for marketing | No demonstration of shop content managed in Fram, the website's tool [F2, F6]. Same-tool workflow remains a major gap. | Included frontend does not establish editorial workflow or Fram integration [F7]. Same-tool goal and usability unverified. |

### Cost basis and first-year budget

Million NOK; one build plus one or three annual licences, with B's integration added. Rates assumed unchanged. These are **subtotals, not complete total cost of ownership**. A's fixed price is subject to the offer's scope and validity; B's build and integration remain estimates.

| Cost | A — Butikkskyen [F6, F12, F17] | B — Composa [F7, F11] |
|---|---:|---:|
| Annual licence | 0.45 (one store) | 0.9 |
| Build, once | **1.1 fixed-price offer, valid to 15 December** | ~1.8 |
| Dynamics 365 integration | Standard connector included in licence; additional implementation scope to confirm | ~0.8, Ola's estimate |
| First year | **1.55** | **~3.5** |
| Headroom against **2.0m** budget [F18] | **0.45** | **1.5 over budget** |
| Three years | **2.45** | **~5.3** |

- A assumes one store at 450,000 NOK annually [F12]. Confirm Northwind needs only one, and that Kodeverket's fixed scope includes all required implementation, integrations, workflows and testing. Version 4 removes the old price-list workarounds [F16]; it does not prove all integration work is cost-free.
- A's build is 0.2m higher than the old estimate [F6, F17]. Combined with the 0.5m budget cut, headroom falls from the previous 1.15m to **0.45m**. The previous 1.35m/2.25m A subtotals are superseded.
- B's 0.8m integration is treated as additional to the 1.8m build because no standard connector is quoted [F7, F11]. Confirm overlap and who delivers it.
- Clarify hosting, maintenance, support, internal effort, upgrades, transaction fees, tax basis, price escalation and contingency. None is quantified. A is below budget on known items, **not yet proven within budget overall**.
- Annual pricing does not establish yearly termination rights [F4]. A's fixed-price offer resolves the existence of an offer, not its scope or all procurement terms. B's fixed-price terms are unconfirmed.

**Historical C costs, not a current alternative:** annual module 0.3m; build ~1.2m; first year ~1.5m plus unknown integration; three-year subtotal ~2.1m plus integration and replatforming [F8, F13]. Support ends December 2028, about 15 months after planned launch. The subtotal excludes the necessary platform move, so it is not comparable to A/B. No further C commerce evaluation is needed; check only whether the website CMS itself is affected.

## Requirements and evidence gaps

- **Near-real-time prices and stock:** not demonstrated for either option. Ola should validate latency, load, failure handling and operational ownership at Northwind's volume [F3]. Connector/API availability is not proof.
- **Customer-specific prices:** count is resolved: 3,100 [F15]. Butikkskyen's v4 claim resolves the old stated capacity/workaround concern [F16], but validate version deployed, list complexity, price correctness, permissions, refresh behaviour and performance using Northwind data. B's pricing support at this scale remains unverified.
- **Reorder and part-number ordering:** not demonstrated [F2, F5]. Dealers mostly order by part number; 70% of orders currently arrive by email and phone [F5]. Ask Cara whether history, saved lists, part-number entry or upload best supports users.
- **Order status:** demonstrate customer-facing visibility, status data source, update timing and access controls [F14]. Dynamics is known to hold prices and stock [F1]; the order-status source and integration coverage are not yet established.
- **Contracts and delivery:** get scoped delivery plans, yearly termination terms, and verify the written Kodeverket offer before its 15 December expiry [F4, F17]. Reference durations are not commitments.
- **Roadmap:** ask A and B for support commitments, given Fram's end-of-support announcement [F13].

## Option B (Composa) revisited

B does not currently fit the constraints:

- **Budget:** ~3.5m first year against **2.0m** [F7, F11, F18]. Licence plus integration already consumes 1.7m, leaving only **0.3m** for a quoted ~1.8m build, before other costs. A reduced scope, changed integration economics or explicit budget change would be needed; none is agreed.
- **Schedule:** as of 23 November there are a little over nine months to 1 September 2027. Four months of integration precedes shop work [F11]. A December start leaves little margin against the reference's nine-month total [F10]; Northwind build duration is unknown.
- **Delivery risk:** custom integration, a two-person Northwind team [F3], unknown delivery/operations owner, and no fixed integration price [F4, F11].
- **Benefit in return:** the reference's flexibility [F10] is no longer a criterion. B has no demonstrated lead on the four remaining criteria; marketing remains unknown for both.
- **What could reopen B:** a supported connector or fixed-price plan that materially cuts cost and duration, an explicitly approved budget/date change, or relevant evidence behind Ana's earlier preference. Do not assume management will reverse the budget cut.

### B variant: nightly import instead of custom integration (asked by Gunnar)

Ola estimates a nightly import of prices and stock at about **0.2m NOK instead of 0.8m**, but shop prices could be **up to a day old** [F19].

- **Cost (arithmetic, same basis as above):** first year about 0.9 licence + 1.8 build + 0.2 import = **~2.9m, about 0.9m over the 2.0m budget** [F7, F18, F19]. Three years about **4.7m**. That is 0.6m cheaper than the custom integration, but still far above A's 1.55m / 2.45m and over budget.
- **Requirement:** near-real-time prices and stock are mandatory for all options [F3]. A nightly import does not meet that as written. It only works if Gunnar, Ola and Hanne explicitly accept day-old prices and stock. No such acceptance is recorded.
- **Risks (inference):** with 3,100 customer-specific price lists [F15], a stale price or stock level could show customers the wrong price or availability and could add to the status/price calls [F14]. Check how price changes and stock-outs during the day would be handled.
- **Schedule:** not stated. Unknown whether the four-month integration lead time [F11] shrinks, or whether the 0.2m covers failure handling and monitoring. Ask Ola.
- **Effect on the recommendation:** none yet. B stays over budget even with the cheaper variant, and it would need a relaxed requirement as well. It would reopen B only if the budget or the near-real-time requirement is explicitly changed by the steering group.

This is an evidence-based recommendation, not a platform decision. Gunnar and the steering group decide.

## What each option means for customer service

Requested by Gunnar on 9 November; **not an agreed weighted criterion**. Baseline now includes direct evidence, not only inference:

- 70% of orders arrive by email and phone [F5]. This is an order-channel share, not a measured customer-service workload or savings figure.
- Hanne Ruud, head of customer service, reports about **300 calls per week about order status and prices combined**, and wants customer self-service order status [F14]. The split between topics, handling time and achievable reduction are unknown.

**Potential effects (inference):** correct customer-specific prices and usable order-status visibility could reduce some calls; easy online reorder could reduce manual order entry. No vendor has demonstrated these outcomes and no savings target is agreed. Login, price discrepancies or stale status could create new support work.

| | A — Butikkskyen | B — Composa |
|---|---|---|
| Potential implications | Earlier likely launch could bring relief sooner [F9], if self-service functions work. Version 4 removes the old price-list workarounds according to vendor [F16]; do not carry forward the old scale-risk argument. Correctness and live performance still need testing. | Custom integration and the reference's integration overrun add delivery risk [F10, F11]. Self-service benefits could arrive later; actual support burden is unquantified. |
| Unknown | Customer-facing order-status capability and source; admin/order lookup; customer-view pricing; ordering on behalf of customers; status integration within Kodeverket scope. | Same customer-service capabilities; status source/integration; who maintains custom integration. |

C is dropped. Historically a second platform move after launch would have meant another customer experience/support change [F13]; no further C demonstration is needed.

**Next:** Hanne should help define and test customer order-status and price-visibility scenarios with Ola and the vendors. Establish call split and success measures before estimating savings. Check customer-service admin workflows separately from customers' own status visibility.

## Interim view

**Butikkskyen remains the conditional preferred option.** Its speed reference and standard Dynamics route fit Gunnar's priority [F2, F6, F9]. The new pricing evidence removes the obsolete above-2,000-list objection: 3,100 is within the vendor-stated v4 capacity [F15, F16]. Kodeverket provides a fixed-price build offer [F17]. However, **0.45m first-year headroom is not a complete affordability conclusion**, and order status, marketing workflow, technical performance, scope and annual termination still need checking.

Composa is now about 1.5m over the reduced budget, with its integration sequencing still putting launch at risk [F7, F11, F18]. C remains dropped. The recommendation is conditional, not an approved selection or a final weighted ranking. The April 2027 A estimate remains reference-based, not a delivery promise.

## Open questions and next steps

1. **Urgent — Gunnar/Lise:** when is the December meeting, who approves and in what format? Can approval and validation finish before **15 December**? If not, seek a written extension from Kodeverket; do not assume one [F17].
2. Agree weights for the four criteria with Gunnar and acceptance checks for self-service order status, marketing, reorder and pricing. Discuss platform longevity.
3. **Lise/Kodeverket:** obtain and review the fixed-price scope, exclusions, milestones, acceptance, support and payment terms. Confirm implementation of order status, v4 pricing and Fram workflow, and yearly licence termination [F4, F17].
4. **Cost:** complete the first-year and three-year operating-cost picture. Test all extras and contingency against A's **0.45m** headroom [F18]. Confirm one-store licence scope [F12].
5. **Ola/Butikkskyen:** validate v4 against the known **3,100 lists**, including complexity, load and correctness; validate near-real-time prices/stock and operational ownership [F3, F15, F16]. Count is resolved; complexity and performance remain open.
6. **Hanne/vendors:** demonstrate customer-facing order status and price visibility. Establish status source, update timing and permissions; separately demonstrate service-team lookup and on-behalf ordering. Clarify call mix and intended measures [F14].
7. **Kodeverket:** obtain a dated plan from a December decision through testing and launch. Test the reference-based April estimate and confirm capacity [F9, F17].
8. **Marketing/vendors:** demonstrate same-tool content management alongside Fram for A and B [F2]. Check whether the website's known API limit of 10 requests a second matters if the shop reads Fram content/data (see website relaunch page).
9. **Composa:** confirm integration/build overlap, delivery owner, fixed-price possibilities and a dated plan including the four-month integration [F11]. Seek a second reference, focusing on integration overruns [F10]. Who builds/runs the frontend, and how does it support Fram editorial work?
10. **Cara/vendors:** test reorder and part-number flows [F2, F5]. Is moving a defined share of phone/email orders online a goal? Do not conflate the 70% order-channel share with the 300 status/price calls.
11. **Fram:** no further commerce evaluation; check only whether the website CMS is affected by commerce-module end of support [F13]. Ask A/B for roadmap commitments.
12. Ana: add the reason for the earlier Composa preference if still relevant; review the [draft recommendation](recommendation-draft.md) before sharing with Gunnar.

## Sources

- Ana's update, 9 November 2026: Gunnar removed design flexibility as a criterion and requested customer service implications. Ana leaned towards Composa but was concerned about integration; Ola was checking it.
- Ana's update, 16 November 2026: Gunnar agreed to drop Fram commerce because support ends in 2028; Ana requested an A go-live estimate counting four months from a December decision.
- [F1] Kickoff notes, 28 October 2026 (Ana): about 4,000 parts; 1 September 2027 go-live; customer-specific prices; Dynamics 365; original first-year budget 2.5m NOK (superseded by F18).
- [F2] Interview with Gunnar Holm, 29 October 2026: speed first; same-tool marketing content; quick reorder.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026: near-real-time prices/stock; two-person integration team.
- [F4] Interview with Lise Berg, procurement, 30 October 2026: fixed-price build and yearly-terminable licences.
- [F5] Market note from Cara, 30 October 2026: dealers mostly order by part number; 70% of orders arrive by email and phone.
- [F6] Butikkskyen quote, 3 November 2026: annual licence 600,000 NOK (corrected by F12); partner build ~900,000 NOK (superseded by F17); standard Dynamics connector and B2B Pricing app included in licence.
- [F7] Composa quote, 4 November 2026: annual licence 900,000 NOK; build ~1.8m including frontend; no standard Dynamics connector, integration through API.
- [F8] Fram CMS quote, 4 November 2026: commerce module 300,000 NOK annually; build ~1.2m; marketing stays in Fram.
- [F9] Agder Maskin reference call, 5 November 2026: live in four months; B2B Pricing worked but needed workarounds above 2,000 lists. Historical limitation superseded for v4 by F16; speed reference remains relevant.
- [F10] Vestlandsdeler reference call, 6 November 2026: Composa very flexible; nine-month launch; integration overran.
- [F11] Ola Nordmann, 11 November 2026: Composa custom Dynamics integration estimated at 800,000 NOK and four months before shop work starts.
- [F12] Butikkskyen correction, 12 November 2026: 600,000 NOK was for two stores; one store is 450,000 NOK annually.
- [F13] Fram CMS, 12 November 2026: commerce-module support ends December 2028; recommends partner platform migration.
- [F14] Hanne Ruud, head of customer service, 17 November 2026: about 300 calls weekly about order status and prices; wants customers to see order status themselves.
- [F15] Ola Nordmann, 18 November 2026: Northwind has 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: B2B Pricing v4, released in October, handles up to 10,000 lists; Agder Maskin's workarounds no longer necessary.
- [F17] Lise Berg, 19 November 2026: Butikkskyen partner Kodeverket offers build at fixed price 1.1m NOK, valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: management cut first-year budget to 2.0m NOK.
- [F19] Ola Nordmann, 27 November 2026: a nightly import of prices and stock into Composa would cost about 200,000 NOK instead of 800,000, but shop prices could be up to a day old.

Related: [Northwind](../overview.md), [Website relaunch](../website-relaunch/website-relaunch.md), [Gunnar Holm](../website-relaunch/gunnar-holm.md), [Lise Berg](../website-relaunch/lise-berg.md)


===== acme/northwind/commerce-platform/recommendation-draft.md =====
# Draft recommendation: commerce platform for Northwind's spare parts shop

Status: **DRAFT for Ana's review, updated 23 November 2026.** Not sent to the steering group; no platform selection approved. December meeting date and criteria weights remain open. Evidence and full source register: [research brief](research-brief.md).

**Decided 16 November:** Gunnar agreed to drop Fram commerce (C), because support ends December 2028 (Ana's update, 16 November; [F13]). Remaining candidates: Butikkskyen (A) and Composa (B).

## Summary for Gunnar and the steering group

**Recommendation: approve Butikkskyen as the preferred platform, conditional on the checks below.**

- **Why A:** strongest speed reference (four-month launch [F9]), standard Dynamics 365 connector and included B2B Pricing app [F6]. Northwind's **3,100 price lists** fit within version 4's stated **10,000-list** capacity; the old Agder Maskin workarounds are no longer necessary according to Butikkskyen [F15, F16]. Validate with Northwind data, but do not retain the obsolete 2,000-list objection.
- **Cost:** Kodeverket's **1.1m NOK fixed-price build** [F17] plus a **0.45m annual one-store licence** [F12] gives **1.55m year one** and **2.45m over three years**. Management's new first-year limit is **2.0m** [F18], leaving **0.45m for all unquoted costs and contingency**. These are not full TCO figures; affordability still depends on scope and extras.
- **Go-live:** four months from a December 2026 decision gives **April 2027** (early or late according to decision date), about four months before **1 September 2027** [F1, F9]. This is reference-based arithmetic, not Kodeverket's commitment; require a dated plan.
- **Customer service:** about **300 calls a week concern order status and prices combined**. Hanne wants customers to see order status themselves [F14]. Demonstrate this and confirm its inclusion in scope; no call-reduction forecast is established.
- **Why not B:** Composa's custom Dynamics integration adds an estimated **0.8m NOK and four months before shop work starts** [F11]. Year one is about **3.5m**, now **1.5m over budget** [F7, F11, F18], with the September deadline at risk.
- **Timing:** Kodeverket's offer expires **15 December 2026** [F17]. Confirm the steering group date and approval path now. If checks/approval cannot finish in time, seek a written extension; expiry is not a reason to skip checks.

**Decision requested (draft):** select A as preferred, subject to demonstrated requirements, complete first-year cost within 2.0m NOK, and acceptable scope, delivery and licence terms. This is not unconditional authority to accept the offer.

**Proposed steering group resolution:** endorse Butikkskyen as the preferred platform and commission completion of the five checks below. Bring the results and final cost/scope back for approval before contract commitment. If checks fail or the complete first-year cost exceeds 2.0m NOK, return to the steering group with revised scope or alternatives; do not automatically switch to Composa. Confirm the approval timetable against 15 December, or seek a written offer extension. This is proposed wording, not a recorded decision.

Presentation: [nine-slide steering group outline](steering-group-presentation-outline.md), aligned with findings [F14–F18] and this conditional recommendation.

## Comparison (million NOK)

| | A — Butikkskyen | B — Composa |
|---|---|---|
| Year one, budget **2.0** [F18] | **1.55**, leaving **0.45** | **~3.5**, **1.5 over** |
| Three years | **2.45** | **~5.3** |
| Build terms | Kodeverket **1.1 fixed**, valid to **15 December** [F17] | ~1.8 build plus ~0.8 integration; fixed price unconfirmed [F7, F11] |
| Time to market | Reference-based April 2027 if decided in December [F9]; Northwind plan unconfirmed | Four months of integration first [F11]; nine-month reference [F10] gives roughly September from a December start, no margin |
| Dynamics fit | Standard connector [F6]; 3,100 lists within vendor-stated v4 capacity [F15, F16]; live performance unverified | Custom integration [F11] |
| Marketing in website's tool | Not demonstrated | Not demonstrated |
| Customer-facing order status | Not demonstrated | Not demonstrated |

**Composa with a nightly import (Gunnar's question):** Ola estimates about 0.2m NOK instead of 0.8m, but prices could be up to a day old [F19]. That gives about **2.9m in year one (0.9m over 2.0m)** and about 4.7m over three years, still well above A. It also does not meet the near-real-time price and stock requirement [F3] unless the steering group accepts day-old data. Duration is not stated. This does not change the recommendation; see [research brief](research-brief.md).

Costs are build + one or three annual licences, plus B's integration. A assumes one store, unchanged annual rates and Kodeverket's offer remaining valid. Hosting, support, internal effort, fees, tax treatment, escalation and contingency are not quantified. A's fixed price does not establish that every required workflow is included; annual licence pricing does not establish yearly termination rights.

## Why A remains preferred without agreed weights

Gunnar ranks speed first [F2]. A has stronger speed evidence, substantially lower cost and a ready connector; B has no evidenced advantage on these criteria. Neither marketing workflow is demonstrated, so marketing cannot yet separate them. Customer-service needs require testing, not an assumed A advantage.

This is not a numerical weighted ranking. Agree weights with Gunnar. A's preference is conditional: if it fails a mandatory requirement, better cost or speed cannot compensate. B is not an affordable fallback on current evidence.

## Conditions before final approval or commitment

1. **Marketing workflow:** demonstrate marketing managing shop content in the website's tool, Fram [F2]. This remains a major gap for both candidates.
2. **Technical validation:** Ola tests near-real-time prices/stock [F3], failure handling, operations ownership, pricing correctness and performance using Northwind's **3,100 lists** [F15]. Confirm v4 deployment and list complexity. Counting lists and investigating obsolete workarounds are no longer open tasks; validation of the vendor's current claim is [F16].
3. **Customer workflows:** demonstrate customer-facing order status and price visibility with Hanne; establish status source, freshness and permissions [F14]. Also test quick reorder and part-number ordering [F2, F5]. Check service-team lookup and ordering on behalf of customers separately.
4. **Scope, full cost and contracts:** Lise confirms Kodeverket's 1.1m fixed-price inclusions/exclusions, integration/workflow scope, acceptance and support terms [F17]; confirms one-store licence [F12] and yearly termination [F4]. Complete the cost picture and keep all first-year costs and contingency within **2.0m**, not just the 1.55m subtotal [F18]. Only **0.45m** remains.
5. **Dated delivery and offer validity:** Kodeverket confirms capacity and a plan through testing to launch, supporting the April estimate or another date safely before 1 September [F1, F9]. Confirm approval can occur before **15 December**, or obtain a written extension [F17].

## Customer service implications

Hanne's evidence establishes **300 weekly status/price calls combined**, not a topic split, handling time or savings estimate [F14]. The separate finding that **70% of orders arrive by email and phone** [F5] is an order-channel measure, not a measure of those calls.

Self-service order status, correct prices and easy reorder could reduce some enquiries and manual entry, but neither platform has demonstrated this. Ask Hanne to define scenarios and success measures, and establish the call mix before quantifying benefits. A's earlier likely launch could bring benefits sooner, but only if the functions and integrations work. No assumption that all 300 calls disappear.

## Main risks and what would change the recommendation

- **Narrower financial margin:** A's build rose 0.2m while budget fell 0.5m; previous 1.15m headroom is now **0.45m** [F6, F17, F18]. Unquoted implementation/operating costs could exhaust it.
- **Unverified marketing, status and technical workflows:** failure of a required workflow reopens the choice; do not assume B automatically meets it.
- **Schedule and expiry:** one customer's four-month reference is not a delivery promise [F9]. Kodeverket capacity and the 15 December offer window need active management [F17].
- **Vendor claims versus proof:** v4 removes the reported old workaround need [F16], but stated capacity is not measured end-to-end performance at Northwind. Ask for roadmap/support commitments given Fram's announced end of support [F13].
- **Few assessed alternatives:** C is dropped; B is over budget and schedule-risky. If A fails, reconsider scope or alternatives rather than approve an unproven option.
- B could be reopened by a supported connector or fixed-price plan materially reducing cost and duration, or an explicit steering-group budget/date change. No such change is agreed. Ana's reason for her earlier Composa preference remains unrecorded.

## Immediate actions for Ana

- Confirm December steering group date, approvers and short-summary format with Gunnar; align with **15 December** expiry or ask Lise to secure an extension.
- Arrange focused demonstrations with marketing, Ola and Hanne; obtain Kodeverket's written scope and dated plan.
- Complete the all-in first-year budget check; confirm one store and annual termination rights.
- Agree criteria weights and acceptance checks. Decide whether to circulate this conditional draft now or after validation.

## Sources

Full source descriptions [F1–F18] are in the [research brief](research-brief.md). Key sources used here:

- [F1–F5] Kickoff/interviews/market note, 28–30 October 2026: deadline, priorities, Dynamics requirements, procurement terms and ordering behaviour.
- [F6] Butikkskyen quote, 3 November 2026: connector and pricing app included; old build estimate superseded by F17.
- [F7] Composa quote, 4 November 2026: licence 0.9m annually, build ~1.8m including frontend, no standard connector.
- [F9] Agder Maskin reference, 5 November 2026: four-month launch; historical pricing workaround limitation superseded for v4 by F16.
- [F10] Vestlandsdeler reference, 6 November 2026: nine-month launch and integration overrun.
- [F11] Ola Nordmann, 11 November 2026: 0.8m/four-month Composa integration before shop work.
- [F12] Butikkskyen, 12 November 2026: one-store annual licence 0.45m.
- [F13] Fram CMS, 12 November 2026: commerce-module support ends December 2028.
- Ana's updates, 9 and 16 November 2026: criteria change, customer service analysis request, provisional Composa preference; Gunnar's decision to drop C; request for reference-based A go-live estimate.
- [F14] Hanne Ruud, head of customer service, 17 November 2026: ~300 weekly order-status/price calls; customer self-service status wanted.
- [F15] Ola Nordmann, 18 November 2026: 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: v4 released in October supports up to 10,000 lists; old workarounds no longer necessary.
- [F17] Lise Berg, 19 November 2026: Kodeverket fixed-price build 1.1m NOK, valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: first-year budget cut to 2.0m NOK.
- [F19] Ola Nordmann, 27 November 2026: Composa nightly import of prices and stock about 0.2m NOK instead of 0.8m; prices up to a day old.

Related: [Research brief](research-brief.md), [Northwind](../overview.md), [Gunnar Holm](../website-relaunch/gunnar-holm.md), [Lise Berg](../website-relaunch/lise-berg.md)


===== acme/northwind/commerce-platform/steering-group-presentation-outline.md =====
# Steering group presentation outline: Northwind commerce platform

Status: **DRAFT, 23 November 2026**. Nine slides for the December steering group; meeting date unknown. Based on the [updated recommendation](recommendation-draft.md) and [research brief](research-brief.md). No platform selection approved. Titles below state each slide's main message; bullets are its main points.

## 1. Recommend Butikkskyen — subject to five approval checks

- Best-supported fit for Gunnar's speed priority, with a standard Dynamics 365 connector and lower cost than Composa [F2, F6, F7, F9, F11, F12, F17].
- Seek endorsement as preferred platform, not unconditional authority to sign.
- Final commitment depends on demonstrated workflows, technical validation, complete cost, contract terms and delivery plan.
- Kodeverket's fixed-price offer expires **15 December 2026**; align the approval timetable or seek an extension [F17].

## 2. The shop must launch on time and enable customer self-service

- About **4,000 spare parts**; launch deadline **1 September 2027** [F1].
- Quick reorder for workshops, part-number ordering, customer-specific prices and near-real-time Dynamics prices/stock [F1–F3, F5].
- Marketing should manage shop content in the same tool as the website, Fram [F2, F8].
- Four comparison criteria: time to market, three-year cost, Dynamics fit and marketing ease. Weights remain open; speed ranks first. Design flexibility is no longer a criterion (Ana's update, 9 November).
- First-year budget is now **2.0m NOK**, not 2.5m [F18].

## 3. New evidence removes the old pricing-scale objection

- Northwind has **3,100 customer-specific price lists** [F15] — distinct from the number of parts.
- Butikkskyen says B2B Pricing **v4**, released in October, supports **up to 10,000 lists**, without Agder Maskin's old workarounds [F16].
- The historical above-2,000-list caveat [F9] is superseded for v4; it is not a current reason to reject A.
- Still require tests with Northwind's list complexity and data: correct prices, permissions, refresh behaviour and performance. Stated capacity is not end-to-end proof.

## 4. Customer service needs visible prices and order status

- Hanne reports about **300 calls per week about order status and prices combined** and wants customers to see order status themselves [F14].
- Separately, **70% of orders arrive by email and phone** [F5]; this is an order-channel share, not a count of those calls.
- Demonstrate customer-facing status and price visibility; establish status source, freshness and access controls, and confirm inclusion in build scope.
- Test reorder and part-number flows; check service-team lookup and on-behalf ordering separately.
- Potential benefit: fewer enquiries and less manual entry. Neither platform has demonstrated this; no call-reduction or savings forecast. Ask Hanne to define scenarios and measures.

## 5. Butikkskyen leads the remaining comparison; Composa does not fit current constraints

- **A — Butikkskyen:** standard connector [F6]; four-month launch reference [F9]; 1.55m NOK first-year and 2.45m three-year subtotals [F12, F17]. Marketing and order-status workflows remain unverified.
- **B — Composa:** no standard connector; custom integration estimated at **0.8m NOK and four months before shop work starts** [F7, F11]. First year ~3.5m, three years ~5.3m; **1.5m over the new first-year limit** [F18]. Reference took nine months and overran on integration [F10].
- Neither option has demonstrated same-tool marketing workflow. Unknowns are not evidence of equivalence or compliance.
- **C — Fram commerce:** already dropped by agreement with Gunnar on 16 November because support ends December 2028 [F13; Ana's update]. Not an active candidate.
- No weighted score: weights are unagreed. A is preferred on current evidence, subject to requirements passing.

## 6. Known costs fit the reduced budget — but only 450,000 NOK remains

| Million NOK | Butikkskyen | Composa |
|---|---:|---:|
| Annual licence | 0.45, one store [F12] | 0.90 [F7] |
| Build | 1.10 fixed offer [F17] | ~1.80 [F7] |
| Dynamics integration | Standard connector included; implementation scope to confirm [F6] | ~0.80 [F11] |
| First-year subtotal | **1.55** | **~3.50** |
| Position against 2.0m budget | **0.45 remaining** | **1.50 over** |
| Three-year subtotal | **2.45** | **~5.30** |

- Subtotals are not full TCO: quantify support, hosting, internal effort, fees, tax basis, escalation and contingency as applicable. Assumes unchanged licence rates and one store for A.
- A's build increased by 0.2m; budget fell by 0.5m. Headroom has fallen from 1.15m to **0.45m** [F6, F17, F18].
- Fixed-price scope and exclusions must be verified; all first-year costs and contingency must fit 2.0m before commitment. Annual pricing is not proof of yearly termination rights [F4].

## 7. April 2027 is a planning estimate, not a delivery promise

- A's four-month reference counted from a December decision suggests **April 2027**, early or late depending on decision date — about four months before the September deadline [F1, F9].
- Require Kodeverket's dated plan, staffing/capacity, dependencies, testing and acceptance milestones; the reference is another customer's project.
- B needs four months of integration before shop work; a December start leaves roughly five months for shop build/testing [F11]. Its nine-month reference from December ends around September, with no margin [F10]. Neither figure is a Northwind commitment.
- Confirm steering group and final approval dates against **15 December offer expiry**; seek a written extension if needed [F17]. Do not skip checks to meet the offer window.

## 8. Five checks must pass before contract commitment

Proposed validation responsibilities, not recorded assignments:

1. **Marketing + vendor:** demonstrate same-tool shop content workflow with Fram [F2].
2. **Ola + vendor:** validate near-real-time prices/stock, v4 pricing at 3,100 lists, failure handling and operational ownership [F3, F15, F16].
3. **Hanne + vendor, with dealer/workshop input:** demonstrate customer status, price visibility, quick reorder and part-number ordering; confirm status source and permissions [F2, F5, F14].
4. **Lise + Kodeverket:** verify fixed scope/exclusions, one-store licence, yearly termination, support/acceptance terms and complete first-year cost within 2.0m [F4, F12, F17, F18].
5. **Kodeverket + Northwind approval leads:** confirm dated delivery plan and valid offer at commitment, or secure extension [F1, F9, F17].

- Major residual risks: unproven workflows, underestimated extras, partner capacity and vendor claims not yet tested. If a required check fails, return to the steering group.
- **Third-party dependency:** the B2B Pricing app is a third-party dependency (Ana's update, 23 November 2026).

## 9. Decision requested: endorse A, complete validation, then approve commitment

- **Proposed resolution:** endorse Butikkskyen as preferred, subject to the five checks; no unconditional contract acceptance.
- Confirm criteria weights, acceptance checks, validation owners and who gives final approval. Present final scope, full cost and test results before commitment.
- Confirm December meeting/approval timetable now, aligned with **15 December**, or seek a written offer extension.
- If A fails a requirement or full first-year cost exceeds 2.0m, return with revised scope or alternatives. Do not automatically choose B: it is currently over budget and schedule-risky.
- Reopen B only if credible new cost/integration/delivery evidence changes the case or the steering group explicitly changes constraints. No such change is agreed.

## Sources

All ids refer to the source register in the [research brief](research-brief.md). Cost arithmetic and schedule extrapolations are analysis, not vendor guarantees.

- [F1] Kickoff notes, 28 October 2026: parts, launch date, original budget and Dynamics context.
- [F2] Gunnar Holm interview, 29 October 2026: speed priority, same-tool marketing and quick reorder.
- [F3] Ola Nordmann interview, 29 October 2026: near-real-time requirements and two-person integration team.
- [F4] Lise Berg interview, 30 October 2026: fixed-price build and yearly licence termination.
- [F5] Cara market note, 30 October 2026: part-number ordering and 70% phone/email order share.
- [F6] Butikkskyen quote, 3 November 2026: included connector/pricing app; old build estimate.
- [F7] Composa quote, 4 November 2026: licence, frontend/build and lack of standard connector.
- [F8] Fram CMS quote, 4 November 2026: marketing remains in Fram.
- [F9] Agder Maskin reference, 5 November 2026: four-month launch and historical pricing limitation.
- [F10] Vestlandsdeler reference, 6 November 2026: nine-month Composa launch and integration overrun.
- [F11] Ola Nordmann, 11 November 2026: Composa integration cost, duration and sequencing.
- [F12] Butikkskyen correction, 12 November 2026: 450,000 NOK annual one-store licence.
- [F13] Fram CMS, 12 November 2026: commerce-module support ends December 2028.
- Ana's updates, 9 and 16 November 2026: design flexibility removed, customer service analysis requested, C dropped with Gunnar, reference-based A go-live estimate requested.
- [F14] Hanne Ruud, 17 November 2026: 300 weekly status/price calls and self-service order-status need.
- [F15] Ola Nordmann, 18 November 2026: 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: v4/10,000-list capacity and old workarounds no longer needed.
- [F17] Lise Berg, 19 November 2026: Kodeverket 1.1m fixed-price build offer valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: reduced first-year budget of 2.0m NOK.

