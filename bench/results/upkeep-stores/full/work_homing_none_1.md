===== Steering-group presentation: commerce platform recommendation =====
# Steering-group presentation: commerce platform recommendation

## 2026-11-23 Draft outline — 10 slides
Based on recommendation item:0b2bc674-1b29-40b2-8748-ac74d156f923 and comparison item:994f8b00-38eb-40da-9519-5369417312ff. For review, not an approved decision or shared document. Customer references remain anonymous.
### 1. Customer service: turn repeat queries into self-service
- Approximately 300 calls/week about order status and prices; customers should see order status themselves [F14].
- A: validate self-service and current pricing; B: same capability gaps plus potential custom-integration support burden; C: dropped.
- No quantified call reduction; establish category split, handling time and success measures.
### 2. Recommendation: progress Butikkskyen with Kodeverket, conditionally
- Strongest remaining combination of delivery evidence, quoted cost and standard D365 connector.
- Version-4 pricing evidence and fixed-price build offer strengthen the case.
- Seek endorsement of preferred route; no unconditional signature approval.
### 3. Requirements and decision criteria
- Spare-parts shop live by 1 September 2027; first-year cap 2.0M NOK.
- Four criteria: time to market (sponsor priority), three-year cost, D365 fit, marketing ease of use; weights not agreed.
- Customer-specific prices, near-real-time D365 prices/stock, quick reorder, fixed-price build and yearly-cancellable licence. Validate marketing's same-tool workflow and part-number ordering.
### 4. What the latest findings change
- F14: customer-service baseline and self-service need; F15: 3,100 price lists.
- F16: v4 vendor-stated capacity 10,000 without old workarounds; validate real data.
- F17: 1.1M fixed-price build, offer expires 15 December; F18: cap reduced from 2.5M to 2.0M.
### 5. Pricing scale and D365: stronger evidence, tests still required
- Included standard connector and B2B Pricing app; 3,100 lists below vendor-stated v4 capacity.
- Historical 2,000-list workaround no longer a current vendor-reported limit.
- Demonstrate actual pricing rules, permissions, representative load, near-real-time prices AND stock, and order-status integration separately.
### 6. Financial case: 1.55M year 1, 2.45M over three years
- 1.1M build + 450k annual licence; 450k headroom against 2.0M first-year cap.
- Three years = 1.1M + 3×450k. One-store licence scope/sufficiency still needs written confirmation.
- Quoted baseline, not full TCO: confirm inclusions, operations/support, migration/training, taxes, increases and contingency.
### 7. Why not Composa or Fram commerce?
- Composa: 2.7–3.5M year 1, 4.5–5.3M three years depending on integration inclusion; 700k–1.5M above cap.
- Four-month custom integration before shop work, nine-month reference with overrun; support burden for two-person team. Do not add durations without knowing overlap.
- Fram commerce dropped on 16 November: support ends December 2028. Marketing same-tool fit remains unverified for both live options.
### 8. Delivery: protect September, do not promise April
- Deadline 1 September 2027; coordinate with 1 March website launch.
- Four-month reference implies April only from an immediate December start; not Kodeverket commitment.
- Obtain scoped plan, named resources, testing/pilot/training milestones and contingency; decision before 15 December or written offer extension.
### 9. Contract conditions and remaining risks
- Prove pricing/permissions, near-real-time D365 data and authenticated order status.
- Confirm complete fixed-price scope, first-year affordability, one-store scope and annual cancellation; committed staffing and schedule.
- Demonstrate marketing workflow, reorder and part-number search; agree training, support and operational ownership. No quantified benefits yet.
### 10. Decision requested and next steps
- Endorse conditional Butikkskyen/Kodeverket route within 2.0M first-year ceiling; withhold signature until checks pass.
- Proposed responsibilities, for agreement: Ola—technical validation; Hanne—service workflow and measures; Lise—scope, licence and offer extension; Ana/Gunnar—decision coordination.
- Resolve validation and offer timing before 15 December; if conditions fail, return to steering group with revised options rather than automatically reverting to Composa.
Distribution: Northwind prices only through procurement portal, never email.

===== Decision: drop Fram commerce module (option C) =====
# Decision: drop Fram commerce module (option C)

