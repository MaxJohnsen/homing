===== acme/northwind/overview.md =====
# Northwind

Northwind is Acme's largest client. This autumn the work is the website relaunch, sponsored by Gunnar Holm and going live on 1 March 2027.

A second piece of work is the choice of commerce platform for a new spare parts shop, targeted for 1 September 2027. See [the research brief](commerce-platform/research-brief.md).


===== log.md (record) =====
# Log

- 2026-11-30: Added a short Composa nightly-import variant note (F19, Ola Nordmann, 27 November) to the "Composa revisited" section of acme/northwind/commerce-platform/research-brief.md, with cost cases, fit and open questions; added F19 to its sources. Recommendation draft and presentation outline not changed.

- 2026-11-23: Finalised acme/northwind/commerce-platform/session-2026-11-23.md with work done, conclusions and reasons, remaining questions and ordered next steps; recorded the presentation outline and slide-8-only third-party dependency addition. Updated its index description; no platform approval inferred.

- 2026-11-23: Added Ana's third-party dependency note for B2B Pricing to slide 8 (pre-signing checks, the outline's risk-check section) in acme/northwind/commerce-platform/steering-group-presentation-outline.md and recorded its source. All other slides unchanged.

- 2026-10-20: The wiki holds Acme, Northwind, Fjord Bank and Ana’s own pages.
- 2026-11-02: Created acme/northwind/commerce-platform/research-brief.md, the brief for the Northwind commerce platform analysis, with sources F1-F5. Added it to the index.
- 2026-11-02: Added a next step to the research brief: ask Composa for a second reference customer.
- 2026-11-02: Created acme/northwind/commerce-platform/session-2026-11-02.md, the record of this session, and added it to the index.
- 2026-11-09: Updated acme/northwind/commerce-platform/research-brief.md with findings F6-F10, a sourced comparison against all five criteria, first-year and three-year licence/build calculations, preliminary implications and refreshed open questions; updated its index description.
- 2026-11-09: Updated the commerce platform brief following Ana’s report of today’s Gunnar call: removed design flexibility from current criteria, comparison and assessment tasks; made the customer service impact section the first action next session; recorded Ana’s provisional Composa preference and Ola’s integration check pending this week. Updated the index; preserved historical evidence and unresolved risks.
- 2026-11-09: Created acme/northwind/commerce-platform/session-2026-11-09.md with work done, decisions and reasons, open issues and ordered next steps; added it to the index.
- 2026-11-16: Updated acme/northwind/commerce-platform/research-brief.md with F11-F13: added first customer service impact draft, recalculated Butikkskyen (one-store licence 450,000) and Composa (+800,000 integration) costs, flagged Fram module support ending December 2028, refreshed comparison, open questions and next steps.
- 2026-11-16: Created acme/northwind/commerce-platform/session-2026-11-16.md; updated index descriptions.
- 2026-11-16: Added an option B (Composa) revisited section to the research brief and created acme/northwind/commerce-platform/recommendation-draft.md (draft: Butikkskyen conditional on four checks); updated the session record and index.
- 2026-11-16: Recorded the decision (Gunnar, via Ana) to drop the Fram commerce module; updated the research brief, recommendation draft (now A vs B, same-tool goal flagged) and session record. Added an indicative Butikkskyen go-live of about April 2027 (four months from a December decision) to the recommendation draft.
- 2026-11-16: Rewrote acme/northwind/commerce-platform/session-2026-11-16.md as the final record of the session (work done, decisions and why, open points, next steps); updated its index description.
- 2026-11-23: Updated acme/northwind/commerce-platform/research-brief.md with F14–F18: customer service baseline/status self-service, 3,100 lists and v4 capacity superseding old workaround warning, Kodeverket 1.1m fixed-price offer expiring 15 December, reduced 2.0m budget; recalculated A at 1.55m year 1/2.45m three years and refreshed comparisons, questions and next steps.
- 2026-11-23: Updated acme/northwind/commerce-platform/recommendation-draft.md: conditional Butikkskyen preference retained, revised costs and 450,000 headroom, procurement deadline, explicit order-status check and updated pricing/scope conditions; no platform decision inferred.
- 2026-11-23: Created acme/northwind/commerce-platform/session-2026-11-23.md with findings, implications, recommendation status and handover; updated index descriptions and added the session entry.
- 2026-11-23: Updated acme/northwind/commerce-platform/recommendation-draft.md with a steering executive summary and proposed conditional approval resolution reflecting F14–F18; linked the presentation outline. Created acme/northwind/commerce-platform/steering-group-presentation-outline.md with 10 titled slides and main points, sources, revised costs, validation conditions, proposed actions and decisions; updated index. No approval or completed checks inferred.


===== acme/northwind/commerce-platform/research-brief.md =====
# Commerce platform for Northwind's spare parts shop: research brief

Type: analysis brief
Status: preliminary comparison updated 23 November 2026 with F14–F18; Composa nightly-import variant (F19) added 27 November 2026. Butikkskyen remains the conditional preferred option in the [draft recommendation](recommendation-draft.md), not an agreed platform decision. Criteria weights and feasibility checks remain open. Fram commerce module was dropped on 16 November 2026.

## Question

Which commerce platform should Northwind use for its new spare parts shop? Gunnar Holm wants a recommendation for the steering group in December.

## Goals

- Sell spare parts online to dealers and workshops: about 4,000 parts [F1].
- Go live on 1 September 2027 [F1].
- Workshops can reorder in a few clicks [F2]. Dealers mostly order by part number [F5].
- Marketing manages shop content in the same tool as the website [F2]. Whether this is mandatory remains open.
- Customer service wants customers to see order status themselves [F14]. This is a newly evidenced stakeholder need; confirm its launch scope and acceptance criteria with Hanne and Gunnar.

## Constraints

- Customers have customer-specific prices [F1]; Northwind has **3,100 customer-specific price lists** [F15]. Growth is not yet known.
- Microsoft Dynamics 365 holds prices and stock [F1]. Every option must read them in near real time [F3]; the latency target is not yet defined.
- Northwind's integration team is two people [F3].
- **First-year budget: 2.0 million NOK**, cut by management [F18]. This supersedes the 2.5m budget in F1. Licences and build were included in the original budget scope [F1]; confirm treatment of other costs and tax.
- Procurement wants a fixed-price build and licences that can be ended yearly [F4].

## Criteria

Originally agreed at kickoff [F1], amended after Gunnar's call with Ana on 9 November 2026 (reported by Ana that day):

1. Time to market
2. Cost over three years
3. Fit with Dynamics 365
4. Ease of use for marketing

Design flexibility was removed on 9 November because Gunnar says it does not matter for Northwind. Historical evidence is retained but is not a selection benefit. Weights are not set; Gunnar says speed to market matters most [F2]. Customer service impact was requested on 9 November but has not been agreed as a separate weighted criterion.

## Decisions and preference status

- **Fram commerce module (C) dropped, 16 November 2026.** Gunnar agreed to drop it because support ends in December 2028 and Fram recommends a partner platform [F13] (Ana, 16 November). Treat as decided; do not pursue C's outstanding assessment tasks. Its evidence below is historical.
- Fram was the only option with evidence for same-tool content management [F2, F8]. That goal remains unverified for both remaining options; ask Gunnar whether it is mandatory.
- Ana was provisionally leaning towards Composa on 9 November, concerned about integration. Her reasons and whether subsequent findings change her view are not recorded. This is not a platform decision.
- The draft recommendation favours Butikkskyen, subject to validation and contract checks. It has not been reviewed by Ana or agreed with Gunnar as a whole.