Decided 16 November 2026: Gunnar Holm agreed with Ana to drop Fram CMS's commerce module (option C) from the commerce platform evaluation, because Fram ends support for it in December 2028 [F13]. The evaluation continues with Butikkskyen (A) and Composa (B). Fram-specific open questions (migration path, extended support, API limit check) are closed.

===== Research brief: commerce platform for the spare parts shop =====
# Research brief: commerce platform for the spare parts shop

## Question
Which commerce platform should Northwind use for its spare parts shop? Recommendation for steering group in December 2026; analysis began 2 November.
**Status, 23 November 2026:** conditional draft recommendation remains A — Butikkskyen, not a selection. New quoted-scope baseline is 1.55M NOK year 1 and 2.45M three years [F12,F17], against reduced 2.0M year-1 cap [F18]. Kodeverket's 1.1M fixed-price offer expires 15 December; scope, partner schedule and licence cancellation terms remain to be confirmed. Northwind has 3,100 price lists [F15]; vendor says v4 handles 10,000 without earlier workarounds [F16], pending real-data validation. Hanne reports 300 calls/week about order status/prices and wants self-service status [F14]; neither remaining option has demonstrated this. B is over budget in both F11 cost interpretations and has schedule concerns. C was dropped with Gunnar on 16 November. Updated draft: item:0b2bc674-1b29-40b2-8748-ac74d156f923. Weights and validation gaps remain open.

## Northwind's goals and constraints
**Goals**
- Sell spare parts online to dealers and workshops (~4,000 parts). [F1]
- Live by 1 September 2027. [F1]
- Speed to market matters most to the sponsor, Gunnar Holm. [F2]
- Marketing manages the shop's content in the same tool as the website. [F2]
- Workshops can reorder in a few clicks. [F2]

**Constraints**
- Customer-specific prices. [F1]
- Microsoft Dynamics 365 is the ERP and holds prices and stock; every option must read both from it in near real time. [F1, F3]
- Budget for year 1: 2.5 million NOK, licences and build included. [F1]
- Northwind's integration team is two people. [F3]
- Procurement wants a fixed price for the build and licences that can be ended yearly. [F4]