## What changed on 23 November 2026

| Finding | Implication for the analysis |
|---|---|
| Hanne Ruud: about 300 calls/week about order status and prices; customers should see status themselves [F14] | Customer service input is now available. Add order-status self-service to demonstrations and integration scoping. The 300 is a combined baseline, not 300 status calls or a forecast of calls saved. |
| Ola: 3,100 customer-specific price lists [F15] | Northwind's actual pricing scale is known; no longer an unanswered count question. |
| Butikkskyen: B2B Pricing v4, released in October, supports up to 10,000 lists; Agder Maskin's workarounds are no longer necessary [F16] | The old above-2,000 workaround warning [F9] is superseded for v4, on vendor evidence. 3,100 is within the stated capacity. Validate Northwind's data and connector end to end; do not keep treating the old threshold as a current limit. |
| Lise: partner Kodeverket offers a fixed-price build at 1.1m NOK, valid until 15 December [F17] | Supersedes the approximate 900,000 build for current costing. Fixed-price requirement has supporting evidence, but written scope, exclusions and acceptance terms remain to be checked. Creates a procurement deadline, not a reason to bypass checks. |
| Gunnar: management cut year-1 budget to 2.0m NOK [F18] | A baseline becomes 1.55m with 450,000 headroom; B remains over budget in both integration-cost cases. |

Previous update (16 November): Composa needs an 800,000 NOK/four-month custom integration before shop work [F11]; A's one-store licence is 450,000/year, not 600,000 [F12]; Fram module support ends December 2028 [F13].

## Customer service impact — updated 23 November 2026

Requested by Gunnar (Ana, 9 November). Hanne Ruud, head of customer service, is now the named contact [F14].

### Evidence and need

- Customer service takes **about 300 calls per week about order status and prices combined** [F14]. The split, call duration and share avoidable through self-service are unknown. This is not total contact or order volume.
- They want customers to see order status themselves [F14]. No option has yet demonstrated this for Northwind.
- 70% of orders currently come by email and phone; dealers mostly order by part number [F5]. F5 does not establish how much customer service handles.
- Quick reordering [F2] and accurate customer-specific prices and near-real-time prices/stock [F1, F3] could reduce routine assistance if adopted. This is a potential effect, not a measured saving.

### Implications by remaining option

| Option | Evidence | Potential effect and outstanding check |
|---|---|---|
| A — Butikkskyen | Standard Dynamics 365 connector and B2B Pricing app [F6]; 3,100 lists within v4's stated 10,000 capacity [F15, F16] | The historical workaround concern is no longer supported as a current v4 limitation. Correct visible prices could reduce price calls, but need validation. Demonstrate customer-specific prices and order-status self-service; confirm status data source, freshness, access permissions, scope (including non-web orders if required), and whether the connector and fixed-price build cover it. A prices/stock connector is not evidence of status integration. |
| B — Composa | Custom integration estimated at four months before shop work [F11]; reference integration ran late [F10] | More delivery/support exposure for the two-person team. Price and order-status self-service scope is unverified; including status could affect integration cost and timing. Obtain evidence rather than assuming the frontend covers it. |

C's possible second migration and service burden after support ends [F13] remain historical considerations only; C is dropped.

### Follow-up with Hanne

- Split the 300 weekly calls between status and prices; establish handling time, causes, other channels and baseline measurement period.
- Define which statuses and orders customers need to see, how current the information must be, and access rules for dealers/workshops. Establish the authoritative status source; do not assume it from the prices/stock requirement.
- Agree launch scope and measurable outcomes (for example status/price calls per week after adoption); no numerical reduction target or savings estimate is evidenced yet.
- Test customer journeys and service tools (order lookup, ordering on behalf of customers, price-list views), onboarding and exception handling. Vendor capability is unknown.

## Options and comparison — updated 23 November 2026

A is Butikkskyen (SaaS shop); B is Composa (headless commerce engine with its own frontend). C is Fram CMS commerce module, kept below as history only. Quotes define offered scope; references describe individual projects, not Northwind delivery commitments. Unknowns are not failed requirements. This is not a weighted score.

| Criterion | A — Butikkskyen | B — Composa | C — Fram (dropped; historical) |
|---|---|---|---|
| Time to market | Strongest evidence: Agder Maskin live in four months [F9]; standard Dynamics 365 connector [F6]. No Northwind delivery plan or reserved capacity yet. Kodeverket offer expires 15 December [F17]. | Weakest: four months of custom integration before shop work starts [F11]; reference launched after nine months and integration ran late [F10]. September 2027 feasibility is unproven. | No implementation duration supplied [F8]. |
| Cost over three years | **2.45m NOK**: 1.1m fixed-price build + 3 × 0.45m licence [F12, F17]. Scope and unquoted costs still need checking. | **5.3m NOK** assuming integration additional: 1.8m build + 0.8m integration + 3 × 0.9m licence [F7, F11]. If integration included in build, 4.5m. | Old quoted baseline 2.1m: 1.2m build + 3 × 0.3m module [F8]. Not a credible full three-year cost given support ending December 2028 [F13]. |
| Fit with Dynamics 365 | Most concrete starting point: standard connector [F6]. 3,100 lists within v4's vendor-stated capacity of 10,000; old workarounds no longer needed [F15, F16]. Actual customer pricing, latency, status integration and support load unverified. | Custom integration through API [F7, F11]. Material capacity/delivery risk for two-person team [F3, F10]. Near-real-time performance, pricing and status fit not demonstrated; builder/owner unknown. | No integration or customer-pricing evidence [F8]. |
| Ease of use for marketing | Same-tool goal and ease of use unverified [F2, F6]. | Included frontend does not establish editorial workflow or Fram integration [F2, F7]. | Marketing keeps working in Fram [F8], but benefit would have limited lifetime [F13]; usability not demonstrated. |

### Cost basis and first-year budget

All figures NOK. These are **licence-and-build baselines**, not complete total cost of ownership: one build plus one or three full annual licence charges at unchanged rates. A now uses Kodeverket's fixed-price offer [F17]; B figures remain estimates/approximate quotes. One-store A licence is 450,000/year [F12].

| Option/case | Annual licence | Build incl. assumed integration | Year 1 | Against current 2.0m budget [F18] | Three years |
|---|---:|---:|---:|---|---:|
| A — Butikkskyen [F12, F17] | 450,000 | 1,100,000 fixed-price offer | **1,550,000** | **450,000 below** | **2,450,000** |
| B — integration additional [F7, F11] | 900,000 | 1,800,000 + 800,000 = 2,600,000 | **3,500,000** | **1,500,000 above** | **5,300,000** |
| B — integration inside build (unconfirmed best case) [F7, F11] | 900,000 | 1,800,000 | **2,700,000** | **700,000 above** | **4,500,000** |

Historical C baseline: year 1 1.5m and three years 2.1m [F8]; no replacement/migration allowance despite support ending December 2028 [F13]. It is not a live budget alternative.

**Change from 16 November:** A rises from 1.35m to 1.55m year 1, and from 2.25m to 2.45m over three years, because the build changes from approximately 900,000 to a fixed-price 1.1m [F6, F17]. Combined with the budget cut from 2.5m to 2.0m [F1, F18], headroom falls from 1.15m to **450,000**. B's costs are unchanged; overrun grows by 500,000. Earlier 9 November A figures used the two-store licence (year 1 1.5m, three years 2.7m); B figures before F11 were 2.7m and 4.5m.

**Scope and terms to establish:** obtain the written Kodeverket offer, confirm it is for Northwind's one-store scope, and reconcile it with the platform quote: B2B Pricing v4, standard connector, customer pricing, order status, migration, testing, training and delivery milestones. F17 establishes a fixed-price offer, not that every requirement is included. Clarify hosting, support, maintenance, internal effort, contingency, tax and licence escalation; unknown costs are not zero. For A, all additional year-1 costs in budget must fit within 450,000. Annual licence pricing does not establish yearly cancellation rights [F4].

### Preliminary implications, not a final selection

- **Butikkskyen is the strongest candidate to validate first.** It leads on evidenced delivery time, cost and integration starting point. F15/F16 resolve the price-list count and supersede the historical workaround concern at Northwind's scale; operational validation remains. F17 supplies a fixed-price build offer, subject to scope confirmation. A fits the reduced budget on the baseline only [F6, F9, F12, F15–F18].
- **Composa is still the most expensive and slowest remaining option.** It exceeds the reduced budget by 1.5m if integration is additional, or 0.7m even if already included. It needs revised cost/scope or an explicit budget exception and a credible delivery plan [F7, F11, F18]. Flexibility is no longer a criterion; Ana's provisional preference does not settle these issues.
- **Fram remains dropped.** Ending support about 16 months after planned launch outweighed its same-tool benefit; the old 2.1m baseline omitted a potential replacement and migration [F1, F8, F13]. Do not reopen it simply because the budget changed.
- No remaining option has demonstrated all requirements. Validate near-real-time integration, order-status self-service, quick reordering/part-number ordering, marketing workflow and full contractual scope/terms. Agree weights before a weighted ranking.

## Composa revisited — current implications of F11 and F18

F11 confirms the integration concern: no standard connector [F7], an estimated 800,000 NOK and four months of custom work before shop work can start. Confirm whether this is Ola's completed check commissioned in the week of 9 November, whether the estimate is additional to the build, and who builds, owns and supports it.

- **Cost:** 3.5m year 1 / 5.3m three years if additional; 2.7m / 4.5m if included. Both exceed the current 2.0m budget [F18]; neither is a fixed-price commitment [F4, F7, F11].
- **Time:** illustrative only: integration starting 1 December ends around 1 April, leaving five months for shop work before 1 September 2027. A 1 January start leaves four months. A December decision plus procurement makes a 1 December start unlikely. No evidence that the integration can overlap with shop work; ask rather than assume. The reference's integration ran late [F10].
- **Capacity:** custom integration creates build and ongoing support exposure for a two-person team [F3]. Ownership and effort are unknown.
- **Advantages evidenced:** frontend included [F7]; reference describes flexibility [F10], but flexibility is no longer a criterion. Marketing usability remains unverified. B does not lead on any current criterion on the evidence.
- **Conditions to reconsider:** a fixed-price, complete scope within 2.0m (or approved budget exception), a credible September delivery plan, and evidence of required workflows. A connector or changed sequencing could help only if evidenced. Ask Ana for her reasons for preferring B before finalising the recommendation.

### Variant: nightly import instead of custom integration — added 27 November 2026

Gunnar asked whether Composa would work if the custom integration were replaced by a nightly import of prices and stock. Ola estimates about **200,000 NOK instead of 800,000**, but prices in the shop could be **up to a day old** [F19].

- **Cost:** if the 200,000 is additional to the 1.8m build, as the 800,000 is assumed to be: year 1 **2.9m** (900,000 over the 2.0m budget) and three years **4.7m**. If it is inside the build, the figures are the earlier best case of 2.7m and 4.5m. Composa is over budget in every case [F7, F11, F18, F19].
- **Fit:** it does not meet the near-real-time requirement for prices and stock as it stands [F1, F3]. Using it would need Gunnar and Ola to accept day-old data and decide what that means for customer-specific prices, stock accuracy and the price calls customer service already handles [F14]. That is a business decision, not something the evidence shows to be acceptable. Relaxing the requirement would apply to Butikkskyen as well, so it would have to be re-run for both options.
- **Time:** no duration was given. Do not assume it is shorter than the four months for the custom integration [F11].
- **To confirm with Ola:** whether the 200,000 is additional to the build, whether it covers order-status data [F14], who builds and owns it, whether the nightly import is a stopgap or the intended end state, and how it would be replaced later and at what cost.

So the variant narrows Composa's cost gap but does not bring it within budget, and it trades away a stated requirement. It does not change the draft recommendation.

## Indicative go-live and procurement timing

Butikkskyen could indicatively launch around **April 2027** if a December decision is immediately followed by contracting/start and the four-month reference duration applies [F9]. This is not a forecast or commitment: one reference, no Northwind plan, no confirmed capacity, and validation/procurement may delay the start. Required date remains 1 September 2027 [F1].

Kodeverket's offer is valid until **15 December 2026** [F17]. The December steering date is unknown. Confirm a decision/signing route before expiry or seek a written extension; do not assume the quote or delivery slot survives after that date. Do not skip checks to meet the offer deadline.

## Open questions and next steps

### Immediate: validate A and preserve the offer

1. Lise/Kodeverket/Butikkskyen: obtain and review the 1.1m fixed-price offer, scope, exclusions, acceptance/change-control terms and validity; confirm one-store 450,000 licence, B2B Pricing v4, connector and yearly cancellation rights [F4, F6, F12, F16, F17]. Build a complete budget within 2.0m, with explicit allowance for unquoted costs [F18].
2. Find the December steering date and signing authority. If the process extends beyond 15 December, seek an offer extension. Outcome of the 11 November steering meeting is still not recorded.
3. Ola/Butikkskyen: demonstrate Northwind's **3,100 lists** on v4, representative customer-specific prices, near-real-time prices/stock and failure recovery. Confirm growth needs and support burden; the old above-2,000 workaround test is no longer the relevant gate [F3, F15, F16]. Define latency in seconds/minutes.
4. Hanne/Ola/vendors: define order-status self-service and demonstrate it end to end; confirm data source, freshness, permissions and inclusion in scope. Refine the call baseline and success measures [F14].
5. Obtain Northwind-specific delivery milestones and resource availability through 1 September 2027. Reference durations are not commitments [F1, F9, F10].

### Decision work and remaining checks

- Review the draft with Ana, hear her Composa reasons and whether F11–F18 change her view; agree weights with Gunnar.
- Ask Gunnar whether same-tool content management is mandatory. Demonstrate marketing's workflow for A/B; neither is established [F2].
- Demonstrate quick reordering and ordering by part number [F2, F5].
- Confirm B's cost inclusion, fixed-price potential, builder/owner, sequencing and September feasibility with Ola/Composa [F7, F11]. Ask Composa for a second reference (Vestlandsdeler is the first [F10]); seek a further comparable A reference.
- Confirm later-year budget, treatment of non-build/licence costs, whether 1 September is fixed, and success measures for orders moved online [F5, F18].
- Vendor identity for Fram CMS versus Lars Moe's employer remains unconfirmed; no longer a live platform assessment task.
- C questions about post-2028 terms, partner platforms and migration remain historical and are not being pursued following the drop decision.

## Recommendation

See [recommendation-draft.md](recommendation-draft.md): Butikkskyen preferred, conditional on evidence and contract checks. Not agreed with Ana or Gunnar. See [session-2026-11-23.md](session-2026-11-23.md) for this update's handover.

## Sources