## Current criteria — revised 9 November 2026
Gunnar removed design flexibility as a criterion in his call with Ana on 9 November: it does not matter for Northwind. The four remaining criteria are:
1. Time to market (Gunnar's top priority [F2]).
2. Cost over three years (year-1 budget cap 2.5M NOK; fixed build price and yearly-cancellable licences wanted [F1,F4]).
3. Fit with Dynamics 365 (near-real-time prices and stock; small integration team [F1,F3]).
4. Ease of use for marketing (same tool as website [F2]).
Weights remain unset. The original five-criterion kickoff agreement [F1] remains historical evidence, not the current criterion set.
Must-haves remain: customer-specific prices [F1]; reorder in a few clicks [F2]; near-real-time D365 read [F3]; fixed-price build and yearly-cancellable licences [F4]. Customer-service implications are requested as an opening section, not established as an additional scored criterion.

## Options
- **A. Butikkskyen:** a SaaS shop platform.
- **B. Composa:** a headless commerce engine with its own frontend. Needs a custom D365 integration [F11].
- **C. Commerce module of Fram CMS:** runs Northwind's new website. Commerce module support ends December 2028 [F13].

Comparison updated 16 November 2026 using F1–F13. A draft recommendation exists but nothing has been decided.

## What we know so far
- **F1** Kickoff notes, 28 October (Ana): sell spare parts online to dealers and workshops, ~4,000 parts, live 1 September 2027. Customer-specific prices. Dynamics 365 is the ERP and holds prices and stock. Year-1 budget 2.5M NOK, licences and build included. Five criteria agreed.
- **F2** Interview with Gunnar Holm, 29 October: speed to market matters most. Marketing manages shop content in the same tool as the website. Workshops want to reorder in a few clicks.
- **F3** Interview with Ola Nordmann, integration architect, 29 October: every option must read prices and stock from Dynamics 365 in near real time. Integration team is two people.
- **F4** Interview with Lise Berg, procurement, 30 October: fixed price for the build; licences that can be ended yearly.
- **F5** Market note from Cara, 30 October: dealers mostly order by part number. 70% of orders come by email and phone today.

Implications to check (our reading, not stated by the sources): F5 suggests part-number search and quick order entry matter for dealers; F2 points toward option C and F3's small team toward low custom integration work, but neither is verified.

## Open questions — revised 23 November 2026
Resolved inputs: price-list count is 3,100 [F15]; vendor reports v4 supports 10,000 without previous workarounds [F16]; Kodeverket offers a 1.1M fixed-price build through 15 December [F17]; current year-1 cap is 2.0M [F18]; customer service reports 300 calls/week about prices/order status and wants self-service status [F14].
1. Demonstrate D365 prices AND stock at an agreed near-real-time threshold, actual pricing rules at 3,100 lists on v4, permissions, failure handling and maintenance ownership.
2. Demonstrate authenticated customer order-status self-service; confirm source systems, scope, refresh rate and handling of exceptions. With Hanne, split the 300 calls by cause and establish success measures; do not assume all calls are avoidable.
3. Obtain Kodeverket's scoped fixed-price offer, inclusions/exclusions, staffing and committed delivery plan. Confirm whether order-status, migration, training, connector implementation and all required work fit the 450k remaining first-year headroom. Obtain a decision before offer expiry or written extension.
4. Confirm in writing that 450k/year covers one store and one store suffices; secure yearly-cancellable terms.
5. Demonstrate marketing's same-tool workflow, quick reorder and part-number search.
6. Agree criterion weights with Gunnar; retain four scored criteria and customer-service opening section.
7. Complete like-for-like TCO: A 1.55M year 1/2.45M three years; B 3.5M/5.3M if integration additional, otherwise 2.7M/4.5M. Include operations, support, tax, increases and contingency. Clarify F11 inclusion with Ola, but B fails the new cap in either reading.
8. Get support, training and operational ownership agreements suited to Ola's two-person team. Obtain a customer-service reference.
9. Coordinate shop schedule for 1 September 2027 with website launch 1 March. A's four-month reference is not a commitment; B's reference and integration scope overlap remain uncertain.
10. Assign owners. Prices for Northwind go only through its procurement portal, never email. Fram is dropped; its extended-support and migration questions are no longer conditions for selecting A. Check the Fram API limit only if relevant to actual integration scope.

F12 (correction) — Butikkskyen licence: 450,000 NOK per year for one store. The 600,000 NOK quoted on 3 November covered two stores. Corrected 12 November 2026. Assumes Northwind needs one store; confirm in writing.

F6 — Butikkskyen partner build estimate: about 900,000 NOK, quoted 3 November 2026; not established as a fixed-price commitment.

F6 — Butikkskyen includes a standard Dynamics 365 connector.

F6 — Butikkskyen customer-specific prices require the B2B Pricing app, included in the licence.

F7 — Composa licence: 900,000 NOK per year, quoted 4 November 2026.

F7 — Composa build estimate: about 1.8M NOK, frontend included, quoted 4 November 2026; not established as a fixed-price commitment.

F7 — Composa has no standard Dynamics 365 connector; integration goes through Composa's API.

F8 — Fram CMS commerce module costs 300,000 NOK per year, quoted 4 November 2026.

F8 — Fram CMS commerce build estimate: about 1.2M NOK, quoted 4 November 2026; not established as a fixed-price commitment.

F8 — With Fram CMS commerce, marketing keeps working in Fram.

F9 — Butikkskyen customer reference reported going live in four months. This is one reference, not a Northwind delivery commitment.

F9 — Butikkskyen customer reference reported that customer-specific prices worked through B2B Pricing but needed workarounds above 2,000 price lists. Price-list count is distinct from Northwind's approximately 4,000 parts.

F10 — Composa customer reference described the platform as very flexible; this is qualitative evidence, not a verified Northwind design test.

F10 — Composa customer reference reported launch after nine months. This is one reference, not a Northwind delivery commitment.

F10 — Composa customer reference reported integration took longer than planned.

## Comparison against four criteria — revised 30 November 2026, F1–F19
Assessment, not selection. Weights remain unset. Customer-service impact opens the recommendation but is not a fifth scored criterion. C was dropped on 16 November and is historical only.
| Criterion | A — Butikkskyen | B — Composa |
|---|---|---|
| Time to market | One reference delivered in four months [F9], not a Northwind commitment. Kodeverket availability and schedule unconfirmed. Offer expires 15 December 2026 [F17]. | Custom integration takes four months before shop work [F11]; nine-month reference with integration overrun [F10]. A December start leaves little contingency before September 2027; do not add reference duration and integration duration without knowing overlap. |
| Three-year cost | 2.45M NOK = 1.1M fixed-price build [F17] + 3×450k licence [F12]. Year 1 1.55M; 450k headroom against new 2.0M cap [F18]. Scope and one-store sufficiency need confirmation. | 5.3M/3.5M over three years/year 1 if 800k integration is additional; 4.5M/2.7M if already included [F7,F11]. Year-1 overrun 1.5M or 0.7M. Nightly-import variant: see note below [F19]. |
| D365 fit | Standard connector and B2B Pricing included [F6]. Northwind has 3,100 lists [F15]; vendor reports v4 supports 10,000 without previous workarounds [F16]. Old 2,000-list limitation is historical; actual pricing rules, performance, near-real-time prices AND stock remain to be demonstrated. | Custom integration required [F11], substantial ownership burden for two-person team [F3]. Customer pricing and near-real-time data unverified. Nightly-import variant: see note below [F19]. |
| Marketing ease of use | Same-tool requirement and usability unverified; demonstrate. | Same-tool requirement and usability unverified; demonstrate. |
Customer-service baseline: 300 calls/week about prices and order status; self-service order status wanted [F14]. Neither A nor B has demonstrated it. No supported savings estimate.

### Note under Composa: nightly import instead of custom integration [F19]
Gunnar asked whether Composa would work with a nightly import of prices and stock instead of the custom integration. Ola (27 November): about 200k NOK instead of 800k, but shop prices could be up to a day old [F19].
- **Cost:** If the 800k was on top of the 1.8M build, year 1 becomes about 2.9M and three years about 4.7M (1.8M + 0.2M + licences), still about 0.9M over the 2.0M cap. If the 800k was already inside the 1.8M, year 1 was 2.7M; even if the full 600k saving came off the build (not stated) it would be about 2.1M, still above the cap. Either reading still exceeds 2.0M, and the cheapest reading is not evidenced. A's quoted year 1 remains 1.55M.
- **Requirement conflict:** The agreed must-have is near-real-time prices AND stock from D365 [F1,F3]. A one-day-old import does not meet it, so this variant needs Gunnar and Ola to relax the requirement explicitly (customer-specific prices and stock up to a day stale; consequences for orders and for order-status self-service [F14] not assessed). If the requirement were relaxed it would apply equally to A, which would then be easier to deliver as well.
- **Still unknown:** delivery time for the variant (four months in F11 applied to the full integration), whether 200k is a fixed price, and the remaining ownership/maintenance load for Ola's two-person team.
- **Effect on the assessment:** B gets cheaper but remains over budget on the evidence, and only by loosening a must-have. The recommendation of A is unchanged.

Cost figures are quoted-scope baselines, not full TCO. Annual cancellation, licence scope, support, operations, tax, increases, contingency and scope inclusions require confirmation. A's fixed-price offer is now evidenced, not its complete scope. F17 supersedes the earlier 0.9M build estimate for current costing; F18 supersedes the 2.5M cap. C's former 2.1M baseline excluded migration after support ends December 2028 and is not a live alternative.
Synthesis: A remains the conditional recommendation with stronger pricing-scale evidence; B remains over budget in both integration-cost readings, including with the nightly-import variant. Ana's earlier Composa preference remains hers to reconsider, not an assistant-overwritten decision.

As of 9 November 2026, Ana is leaning towards Composa but is worried about its integration. This is a tentative preference, not a platform selection or evidence that Composa meets the requirements.

Ola Nordmann checked Composa's integration in the week of 9–15 November 2026. He reported on 11 November: custom D365 integration, 800,000 NOK, four months before shop work can start (F11, item:ddad1ea5-13dc-4e7f-955f-1ae8e8b2eeb9). Still open: whether it is on top of the 1.8M build, and near-real-time and customer-pricing results.

F11 — Composa needs a custom integration with Dynamics 365: estimate 800,000 NOK and four months, before the shop work can start (Ola Nordmann, 11 November 2026). Not yet confirmed whether this is on top of the ~1.8M NOK build estimate (F7) or what it covers (ownership, maintenance, near-real-time prices and stock). Not established as a fixed price.

F13 — Fram CMS ends support for its commerce module in December 2028 and recommends that customers move to a partner platform (Fram CMS, 12 November 2026). Which partner platform, the migration cost and any extended support are not known.

## Customer-service implications — 23 November 2026
Verified baseline [F14]: Hanne Ruud reports about 300 calls/week about order status and prices; customer service wants customers to see status themselves. The split between query types, handling time and avoidable proportion are unknown.
- A — Butikkskyen: demonstrate authenticated order status and correct customer prices. Vendor says v4 handles 10,000 lists without earlier workarounds [F16]; Northwind has 3,100 [F15]. The earlier workaround-related manual-exception hypothesis is no longer supported as a current limitation, but real-data testing is still needed. Order-status capability/integration is unverified.
- B — Composa: status self-service and customer pricing remain unverified. Custom integration may create support/exception work for Ola's small team; this is a risk hypothesis, not a measured effect.
- C — Fram: dropped on 16 November due to December 2028 support end; not a live implementation option.
For A/B, confirm data sources, freshness, permissions, support hours, exception handling, training and ownership. Baseline call categories with Hanne and set success measures. Do not infer that all 300 calls will disappear or quantify savings without evidence. Customer-service impact is an opening section, not a fifth scored criterion.

## Option B — Composa, revisited after Ola's estimate (16 November 2026)
**Assessment:** B no longer fits the budget or the schedule on the evidence we have. It is not recommended unless Composa changes its price and Ola confirms a shorter path.

- **Cost.** The licence is 900k a year and the build about 1.8M [F7]. Ola's custom D365 integration adds 800k [F11]. If F11 is on top of the build: year 1 ≈3.5M, three years ≈5.3M, which is ≈1.0M over the 2.5M cap. If F11 is already inside the 1.8M build: year 1 ≈2.7M, which is ≈0.2M over. B is over the cap in both readings. Nothing in the file says which reading is right.
- **Schedule.** The integration takes four months before shop work can start [F11]. With a December 2026 decision, shop work starts around April 2027, leaving about four to five months to 1 September 2027. Composa's reference took nine months and its integration overran [F10]. Nine months from December is exactly 1 September, with no contingency. Whether the reference's nine months included the integration is unknown.
- **Integration burden.** A custom integration means Northwind's two-person team [F3] takes on ownership, monitoring and maintenance of a one-off interface. Near-real-time prices AND stock, and customer-specific prices, are unverified. Ola's estimate is not a fixed price [F4].
- **What B still has.** Its reference called it very flexible [F10], but design flexibility was dropped as a criterion on 9 November (item:d82c6efc-e35a-4167-89a1-a02612c82db5). It therefore does not offset the cost and schedule findings.
- **What would reopen B.** All of these would be needed: a fixed-price integration and build, a year-1 total at or below 2.5M, a schedule with shop work running in parallel with the integration, and a customer-service model that does not rest on Ola's team alone.
- **Ana's lean.** Ana leaned toward Composa on 9 November, before F11 (item:60773b3f-c669-4cb2-a0d4-ab28eef8c79f). The evidence no longer supports that lean.

## 2026-11-23 Updated recommendation for the steering group — DRAFT, not a decision
### Customer-service implications
Hanne Ruud reports approximately 300 calls/week about order status and prices and wants customer self-service order status [F14]. A — Butikkskyen: demonstrate authenticated status and accurate customer prices; current v4 vendor evidence reduces the earlier workaround concern. B — Composa: the same capabilities remain unverified; custom integration poses potential support/exception workload. C — Fram: already dropped, not a live alternative. No quantified call reduction or savings is established.
### Recommendation and proposed decision
Recommend Butikkskyen with Kodeverket as delivery partner, subject to validation and contract conditions below. Ask the steering group to endorse this preferred route, not authorise unconditional contract signature. Maintain the 2.0M NOK first-year ceiling [F18]. Return to the group if required scope, capability or delivery cannot meet the conditions; Composa is not an automatic fallback.
### Economics
A's quoted baseline: 1.1M fixed-price build [F17] + 450k annual one-store licence [F12] = 1.55M year 1; 1.1M + 3×450k = 2.45M over three years. Remaining first-year headroom is 450k, not proven sufficient contingency. Confirm scope and exclusions, one-store sufficiency, operations/support, migration, training, tax treatment, annual increases and contingency. This is not complete TCO.
B: year 1 3.5M/three years 5.3M if the 800k integration [F11] is additional to the 1.8M build [F7]; 2.7M/4.5M if included. Thus 1.5M or 700k over the new cap. Clarify the inclusion, but either reading exceeds budget. Schedule and two-person-team maintenance burden also count against B.
### What F14–F18 change
F14 makes self-service order status an explicit stakeholder need and supplies a call-volume baseline, not a benefit estimate. F15 establishes 3,100 price lists, distinct from approximately 4,000 parts. F16 says B2B Pricing v4 (October 2026) supports 10,000 lists without earlier workarounds: the F9 2,000-list issue is historical, not a current product limit. This is vendor evidence, not Northwind-tested performance. F17 replaces the 0.9M build estimate with a 1.1M fixed-price offer valid until 15 December 2026. F18 replaces the 2.5M cap with 2.0M.
### Delivery
Go-live deadline remains 1 September 2027; coordinate resources with the website launch on 1 March. A reference's four-month delivery suggests April 2027 from an immediate December start, only as an illustrative scenario. Obtain Kodeverket's resource commitment and scoped schedule. B's four-month integration precedes shop work; its nine-month reference is not a committed Northwind schedule and must not simply be added to integration duration without knowing overlap.
### Conditions before signature
1. Demonstrate version-4 pricing using Northwind's 3,100 lists and actual rules/permissions; prove near-real-time D365 prices AND stock with agreed thresholds and failure handling.
2. Demonstrate customer-visible authenticated order status; confirm data sources, freshness, exception process and contractual inclusion.
3. Confirm complete fixed-price scope, exclusions, delivery resources and committed dates, with all required first-year costs within 2.0M.
4. Confirm written one-store licence scope and sufficiency, yearly cancellation and support terms.
5. Demonstrate marketing's required same-tool workflow, quick reorder and part-number search; agree support/training/operating ownership with Hanne and Ola.
6. Decide in time for the 15 December offer expiry or obtain a written extension. Do not accept an inadequately validated offer solely to preserve the price.
Four comparison criteria remain time to market, three-year cost, D365 fit and marketing ease of use; weights are unset. Customer service is an opening impact section, not a fifth scored criterion. Fram commerce was dropped with Gunnar on 16 November due to December 2028 support end.
Sources: comparison item:994f8b00-38eb-40da-9519-5369417312ff; F14 item:ac2c4951-80fd-45ea-97ae-a72c717776d7 and item:c3707eea-097d-47d2-81f4-e6751cb6fe3e; F15 item:2e78ff98-3b6f-4ee8-b635-442cdf92357f; F16 item:13823618-90c9-4f6c-a504-9e4b48136032; F17 item:01fb7df0-4342-45eb-a14c-28594046a4dc and item:2b50ee81-5867-4fdf-9520-d3e91d77e023; F18 item:cac3f667-375b-4097-b0f2-c12842efaa4d. Prices for Northwind must be sent only through the procurement portal, never email.

F14 — Hanne Ruud, head of customer service, reported on 17 November 2026 that customer service receives about 300 calls a week concerning order status and prices.

F14 — Hanne Ruud, head of customer service, said on 17 November 2026 that customer service wants customers to be able to see order status themselves.

F15 — Ola Nordmann reported on 18 November 2026 that Northwind has 3,100 customer-specific price lists. This count is distinct from the approximately 4,000 parts.

F16 — Butikkskyen stated on 19 November 2026 that B2B Pricing version 4, released in October 2026, handles up to 10,000 price lists and no longer needs the workarounds reported by the earlier customer reference in F9. This is a vendor claim, not a Northwind acceptance test; F9 remains historical evidence.

F17 — Lise Berg reported on 19 November 2026 that Butikkskyen partner Kodeverket offers the build at a fixed price of 1.1 million NOK. Use this offer rather than the earlier 0.9M estimate for the current cost baseline; inclusions and scope still need confirmation.

F17 — Kodeverket's 1.1 million NOK fixed-price build offer is valid until 15 December 2026, as reported by Lise Berg on 19 November 2026.

F18 — Gunnar Holm reported on 20 November 2026 that management has reduced Northwind's first-year commerce budget to 2.0 million NOK, superseding the 2.5M cap in F1.

The B2B Pricing app is a third-party dependency.

F19 — Composa nightly-import variant: Ola Nordmann, 27 November 2026, says a nightly import of prices and stock would cost about 200,000 NOK instead of the 800,000 NOK custom integration (F11), but prices in the shop could be up to a day old. Asked by Gunnar Holm. Not stated: delivery time for this variant, whether the 200k is a fixed price, or whether the 800k was inside or on top of the 1.8M build.