- [F1] Kickoff notes, 28 October 2026 (Ana): approximately 4,000 parts, September 2027 launch, original 2.5m first-year budget (superseded by F18).
- [F2] Interview with Gunnar Holm, 29 October 2026.
- [F3] Interview with Ola Nordmann, integration architect, 29 October 2026.
- [F4] Interview with Lise Berg, procurement, 30 October 2026.
- [F5] Market note from Cara, 30 October 2026.
- [F6] Butikkskyen quote, 3 November 2026: licence 600,000 NOK/year (two stores, corrected by F12); partner build about 900,000 NOK (current build offer in F17); standard Dynamics 365 connector included; customer-specific prices require B2B Pricing app, included in licence.
- [F7] Composa quote, 4 November 2026: licence 900,000 NOK/year; build about 1.8m including frontend; no standard Dynamics 365 connector; integration through API.
- [F8] Fram CMS, 4 November 2026: commerce module 300,000 NOK/year; build about 1.2m; marketing keeps working in Fram.
- [F9] Reference call with Agder Maskin, 5 November 2026: Butikkskyen live in four months; B2B Pricing needed workarounds above 2,000 lists. Historical implementation experience; F16 supersedes the workaround warning for v4.
- [F10] Reference call with Vestlandsdeler, 6 November 2026: Composa very flexible; launched after nine months; integration took longer than planned.
- [F11] Ola Nordmann, 11 November 2026: Composa needs custom Dynamics 365 integration; estimate 800,000 NOK and four months before shop work can start.
- [F12] Butikkskyen correction, 12 November 2026: 600,000 licence was for two stores; one store is 450,000 NOK/year.
- [F13] Fram CMS, 12 November 2026: commerce module support ends December 2028; recommends moving to a partner platform.
- [F14] Hanne Ruud, head of customer service, 17 November 2026: about 300 calls/week about order status and prices; wants customers to see order status themselves.
- [F15] Ola Nordmann, 18 November 2026: Northwind has 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: B2B Pricing v4, released October, handles up to 10,000 price lists; Agder Maskin's workarounds no longer necessary.
- [F17] Lise Berg, 19 November 2026: Butikkskyen partner Kodeverket offers the build at a fixed 1.1m NOK; offer valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: management cut first-year budget to 2.0m NOK.
- [F19] Ola Nordmann, 27 November 2026: a nightly import of prices and stock for Composa would cost about 200,000 NOK instead of 800,000, but shop prices could be up to a day old.
- Ana, 9 November 2026, reporting Gunnar's call: remove design flexibility; add short customer service impact assessment. Ana provisionally leans towards Composa, concerned about integration; Ola to check during the week of 9 November.
- Ana, 16 November 2026: Gunnar agreed to drop Fram commerce module; requested indicative go-live line.

Related: [Northwind overview](../overview.md), [Gunnar Holm](../website-relaunch/gunnar-holm.md), [Lise Berg](../website-relaunch/lise-berg.md)


===== acme/northwind/commerce-platform/session-2026-11-02.md (record) =====
# Commerce platform analysis: session 2 November 2026

Type: session record
Brief: [research-brief.md](research-brief.md)

## What we worked on

- Set up the research brief for Northwind's spare parts shop platform choice: question, goals, constraints, criteria, options A (Butikkskyen), B (Composa) and C (Fram CMS commerce module), facts from F1-F5 and open questions.
- Linked the brief from the Northwind overview and added it to the index.

## Decisions and why

- Keep the brief to facts from the sources, with no conclusions about the options. Nothing has been compared yet, and the recommendation should rest on evidence.
- Ask Composa for a second reference customer. It is a standard check, and we will keep the same standard for all options.

## Still open

- Criteria weights. Gunnar puts speed to market first, but the steering group has not agreed weights.
- What "near real time" means in numbers for prices and stock (Ola Nordmann).
- Budget after the first year, and whether the 1 September 2027 date is fixed.
- A measure of success for the shop.
- Whether the Fram CMS vendor is the same one Lars Moe works for, and whether it has been asked about the commerce module.
- The date of the December steering group meeting. The next meeting is 11 November.
- All per-option questions (Dynamics 365 connector, customer-specific prices, time to live, three-year cost, fixed build price and yearly licences, content in the website tool, reordering and part number ordering, integration workload). Details are in the brief.

## Next steps

1. At the start of the next session, remind Ana to ask Composa for a second reference customer. Consider asking A and C for references too.
2. Ask each vendor the per-option questions in the brief.
3. Ask Ola about integration requirements and Lise about procurement terms.
4. Agree criteria weights with Gunnar.
5. Score the options and draft the recommendation for the December steering group.

## Sources

- Conversation with Ana, 2 November 2026


===== acme/northwind/commerce-platform/session-2026-11-09.md (record) =====
# Commerce platform analysis: session 9 November 2026

Type: session record
Brief: [research-brief.md](research-brief.md)

## What we worked on

- Added vendor findings F6–F8 and reference calls F9–F10 to the brief, with sources and a qualitative comparison of Butikkskyen, Composa and Fram CMS.
- Calculated quoted licence-and-build baselines: first year A 1.5m, B 2.7m, C 1.5m NOK; three years A 2.7m, B 4.5m, C 2.1m NOK [F6–F8]. These are not complete ownership costs or confirmed fixed-price builds.
- Updated the comparison and follow-ups after Ana's call with Gunnar.

## Decisions and why

- Removed design flexibility as a criterion and assessment task: Gunnar says it does not matter for Northwind (Ana, 9 November). Current criteria are time to market, three-year cost, Dynamics 365 fit and marketing usability. Historical reference evidence remains, but flexibility is not counted as an advantage.
- Made a short customer service impact section for each option the first task next session, because Gunnar requested it and Ana explicitly prioritised it before anything else. It has not yet been written and is not automatically a new weighted criterion.
- No platform selected. Ana is leaning towards Composa but is worried about integration; Ola will check it this week, week of 9 November (Ana, 9 November). This preference is separate from the evidence and is not a final recommendation.
- Kept the comparison preliminary: weights and mandatory feasibility checks remain unresolved; reference delivery durations are not Northwind commitments.

## Still open

- Customer service implications for all three options; separate evidence, possible implications and unknowns.
- Ola's Composa integration findings. Composa has no standard Dynamics 365 connector [F7]; its reference reported integration delays and a nine-month launch [F10]. No check result yet.
- Composa's first-year quoted baseline is 200,000 NOK over the 2.5m budget [F1, F7]; integration clearance alone would not resolve this.
- Near-real-time price/stock capability, numerical latency target, integration ownership and workload for the two-person team [F3].
- Customer-specific pricing at Northwind's scale, including actual price-list count: Butikkskyen's reference needed workarounds above 2,000 lists [F9]. Parts count is not price-list count.
- Northwind-specific delivery plans; Fram's integration and timing; marketing workflow demonstrations, quick reordering and part-number ordering.
- Full three-year costs, fixed-price builds, yearly cancellation rights, criteria weights and final recommendation. Other business questions remain in the brief, including later-year budget, date flexibility, success measures and December steering group date.

## Next steps — in order

1. **Before anything else next session, add the short section on what A/B/C mean for Northwind's customer service team.** This takes priority over the earlier second-reference reminder.
2. Obtain and assess Ola's Composa integration check from this week; retain unresolved risks until evidence arrives.
3. Follow up vendor demonstrations, delivery plans, complete costs and procurement terms; involve Ola and Lise as appropriate.
4. Ask Composa for a second reference customer (Vestlandsdeler is the first recorded); seek further comparable references for A/C too.
5. Agree the four criteria's weights with Gunnar, complete the assessment and draft the recommendation for December.

## Sources

- Conversation with Ana, 9 November 2026, including her report of that day's call with Gunnar, next-session instructions, provisional Composa preference and Ola's planned check.
- [F1] Kickoff notes, 28 October 2026 (Ana).
- [F3] Interview with Ola Nordmann, 29 October 2026.
- [F6] Butikkskyen quote, 3 November 2026.
- [F7] Composa quote, 4 November 2026.
- [F8] Fram CMS, 4 November 2026.
- [F9] Reference call with Agder Maskin, 5 November 2026.
- [F10] Reference call with Vestlandsdeler, 6 November 2026.
- [Research brief](research-brief.md), updated 9 November 2026, for the detailed comparison, outstanding questions and full source descriptions.


===== acme/northwind/commerce-platform/session-2026-11-16.md (record) =====
# Commerce platform analysis: session 16 November 2026

Type: session record
Brief: [research-brief.md](research-brief.md)
Draft recommendation: [recommendation-draft.md](recommendation-draft.md)

## What we worked on

- Added F11–F13 to the brief and recalculated the comparison and cost tables.
- Wrote a first draft of the customer service impact section (the task set on 9 November). It has no customer service input yet, so it is mostly possible implications and unknowns.
- Revisited Composa (B) in light of Ola's estimate and added a section on it to the brief.
- Drafted a recommendation for the December steering group.
- Recorded the decision to drop Fram and added an indicative go-live to the draft.

## What the new findings showed

- **F11, Composa:** custom Dynamics 365 integration, 800,000 NOK and four months before shop work can start (Ola Nordmann, 11 November). If it is on top of the 1.8m build: year 1 is 3.5m (1.0m over the 2.5m budget) and three years 5.3m. If it is inside the build: 2.7m and 4.5m, still over budget. Composa leads on none of the four criteria. It looks like the result of Ola's pending check; this is to be confirmed with him.
- **F12, Butikkskyen:** the 600,000 licence was for two stores. For one store it is 450,000 a year, so year 1 is 1.35m and three years 2.25m (was 1.5m and 2.7m). Whether the build and inclusions are unchanged is not confirmed.
- **F13, Fram CMS:** support for the commerce module ends December 2028, about 16 months after the planned go-live. Fram recommends a partner platform.

## Decisions and why

- **Fram commerce module dropped.** Gunnar agreed on 16 November, because support ends in December 2028 [F13] (reported by Ana). Treated as decided. The options are now Butikkskyen (A) and Composa (B). Fram's evidence stays in the brief as history.
- **No platform decision yet and no weights.** The draft recommends Butikkskyen, conditional on four checks: price lists at Northwind's scale, near-real-time prices and stock, a written one-store offer, and the marketing same-tool workflow. The reason is that it is ahead on time, cost and Dynamics 365 fit, and it is the only option clearly within the first-year budget. It is a draft, not reviewed by Ana and not agreed with Gunnar.
- **Indicative go-live for Butikkskyen: about April 2027**, counting four months [F9] from a December decision. Not a commitment: it rests on one reference, assumes the checks pass and signing right after the decision, and there is no vendor delivery plan.
- Ana's Composa preference (9 November) is on record but not treated as evidence. Her reasons, and whether F11 changes them, have not been recorded.
- Assumptions to confirm: the 800,000 is additional to Composa's build and paid by Northwind (F11); Butikkskyen's build and inclusions are unchanged for one store (F12).

## Still open

- Is same-tool content management (marketing managing shop content where it manages the website) mandatory? With Fram dropped it is unverified for both A and B, and it is the main thing that could reverse the draft.
- Ana's reasons for leaning towards Composa and her view of the draft.
- Whether F11 is Ola's full check, who would build and own the integration, and whether it could be shortened or run in parallel.
- Butikkskyen: one-store offer in writing, delivery plan, price-list count and pricing at scale, near-real-time latency (in seconds or minutes).
- Customer service input for the new section.
- December steering date and the outcome of the 11 November steering meeting (not recorded).
- Criteria weights; full costs, fixed-price build and yearly cancellation terms; later-year budget; whether 1 September 2027 is fixed.

## Next steps

1. Review the draft recommendation with Ana, including her Composa reasons; ask Gunnar whether same-tool content management is mandatory and agree weights.
2. Ola: confirm F11 and set the latency target. Butikkskyen: demonstration, written one-store offer and delivery plan. Lise: procurement terms.
3. Collect customer service input via Gunnar.
4. Find the December steering date, so the go-live line uses a real decision date.
5. Update the brief and draft, then finalise the recommendation.

## Sources

- [F9] Reference call with Agder Maskin, 5 November 2026.
- [F11] Ola Nordmann, 11 November 2026.
- [F12] Butikkskyen correction, 12 November 2026.
- [F13] Fram CMS, 12 November 2026.
- Ana, 16 November 2026: Gunnar's agreement to drop the Fram commerce module, and the request for the go-live line.
- Earlier findings F1–F10 and Ana's 9 November instructions, as listed in the [research brief](research-brief.md).


===== acme/northwind/commerce-platform/recommendation-draft.md =====
# Draft recommendation: commerce platform for Northwind's spare parts shop

Type: draft for the December steering group
Status: DRAFT, updated 23 November 2026 with F14–F18. Not reviewed by Ana or agreed with Gunnar as a whole. Criteria weights are not set. Evidence, cost assumptions and finding ids are in the [research brief](research-brief.md).

## Recommendation

**Proceed with Butikkskyen (A) as the preferred platform, subject to the checks below before signing.** Do not proceed with Composa (B) on its current quote and integration estimate.

### Executive summary for the steering group

- **Budget:** 1.55m NOK licence-and-build baseline in year 1 against management's revised 2.0m ceiling; 450,000 remains for other in-budget costs. Three-year baseline: 2.45m, not full total cost of ownership [F12, F17, F18].
- **Pricing:** Northwind's 3,100 lists are within the vendor-stated 10,000-list capacity of B2B Pricing v4. The old workaround warning is superseded for v4; validate actual pricing with Dynamics 365 [F15, F16].
- **Service:** about 300 weekly calls concern status and prices combined. Make order-status self-service an explicit acceptance check; do not claim a quantified reduction or assume connector coverage [F14].
- **Timing:** Kodeverket's fixed-price 1.1m build offer expires 15 December. Confirm signing authority and timetable or obtain a written extension; retain the 1 September 2027 launch requirement and require a supplier delivery plan [F1, F17].
- **Unresolved decision:** same-tool content management is unverified for both remaining options; Gunnar must confirm whether it is mandatory [F2].

**Proposed resolution (not yet approved):** Approve Butikkskyen as preferred, with contract signing conditional on documented passage of the checks below, a complete first-year budget within 2.0m NOK, and an acceptable delivery plan for 1 September 2027. Assign signing authority explicitly. If checks fail or scope/cost changes materially, return to steering rather than defaulting to Composa; if signing cannot occur within offer validity, obtain an extension or refreshed offer before proceeding.

Presentation: [10-slide steering group outline](steering-group-presentation-outline.md).

The new evidence strengthens A's case: Northwind's 3,100 price lists fit within B2B Pricing v4's stated 10,000-list capacity, and Kodeverket offers a fixed-price build [F15–F17]. This resolves the count question and supersedes the old workaround warning as a current v4 limitation, but does not establish end-to-end pricing performance or complete contract scope.

Fram commerce module (C) remains dropped: Gunnar agreed on 16 November because support ends December 2028 and Fram recommends a partner platform [F13] (Ana, 16 November). Its evidence remains in the brief as history.

## Cost and budget — revised

**Current first-year budget is 2.0m NOK**, not 2.5m [F18 supersedes F1]. These figures are licence-and-build baselines, not full total cost of ownership.

| | Year 1 | Against 2.0m budget | Three years |
|---|---:|---|---:|
| A — 1.1m fixed-price Kodeverket build + 450,000/year licence [F12, F17] | **1.55m** | **450,000 headroom** | **2.45m** |
| B — 1.8m build + 800,000 integration + 900,000/year licence [F7, F11] | **3.5m** | **1.5m over** | **5.3m** |
| B — if integration is already in the 1.8m build (unconfirmed best case) | **2.7m** | **700,000 over** | **4.5m** |

A's build is now 200,000 higher than the earlier approximate 900,000; combined with the budget cut, headroom falls from 1.15m to **450,000**. All additional first-year costs that fall within the budget must fit there. Confirm scope, support, hosting, internal effort, contingency, tax and licence escalation rather than treating unknowns as zero. F17 establishes a fixed-price offer, not that every required integration/workflow is included.

**Kodeverket's offer expires 15 December 2026 [F17].** Confirm the steering date and authorised signing route now, or seek a written extension. The expiry is not a reason to bypass validation, and no price or delivery slot after expiry is assumed.

## Why Butikkskyen

Gunnar says speed to market matters most [F2]. On the four current criteria:

| Criterion | A — Butikkskyen | B — Composa |
|---|---|---|
| Time to market | Best current evidence: reference live in four months [F9]; standard connector [F6]. Northwind plan/capacity still needed. | Four months of custom integration before shop work [F11]; reference launched after nine months [F10]. |
| Cost over three years | 2.45m baseline; year 1 1.55m, below reduced budget [F12, F17, F18]. | 5.3m baseline, or 4.5m if integration included; over budget in both cases [F7, F11, F18]. |
| Fit with Dynamics 365 | Standard connector [F6]; 3,100 lists within v4's stated 10,000 capacity; old workarounds no longer needed [F15, F16]. Actual pricing, latency and status integration unverified. | Custom integration; performance, pricing/status scope and ownership not demonstrated [F7, F11]. |
| Ease of use for marketing | Unverified; same-tool goal remains open. | Unverified; included frontend does not establish editorial workflow. |

A leads on current evidence for time, cost and integration starting point. Neither option has demonstrated all constraints. This is qualitative, not a weighted score; agree weights with Gunnar. Ana's provisional Composa preference (9 November) and her reasons still need review before finalisation.

## Customer service: evidenced need, unverified solution

Hanne Ruud reports about **300 calls/week about order status and prices combined**, and wants customers to see status themselves [F14]. This is a useful baseline, not a claim that all 300 calls will disappear or that they are all status calls.

Both options must demonstrate the relevant customer journeys. For A, the standard prices/stock connector and increased pricing capacity do not prove order-status integration. For B, status scope could add to the custom integration estimate. Agree status data source, freshness, access rules and which orders are visible; confirm scope/cost before signing. With Hanne, split the call baseline and agree measurable outcomes. No quantified savings are supported yet.

## Conditions: checks before signing with Butikkskyen

The four earlier checks are retained but updated; order-status validation is now explicit.

1. **Customer-specific pricing on v4 at Northwind's scale.** Demonstrate representative customers and the **3,100 price lists** with Dynamics 365 [F15, F16], including updates, failure handling and growth needs. Do not require the old above-2,000 workarounds: the vendor says v4 removes that need. The remaining check is operational fit, not an unknown count or presumed capacity breach.
2. **Near-real-time prices and stock.** Ola defines latency in seconds/minutes; Butikkskyen demonstrates the standard connector against it and confirms ongoing support responsibilities for the two-person team [F3, F6].
3. **Written complete scope, budget and terms.** Lise reviews Kodeverket's **1.1m fixed-price offer**, valid to **15 December**, including exclusions, acceptance and change control [F17]. Reconcile with the one-store 450,000 licence, B2B Pricing v4 and standard connector [F6, F12, F16]. Confirm order-status integration, migration, testing/training and delivery scope, yearly licence cancellation rights [F4], and a full first-year budget within 2.0m [F18]. Fixed-price evidence is now present; scope and cancellation rights are not yet settled.
4. **Marketing workflow.** Demonstrate same-tool content management [F2]. Neither remaining option is known to meet it. If A cannot, Gunnar must decide whether to relax the goal or reopen the choice.
5. **Order-status self-service.** Hanne/Ola define the launch need and acceptance criteria; demonstrate authorised customers viewing sufficiently current status for the required orders [F14]. Confirm authoritative data source, integration ownership and inclusion in the fixed scope. This new check should not be assumed satisfied by the prices/stock connector.

Also require a Northwind-specific delivery plan with committed milestones and resource availability, and demonstrate quick reordering and part-number ordering [F1, F2, F5].

## Indicative go-live

Butikkskyen could indicatively go live around **April 2027** if a December decision is immediately followed by contracting/start and the reference's four-month duration applies [F9]. That is four to five months before the required 1 September 2027 date [F1].

This is not a commitment: one reference, no Northwind delivery plan or confirmed capacity, and checks/procurement could delay the start. The December steering date remains unknown. If signing falls after 15 December, obtain an offer extension or refreshed quote before relying on the present cost baseline. Composa's integration alone would take about four months, with shop work still to do [F11].

## What would change the recommendation

- A fails pricing, latency, self-service, scope/budget or procurement checks, or cannot commit to September delivery.
- A fails the marketing workflow and Gunnar treats same-tool management as mandatory.
- Unquoted costs exhaust A's 450,000 headroom or the offer expires without acceptable renewal.
- Composa provides a complete fixed-price scope within 2.0m (or steering approves an exception), a credible September plan and stronger workflow evidence. It is not currently a budget-compliant fallback.

## Decisions needed from the steering group

1. Approve A as preferred, subject to the checks; define signing authority and timing in relation to the 15 December offer expiry.
2. Work within management's revised **2.0m** year-1 ceiling [F18]; clarify included cost categories and later-year budget. Confirm whether 1 September 2027 is fixed.
3. Confirm whether same-tool content management is mandatory; agree order-status self-service launch scope with Hanne.
4. Agree criteria weights before any weighted ranking. This draft is not an already agreed platform decision.

## Next steps before December

1. Lise: written Kodeverket scope/terms and complete budget; confirm December steering/signing timing or request offer extension.
2. Ola/Butikkskyen: v4 pricing and connector demonstration, latency target, delivery plan and support ownership. Hanne/Ola: define and test order-status self-service and refine call baseline.
3. Demonstrate marketing workflow; Gunnar confirms whether same-tool is mandatory. Test reordering and part-number ordering.
4. Review this draft with Ana, hear her Composa reasons and response to new evidence; agree weights with Gunnar.
5. Ola/Composa: clarify integration cost inclusion, ownership, scope and timeline. Update the brief and draft, then finalise.

## Sources

Finding details F1–F18 are in the [research brief](research-brief.md). Key sources: [F1] kickoff notes, 28 October 2026; [F2] Gunnar Holm, 29 October; [F3] Ola Nordmann, 29 October; [F4] Lise Berg, 30 October; [F5] Cara, 30 October; [F6] Butikkskyen quote, 3 November; [F7] Composa quote, 4 November; [F9] Agder Maskin reference, 5 November; [F10] Vestlandsdeler reference, 6 November; [F11] Ola Nordmann, 11 November; [F12] Butikkskyen licence correction, 12 November; [F13] Fram CMS, 12 November.

- [F14] Hanne Ruud, head of customer service, 17 November 2026: about 300 calls/week about order status and prices; wants order-status self-service.
- [F15] Ola Nordmann, 18 November 2026: 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: B2B Pricing v4 (released October) handles up to 10,000 lists; Agder Maskin's workarounds no longer needed.
- [F17] Lise Berg, 19 November 2026: Kodeverket fixed-price build 1.1m NOK, offer valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: management cut first-year budget to 2.0m NOK.
- Ana, 9 November 2026: criteria change, customer service assessment request, provisional Composa preference and pending Ola check.
- Ana, 16 November 2026: Gunnar agreed to drop Fram commerce module; request for indicative go-live.


===== acme/northwind/commerce-platform/session-2026-11-23.md (record) =====
# Commerce platform analysis: session 23 November 2026

Type: end-of-session record
Links: [research brief](research-brief.md), [draft recommendation](recommendation-draft.md), [10-slide steering presentation outline](steering-group-presentation-outline.md)

## What we worked on

- Incorporated F14–F18 into the brief and recommendation: customer service input, actual price-list count, B2B Pricing v4 capacity, Kodeverket's fixed-price offer and the reduced budget.
- Recalculated costs and added a steering executive summary and proposed conditional approval resolution.
- Wrote a 10-slide steering group outline covering recommendation, goals, shortlist, pricing, costs, customer service, delivery, pre-signing checks, actions and decisions.
- At Ana's request, added **B2B Pricing is a third-party dependency** only to slide 8 (the pre-signing checks/risk section); left all other slides unchanged. Did not propagate this last addition into the recommendation or brief.

## Conclusions and decisions — and why

- **Draft recommendation remains Butikkskyen, conditional; no platform approval was made.** It has the strongest current evidence on delivery speed, cost and Dynamics 365 integration starting point. Ana's earlier provisional Composa preference has not been explicitly withdrawn; reasons and response to later evidence remain unrecorded.
- **The old pricing workaround concern is superseded for v4:** Northwind has 3,100 lists [F15], within Butikkskyen's stated 10,000 capacity; the vendor says Agder Maskin's workarounds are no longer needed [F16]. Actual end-to-end pricing still needs validation.
- **Use the new build price and budget:** A's 1.1m fixed-price build plus 450,000 annual licence gives **1.55m year 1 / 2.45m three years**, leaving **450,000** against the revised **2.0m** year-1 ceiling [F12, F17, F18]. These are licence-and-build baselines, not complete costs.
- **Composa remains over budget in both cases:** 3.5m year 1 / 5.3m three years if integration is additional; 2.7m / 4.5m if included. Year-1 overruns are 1.5m and 700,000 respectively [F7, F11, F18]. It is not a budget-compliant fallback.
- **Order-status self-service is an explicit validation check:** Hanne reports about 300 calls/week about status and prices combined [F14]. No quantified savings or vendor capability was assumed; a prices/stock connector does not prove status integration.
- **Fram stays dropped** under Gunnar's 16 November decision because module support ends December 2028 [F13]. April 2027 for A remains a reference-based illustration, not a supplier commitment; required launch remains 1 September 2027 [F1, F9].

## Still open

- Kodeverket offer scope/exclusions, acceptance terms, yearly licence cancellation, and complete costs within the 450,000 remaining headroom. Offer expires **15 December 2026** [F17].
- December steering date and signing authority, or a written offer extension; outcome of the 11 November steering meeting remains unrecorded.
- Demonstrations of 3,100-list pricing on v4, near-real-time prices/stock, failure handling, integration support ownership and committed September delivery/resources.
- Order-status source, freshness, permissions and visible orders; fixed-price inclusion; split/handling time of the 300 weekly calls and measurable service outcomes.
- Whether same-tool content management is mandatory; neither remaining option is proven to meet it. Marketing usability, reordering and part-number journeys still need testing.
- Criteria weights, Ana's view of the recommendation, later-year budget/cost categories and whether September's date is fixed. B's integration estimate inclusion, builder/owner and sequencing remain unconfirmed.

## Next steps for next time

1. **Start with the offer deadline:** confirm steering/signing timing; Lise to obtain full written Kodeverket scope/terms and a complete budget, or seek an extension before 15 December. Do not bypass checks to preserve the offer.
2. **Ola/Butikkskyen:** agree latency targets, demonstrate real pricing/stock updates and failure recovery, and obtain delivery milestones/resources and support ownership.
3. **Hanne/Ola:** define and demonstrate order-status self-service, confirm scope/cost inclusion, refine the service baseline and agree outcomes.
4. **Ana/Gunnar:** review the recommendation and presentation, discuss Composa reasons, resolve the marketing requirement and agree weights. Test remaining customer/editorial journeys.
5. Clarify Composa's integration scope/cost/ownership as needed; finalise the steering material only after evidence and decisions are recorded. Suggested owners above are proposed, not confirmed assignments.

## Sources

- [F12] Butikkskyen, 12 November 2026: one-store licence 450,000 NOK/year.
- [F14] Hanne Ruud, head of customer service, 17 November 2026: about 300 weekly status/price calls and self-service need.
- [F15] Ola Nordmann, 18 November 2026: 3,100 customer-specific price lists.
- [F16] Butikkskyen, 19 November 2026: v4 released October, capacity 10,000; old workarounds no longer needed.
- [F17] Lise Berg, 19 November 2026: Kodeverket fixed-price 1.1m offer, valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: year-1 budget cut to 2.0m.
- F1–F13 and Ana's 9/16 November inputs as listed in the [research brief](research-brief.md).
- Ana, 23 November 2026: requested updated recommendation, 8–10-slide steering outline, third-party dependency note on the risks slide only, and this end-of-session record.


===== acme/northwind/commerce-platform/steering-group-presentation-outline.md =====
# Steering group presentation outline: Northwind commerce platform

Type: presentation outline — 10 slides
Status: DRAFT, 23 November 2026, for the December steering group (meeting date unconfirmed). Proposed recommendation, not an approved platform decision. Criteria weights remain open.

Based on the [updated recommendation](recommendation-draft.md) and [research brief](research-brief.md). Figures are NOK; cost comparisons are licence-and-build baselines, not complete total cost of ownership. Proposed responsibilities and resolutions below are for agreement, not recorded assignments or decisions.

## Slide 1 — Recommend Butikkskyen, subject to validation and contract checks

- Approve Butikkskyen as preferred; do not authorise unconditional signing.
- Best current evidence on speed, cost and Dynamics 365 integration starting point [F6, F9, F12, F17].
- Year-1 baseline 1.55m against a 2.0m ceiling; 450,000 remains for other in-budget costs [F12, F17, F18].
- Decision is time-sensitive: Kodeverket's offer is valid until 15 December; checks must not be bypassed [F17].

## Slide 2 — What the shop must achieve

- Sell about 4,000 spare parts to dealers/workshops; required launch 1 September 2027 [F1].
- Quick reordering and part-number ordering; 70% of orders currently arrive by email and phone [F2, F5].
- Customer-specific prices, near-real-time prices/stock from Dynamics 365, and manageable support for a two-person integration team [F1, F3].
- Marketing wants shop content in the same tool as the website; customer service wants order-status self-service [F2, F14]. Confirm mandatory launch scope.

## Slide 3 — The shortlist is Butikkskyen versus Composa

- Four criteria: time to market, three-year cost, Dynamics 365 fit and marketing ease of use. Gunnar prioritises speed; weights are not agreed [F1, F2; Ana, 9 November].
- Butikkskyen: standard connector; one reference live in four months [F6, F9].
- Composa: custom integration estimated at 800,000 and four months before shop work; reference took nine months and integration ran late [F10, F11].
- Fram commerce module already dropped: support ends December 2028, about 16 months after planned launch [F1, F13; Ana, 16 November]. Do not present it as a live alternative. Neither remaining option has proven the marketing workflow.

## Slide 4 — The pricing-capacity concern has changed

- Northwind needs 3,100 customer-specific price lists [F15].
- Butikkskyen says B2B Pricing v4, released in October, supports up to 10,000 lists and removes Agder Maskin's need for workarounds [F16].
- The historical above-2,000 workaround warning is superseded for v4; do not treat it as a current limit [F9, F16].
- Remaining check: demonstrate real Northwind pricing, updates, latency and failure handling through Dynamics 365; vendor capacity evidence is not an end-to-end acceptance test.

## Slide 5 — Butikkskyen fits the reduced budget on the baseline only

| Option/case | Year 1 | Versus 2.0m ceiling | Three years |
|---|---:|---:|---:|
| Butikkskyen: 1.1m build + 450,000 annual licence | 1.55m | 450,000 below | 2.45m |
| Composa: integration additional to build | 3.5m | 1.5m above | 5.3m |
| Composa: integration included in build (unconfirmed best case) | 2.7m | 700,000 above | 4.5m |

- Kodeverket's fixed-price 1.1m replaces the approximate 900,000 build; management's 2.0m ceiling replaces 2.5m [F6, F17, F18].
- Calculations use one build and one/three full annual licence charges at unchanged rates [F7, F11, F12, F17].
- A's headroom has fallen from 1.15m to 450,000. Establish support, hosting, internal effort, contingency, tax and any excluded scope; unknown costs are not zero.
- Composa exceeds budget in both cases and is not a budget-compliant fallback. Confirm whether its integration estimate is additional [F7, F11].

## Slide 6 — Self-service targets a real service need, not a proven saving

- Hanne reports about 300 calls/week about order status and prices combined; she wants customers to see status themselves [F14].
- Potential benefit: fewer routine queries if customers can see accurate prices and useful status. No supported numerical savings forecast; split the baseline and measure handling time/adoption.
- Neither option has demonstrated Northwind order-status self-service. A prices/stock connector does not prove status coverage.
- With Hanne/Ola, define status source, freshness, access rights and visible orders; demonstrate the journey and confirm fixed-price scope inclusion.

## Slide 7 — Delivery looks more promising, but April is only illustrative

- Required date remains 1 September 2027 [F1].
- Butikkskyen's four-month reference suggests around April 2027 only if December contracting/start is immediate and that duration applies [F9]. Not a Northwind commitment or agreed earlier launch.
- Composa requires four months of integration before shop work; sequencing creates schedule risk [F11].
- Obtain a supplier plan with milestones, resource availability, acceptance/testing and support ownership. December steering date remains unknown.

## Slide 8 — Five checks before signing

- **Third-party dependency:** the B2B Pricing app is a third-party dependency (Ana, 23 November 2026).

1. **Pricing:** demonstrate v4 with Northwind's 3,100 lists and representative customer prices [F15, F16].
2. **Integration:** agree measurable near-real-time latency; prove prices/stock updates, failure handling and support responsibilities [F3, F6].
3. **Commercial scope:** written Kodeverket fixed-price scope/exclusions and acceptance terms; reconcile licence/app/connector, yearly cancellation rights and complete costs within 2.0m [F4, F6, F12, F17, F18].
4. **Marketing:** demonstrate workflow; if same-tool management cannot be met, Gunnar decides whether to relax it or reopen the choice [F2].
5. **Order status:** agree acceptance criteria with Hanne and prove the required customer journey, permissions and integration [F14].

Also require a September delivery commitment and demonstrations of reordering/part-number ordering [F1, F2, F5]. If a material check fails, return to steering rather than silently switching platforms.

## Slide 9 — Close the gaps before the offer expires

- **Proposed: Lise with Kodeverket/Butikkskyen** — complete offer scope, cancellation/acceptance terms and budget; confirm signing route by 15 December or obtain a written extension [F4, F17]. No post-expiry price or delivery slot assumed.
- **Proposed: Ola with vendors** — pricing/latency demonstrations, integration ownership and committed delivery plan; clarify Composa's estimate inclusion and sequencing [F3, F11, F15, F16].
- **Proposed: Hanne with Ola** — define and test order-status scope, refine call baseline and propose measurable service outcomes [F14].
- **Proposed: Ana/Gunnar** — review the recommendation and Ana's earlier Composa preference, resolve the marketing requirement, agree criteria weights and confirm the steering meeting date. These actions are not yet recorded as completed.

## Slide 10 — Decisions requested from the steering group

- Approve Butikkskyen as preferred, conditional on the documented checks and an acceptable September delivery plan; define who may sign once they pass.
- Confirm implementation must fit the revised 2.0m first-year ceiling; clarify included cost categories and later-year budget [F18]. The 450,000 headroom is not yet a costed contingency allowance.
- Decide whether same-tool content management is mandatory; agree order-status launch scope with Hanne. Confirm whether 1 September is fixed [F1, F2, F14].
- Confirm decision/signing timetable before 15 December or require an extension. Return for a new decision if validation fails or scope/cost changes materially; Composa is not currently a compliant fallback [F17].

## Sources

Finding ids refer to the full source list in the [research brief](research-brief.md).

- [F1] Kickoff notes, 28 October 2026.
- [F2] Gunnar Holm interview, 29 October 2026.
- [F3] Ola Nordmann interview, 29 October 2026.
- [F4] Lise Berg interview, 30 October 2026.
- [F5] Cara market note, 30 October 2026.
- [F6] Butikkskyen quote, 3 November 2026; licence corrected by F12, build updated by F17.
- [F7] Composa quote, 4 November 2026.
- [F9] Agder Maskin reference, 5 November 2026; workaround evidence superseded for v4 by F16.
- [F10] Vestlandsdeler reference, 6 November 2026.
- [F11] Ola Nordmann, 11 November 2026: Composa integration estimate and sequencing.
- [F12] Butikkskyen, 12 November 2026: one-store annual licence 450,000 NOK.
- [F13] Fram CMS, 12 November 2026: module support ends December 2028.
- [F14] Hanne Ruud, 17 November 2026: service calls and order-status self-service need.
- [F15] Ola Nordmann, 18 November 2026: 3,100 lists.
- [F16] Butikkskyen, 19 November 2026: v4 capacity and removal of workaround need.
- [F17] Lise Berg, 19 November 2026: Kodeverket fixed-price 1.1m offer, valid until 15 December.
- [F18] Gunnar Holm, 20 November 2026: management's 2.0m first-year ceiling.
- Ana, 9 November 2026: design flexibility removed, customer service assessment requested, provisional Composa preference; criteria weights not agreed.
- Ana, 16 November 2026: Gunnar agreed to drop Fram commerce module; indicative go-live requested.
- Ana, 23 November 2026: B2B Pricing app is a third-party dependency; requested addition on the risks slide only (placed on slide 8, the pre-signing checks slide).

