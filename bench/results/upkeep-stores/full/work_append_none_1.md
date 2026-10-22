===== Research brief: commerce platform for the spare parts shop =====
# Research brief: commerce platform for the spare parts shop

Living document, started 2026-11-02 by Ana Berg. Build it over several sessions; add new findings as [F6], [F7]… and never renumber.

## Question
Which commerce platform should Northwind use for its new spare parts shop? Gunnar Holm wants a recommendation for the steering group in December 2026.

## Northwind's goals
- Sell spare parts online to dealers and workshops. [F1]
- About 4,000 parts; live by 1 September 2027. [F1]
- Speed to market matters most to Gunnar. [F2]
- Marketing manages the shop's content in the same tool as the website. [F2]
- Workshops can reorder in a few clicks. [F2]

## Constraints
- Customer-specific prices. [F1]
- Microsoft Dynamics 365 is the ERP and holds prices and stock. [F1]
- Every option must read prices and stock from Dynamics 365 in near real time. [F3]
- Northwind's integration team is two people. [F3]
- Budget for the first year: 2.5 million NOK, licences and build included. [F1]
- Procurement wants a fixed price for the build, and licences that can be ended yearly. [F4]

## Criteria (agreed at the kickoff, [F1])
1. Time to market
2. Cost over three years
3. Fit with Dynamics 365
4. Ease of use for marketing
5. Design flexibility

Not yet agreed: weights or scoring scale. Gunnar's interview suggests time to market ranks highest [F2]; to confirm with him before we use it.

## Options
- **A. Butikkskyen**: a SaaS shop platform.
- **B. Composa**: a headless commerce engine with its own frontend.
- **C. Commerce module of Fram CMS**: the CMS that runs Northwind's new website.

## What we know so far
| Ref | Source | Date | Finding |
|---|---|---|---|
| F1 | Kickoff notes (Ana) | 2026-10-28 | About 4,000 parts, live 1 Sept 2027. Dealers and workshops. Customer-specific prices. Dynamics 365 holds prices and stock. First-year budget 2.5M NOK incl. licences and build. Five criteria agreed. |
| F2 | Interview, Gunnar Holm | 2026-10-29 | Speed to market matters most. Marketing manages shop content in the same tool as the website. Workshops want to reorder in a few clicks. |
| F3 | Interview, Ola Nordmann (integration architect) | 2026-10-29 | All options must read prices and stock from Dynamics 365 in near real time. Integration team is two people. |
| F4 | Interview, Lise Berg (procurement) | 2026-10-30 | Fixed price for the build. Licences that can be ended yearly. |
| F5 | Market note, Cara | 2026-10-30 | Dealers mostly order by part number. 70% of orders come by email and phone today. |

No findings yet about the options themselves. Everything above is about Northwind's needs.

## Implications to test (our reading, not yet confirmed)
- Quick order by part number and one-click reorder look like must-have shop features. [F2, F5]
- A two-person integration team favours options with a ready Dynamics 365 connector over custom integration. [F3]
- "Same tool as the website" favours C; to check whether A or B can meet it through integration. [F2]
- Fixed-price build and yearly-cancellable licences may be hard for B (custom build); to check with vendors. [F4]

## Open questions
1. Weights for the five criteria: who confirms (Gunnar? steering group)?
2. Does each option have a ready Dynamics 365 connector? Can it handle customer-specific prices in near real time? [F1, F3]
3. Can each option meet the 1 Sept 2027 date? What is the realistic build time?
4. Cost over three years for each option: licences, build, integration, running costs. Does it fit the 2.5M NOK first-year budget?
5. Will vendors give a fixed price for the build, and yearly-cancellable licences? [F4]
6. Does Fram CMS's commerce module handle 4,000 parts and customer-specific prices? Is it proven for B2B?
7. Can marketing manage shop content in the website's tool under A and B? [F2]
8. What does "near real time" mean in numbers (seconds, minutes)? Ask Ola. [F3]
9. How does the shop link to the website launch on 1 March 2027 and to the website's hosting on Azure?
10. What share of the 70% email/phone orders should move online, and does that change the requirements? [F5]

## Working notes
- Northwind prices must only be sent through their procurement portal, never by email. Keep this in mind when sharing cost figures.
- Steering group meeting 11 November is the next one; the recommendation is due in December.

[F6] Butikkskyen quoted an annual licence of 600,000 NOK on 3 November 2026.

[F6] Butikkskyen's 3 November 2026 quote estimates a partner build at about 900,000 NOK.

[F6] Butikkskyen's 3 November 2026 quote includes a standard Dynamics 365 connector.

[F6] Butikkskyen's 3 November 2026 quote says customer-specific pricing requires the B2B Pricing app, included in the licence.

[F7] Composa quoted an annual licence of 900,000 NOK on 4 November 2026.

[F7] Composa's 4 November 2026 quote estimates the build at about 1,800,000 NOK, including the frontend.

[F7] Composa's 4 November 2026 quote says there is no standard Dynamics 365 connector; integration uses Composa's API.

[F8] Fram CMS quoted its commerce module at 300,000 NOK annually on 4 November 2026.

[F8] Fram CMS's 4 November 2026 estimate puts the commerce build at about 1,200,000 NOK.

[F8] Fram CMS stated on 4 November 2026 that marketing keeps working in Fram with its commerce module.

[F9] Agder Maskin reported in the 5 November 2026 reference call that its Butikkskyen shop went live in four months. This is a reference outcome, not a Northwind delivery commitment.

[F9] Agder Maskin reported on 5 November 2026 that Butikkskyen customer-specific prices worked through B2B Pricing, but needed workarounds above 2,000 price lists. Northwind's price-list count is not established; its roughly 4,000 parts are a different measure.

[F10] Vestlandsdeler reported in the 6 November 2026 reference call that its Composa implementation launched after nine months and integration took longer than planned. This is a reference outcome, not a Northwind schedule.

[F10] Vestlandsdeler described Composa as very flexible in its reference call on 6 November 2026; no like-for-like design test against the other options is available.

## Platform comparison — 9 November 2026

Addendum to Ana's original brief (item:c0ade1a1-4c6f-4721-a57e-22c995729e92). F1–F5 retain their original numbering; new evidence is F6–F10. The original statement that no option findings exist is superseded by these additions, not an edit to Ana's text. Assessments below are analytical inferences, not vendor commitments. No weights or numerical scores are applied: neither has been agreed [F1, F2].

| Agreed criterion [F1] | A — Butikkskyen | B — Composa | C — Fram CMS commerce |
|---|---|---|---|
| Time to market | Strongest positive delivery evidence so far: reference went live in four months [F9]. Included standard Dynamics 365 connector may reduce integration effort [F6, F3]. Neither establishes a Northwind delivery date. | Higher schedule risk: reference launched after nine months and integration overran [F10]; no standard Dynamics 365 connector [F7]. Not proof it cannot meet 1 Sept 2027, but little room for delay if Northwind follows a similar duration. | No build-duration or reference evidence supplied [F8]. Keeping marketing in Fram does not establish delivery speed. |
| Cost over three years | About **2.7M NOK**: 0.9M build + 3 × 0.6M licence [F6]. Year one about **1.5M**, leaving 1.0M against the 2.5M budget before unpriced costs [F1]. | About **4.5M NOK**: 1.8M build + 3 × 0.9M licence [F7]. Year one about **2.7M**, already 0.2M above budget before unpriced costs [F1]. Frontend is included in the build quote. | About **2.1M NOK**: 1.2M build + 3 × 0.3M commerce module [F8]. Year one about **1.5M**, leaving 1.0M before unpriced costs [F1]. Lowest quoted subtotal; not yet lowest proven total cost. |
| Fit with Dynamics 365 | Best-supported starting point: included standard connector; included B2B Pricing app supports customer-specific prices [F6, F9]. Reference needed workarounds above 2,000 price lists [F9]. Near-real-time price/stock behaviour remains unproven [F3]. | API integration, not a standard connector [F7]. More integration responsibility is a risk for a two-person team [F3], reinforced by the reference overrun [F10]. Near-real-time prices/stock and customer-specific pricing remain unverified. | Connector availability, near-real-time price/stock reads and customer-specific pricing remain unknown [F1, F3, F8]. |
| Ease of use for marketing | Same-tool content workflow with Fram not established [F2, F6]. No usability evidence yet. | Same-tool content workflow with Fram not established [F2, F7]. Included frontend is not evidence of easy marketing authoring. | Strongest evidence for the same-tool requirement: marketing keeps working in Fram [F2, F8]. Actual commerce authoring usability still needs validation. |
| Design flexibility | Not established by F6 or F9; no comparative design test. | Positive reference evidence: described as very flexible [F10]. Headless architecture in the brief is supporting context, not proof of specific design capabilities. | Not established by F8; CMS continuity alone does not prove commerce design flexibility. |

### Cost basis and limits
These are licence-plus-build subtotals, not complete three-year TCO. Assumptions: one build, three full annual licence charges at quoted rates, no price escalation. Build amounts are approximate, not confirmed fixed prices. Integration inclusion, hosting, support, maintenance, upgrades, migration and internal effort are not fully established; do not assume they are covered. For Fram, the quote covers the commerce module: clarify any additional CMS/frontend charges and treatment of existing website costs. Tax treatment and annual licence cancellation rights are unconfirmed [F4, F6–F8].

### Provisional interpretation — not a selection
- **Butikkskyen is the strongest candidate to validate first for delivery and integration risk**, based on its connector and four-month reference [F6, F9]. This does not apply an unconfirmed time-to-market weighting. Validate Northwind's actual number and complexity of price lists: approximately 4,000 parts [F1] must not be confused with the reference's 2,000-price-list workaround threshold [F9].
- **Fram is the strongest same-tool marketing fit and has the lowest quoted cost subtotal** [F2, F8], but major ERP, B2B and schedule evidence gaps prevent a confident overall recommendation.
- **Composa has positive flexibility evidence but a budget exception and greater evidenced integration/schedule risk** [F1, F3, F7, F10]. No final weighted ranking is justified.

### Evidence gaps before a decision
Confirm weights with Gunnar/steering group before scoring [F1, F2]. Obtain comparable Northwind delivery plans for 1 September 2027 and complete, fixed-price build scopes with yearly-cancellable licence terms [F1, F4]. Validate near-real-time Dynamics 365 prices/stock against a numerical latency target, customer-specific price-list scale and the two-person team's support capacity [F1, F3, F9]. Test Fram's B2B/catalogue fit; demonstrate quick part-number ordering/reordering and marketing workflows across all three; obtain comparable design evidence [F1, F2, F5].

### Source register
- F1–F5: original brief and evidence in item:c0ade1a1-4c6f-4721-a57e-22c995729e92. F1 kickoff, 28 Oct (source:4da9227f-f9cd-48a2-abc0-3fb4ce8e6770); F2 Gunnar interview, 29 Oct; F3 Ola interview, 29 Oct (source:8d77dae0-6874-4772-b570-eb80c54eac07); F4 procurement interview, 30 Oct; F5 market note, 30 Oct.
- F6: Butikkskyen quote, 3 Nov 2026, supplied excerpt retained with item:d538f839-d852-4223-9d2b-bc95660448be; build item:8cedeec0-3366-4ea3-bcc4-01f504fcd950; connector item:6bf073b7-ed45-4d2a-b45a-d50915f633f8; app item:747b2025-4745-4e88-aff9-667a3ea5a3a6.
- F7: Composa quote, 4 Nov 2026, supplied excerpt retained with item:c7de5d27-b9e3-40e4-aea9-02b208dde7f1; build item:6918167d-d188-435e-a881-a8c486b33f8b; API integration item:4dd0057f-9422-4795-bca0-790fe2ad33a9.
- F8: Fram CMS quote, 4 Nov 2026, supplied excerpt retained with item:44eb581f-1ddc-445c-87c5-4198126eeb2e; build item:39e6ed15-5bfc-4f97-9e2a-42abe3dbccfd; marketing item:50b6bfbb-ece4-41a5-812b-9142beca1bb6.
- F9: Agder Maskin reference call, 5 Nov 2026, supplied excerpt retained with item:29499a89-9745-45c6-963a-86403b22f574; price-list caveat item:6123c6b8-8d49-44e7-b620-cb0dc153f2d2.
- F10: Vestlandsdeler reference call, 6 Nov 2026, supplied excerpt retained with item:06fdd9ce-492f-4dd3-b810-f52be1126a64; flexibility item:838a5ef3-5316-41cd-897f-832774b4d8b7.

Quotes and reference outcomes are reported evidence; cost calculations and comparative judgements above are analysis. Reference delivery times are not Northwind commitments.

[F11] Criteria revision — Gunnar call, 9 November 2026, reported by Ana: remove design flexibility because Gunnar says it does not matter for Northwind. The current criteria are time to market, cost over three years, fit with Dynamics 365, and ease of use for marketing. This supersedes the five-criterion list in the original brief (item:c0ade1a1-4c6f-4721-a57e-22c995729e92) and the design-flexibility row and design-evidence follow-up in the comparison (item:3fcfe021-624c-496d-9774-ab0ffd022936); historical evidence F10 remains intact. Weights and scoring scale remain unagreed.

[F12] Gunnar requested a short section on what each platform option means for Northwind's customer service team, according to Ana's report of their 9 November 2026 call. This is a requested analysis section, not an agreed additional scoring criterion.

As of 9 November 2026, Ana is provisionally leaning towards Composa but is worried about its integration. This is a private tentative preference, not a platform selection or evidence that Composa meets the criteria.

As reported by Ana on 9 November 2026, Ola will check Composa's integration during the week of 9 November 2026. The check is pending; no outcome has been reported.

[F13] Ola Nordmann (integration architect) said on 11 November 2026 that Composa needs a custom integration with Dynamics 365. His estimate is 800,000 NOK and four months, before the shop work can start. This is Northwind's own estimate, not a Composa quote. It is not yet clear whether the 800,000 NOK is on top of Composa's ~1.8M NOK build quote [F7], or whether the four months count towards the nine-month reference duration [F10].

[F14] Correction from Butikkskyen, 12 November 2026: the 600,000 NOK annual licence in the 3 November quote was for two stores. For one store the licence is 450,000 NOK a year. This corrects the licence figure in [F6] (item:d538f839-d852-4223-9d2b-bc95660448be); the original F6 item is kept unchanged as history. The ~900,000 NOK partner build, the included Dynamics 365 connector and the included B2B Pricing app are not mentioned in the correction. Whether the build estimate assumed one or two stores is not stated.

[F15] Fram CMS stated on 12 November 2026 that support for its commerce module ends in December 2028, and that Fram recommends customers move to a partner platform. Which partner platforms Fram means is not stated. Shop go-live is planned for 1 September 2027, so the module would have about 15 months of supported life after launch.

## Update — 16 November 2026 (adds F13–F15; supersedes figures in the 9 November comparison where stated)
Numbering: F11 and F12 were already used on 9 November (criteria revision; customer-service section request). The 11–12 November findings are therefore F13–F15. Criteria now follow F11: time to market, cost over three years, fit with Dynamics 365, ease of use for marketing. Weights and scoring scale are still unagreed.

### What each option means for Northwind's customer service team (requested by Gunnar, [F12])
No evidence yet from vendors or references on service tooling, so this is our inference only. Context: 70% of orders arrive by email and phone today, and dealers mostly order by part number [F5]. The effect on customer service depends on how many of those orders move online, which is still open.
- **A — Butikkskyen:** likely the same self-service load shift as any shop. Standard connector and customer-specific prices could mean fewer price/stock enquiries, but price-list workarounds above 2,000 lists [F9] could cause pricing questions if they go wrong. Order-history, reorder and support tooling are not established.
- **B — Composa:** the custom integration [F13] and an integration overrun in the reference [F10] raise the risk of price/stock mismatches at launch and after. A two-person integration team [F3] would also carry support. Frontend and customer-account features are not established.
- **C — Fram commerce:** no evidence about order handling or customer accounts [F8]. Support ending Dec 2028 [F15] means a forced migration soon after launch, which could disrupt customers and service staff.
To validate: ask each vendor how dealers see order status and history, and who handles failed price/stock syncs. Ask customer service how they handle phone/email orders today.

### Revised cost subtotals (licence + build, three years; not full TCO)
| | Build | Licence/yr | Year one | Three years | Change |
|---|---|---|---|---|---|
| A — Butikkskyen | ~0.9M | 0.45M (one store) [F14] | ~1.35M (1.15M under the 2.5M budget) | ~2.25M | down from 2.7M [F6→F14] |
| B — Composa | ~1.8M [F7] + ~0.8M integration [F13] if additional | 0.9M [F7] | ~3.5M (1.0M over budget) | ~5.3M | up from 4.5M, if the 0.8M is additional |
| C — Fram | ~1.2M [F8] | 0.3M [F8] | ~1.5M | ~2.1M on paper | unchanged, but support ends Dec 2028 [F15] |
Assumes the one-store licence applies to Northwind and the Butikkskyen build quote is unchanged. Fram's three-year figure covers a period running about 20 months past end of support, so it is not a like-for-like total: any migration cost is unpriced.

### Time to market
- **B:** four months of integration before shop work starts [F13], on top of a nine-month reference [F10] that already had an integration overrun. Against 1 September 2027 this leaves little or no room. Inference: even a start in January 2027 would put the integration end around May 2027, before the shop build. Dates need a real plan from Composa.
- **A:** four-month reference [F9] stands; still not a Northwind commitment.
- **C:** no delivery evidence [F8].

### Effect on the provisional interpretation
- Butikkskyen: stronger on cost and still strongest on delivery and integration evidence. Validate price-list scale and whether the one-store assumption holds.
- Composa: weaker on cost, schedule and integration risk. This bears on the earlier note that Ana was provisionally leaning towards Composa (item:8e37b8de-acf2-4c59-87db-735f73594d5f). Composa's one positive was design flexibility, which Gunnar has dropped as a criterion [F11].
- Fram: its main advantage, same-tool marketing and the lowest subtotal, is weakened by end of support in Dec 2028 [F15]. Ask Fram which partner platforms it recommends, and whether migration help or pricing is offered.
Still not a selection: no weights are agreed.

Sources: F13 item:90d519c7-336a-401c-b751-9e071863e8c7; F14 item:ae866526-38a4-4a7c-8860-30363777aae5; F15 item:616e6ff7-b716-4780-bb95-e579f70e2f9b. Figures are analysis, not vendor commitments.

## Option B (Composa) revisited, updated comparison and DRAFT recommendation — 16 November 2026
Supersedes the 9 November comparison table and the 16 November cost table where they differ. Four criteria apply [F11]. No weights are agreed, so nothing here is a scored ranking. Figures are licence + build subtotals, not full TCO.

### Option B in light of Ola's estimate [F13]
- **Cost:** if the 0.8M integration is on top of the ~1.8M build [F7], three years is ~5.3M NOK and year one ~3.5M, 1.0M over the 2.5M budget [F1]. Even if it were inside the build quote, B would still be ~4.5M and 0.2M over. Whether it is included is unconfirmed.
- **Time to market:** the integration takes four months before shop work starts [F13]. The reference needed nine months, with an integration overrun [F10]. Inference: nine months from a January 2027 start is already October 2027, after 1 September 2027, before any overrun. Composa would need a firm plan showing otherwise.
- **Fit with Dynamics 365:** no standard connector [F7]. A custom build by a two-person integration team [F3] would also have to be run and supported afterwards. Near-real-time prices/stock and customer-specific pricing are unverified.
- **Procurement:** a custom integration makes a fixed build price and yearly-cancellable licence [F4] harder to get. Unconfirmed with Composa.
- **Marketing:** same-tool workflow with Fram not established [F2, F7].
- **Design flexibility:** B's one clear strength [F10], now not a criterion [F11].
- **Net:** B is behind A on cost, schedule and integration risk, and has no evidenced advantage on the four current criteria. Reopening it would need a Composa-quoted integration at fixed price, a plan meeting 1 September 2027, and a second reference [task:15b9a65d-4601-41af-8e44-3bf475e2aa28]. This also weakens the earlier provisional lean towards B (item:8e37b8de-acf2-4c59-87db-735f73594d5f).

### Updated comparison (four criteria)
| Criterion | A — Butikkskyen | B — Composa | C — Fram commerce |
|---|---|---|---|
| Time to market | Four-month reference [F9]; standard connector [F6]. Not a Northwind date. | Four months integration [F13] plus nine-month reference with overrun [F10]; 1 Sept 2027 at risk. | No evidence [F8]; support ends Dec 2028 [F15]. |
| Cost over three years | ~2.25M; year one ~1.35M, within budget [F6, F14]. | ~5.3M if integration is extra; year one ~3.5M, over budget [F7, F13]. | ~2.1M on paper; migration before 2030 unpriced [F8, F15]. |
| Fit with Dynamics 365 | Standard connector; B2B Pricing app; workarounds above 2,000 price lists [F6, F9]; near-real-time unproven. | Custom integration [F13]; unverified. | Unknown [F8]. |
| Ease of use for marketing | Same-tool workflow not established. | Same-tool workflow not established. | Strongest same-tool evidence [F2, F8]; commerce authoring untested. |

### DRAFT recommendation to the steering group (not final: weights unconfirmed; vendor terms unvalidated)
**Customer service (requested by Gunnar [F12]):** no vendor evidence yet; inference only. 70% of orders arrive by email and phone today [F5], so the impact depends on how many move online. A and C have lower risk of price/stock mismatches reaching customers than B, which carries a custom integration [F13]. C would force a platform migration soon after launch [F15]. Validate order-status and history views and who handles failed price/stock syncs.

**Recommendation:** proceed with **Butikkskyen (A)** as the preferred platform, subject to the conditions below. Rest of the case:
1. **Cost:** lowest three-year subtotal among options that remain supported (~2.25M NOK), and year one (~1.35M) fits the 2.5M budget [F6, F14].
2. **Speed to market**, which Gunnar ranks highest [F2]: only option with a reference delivery (four months) and a standard Dynamics 365 connector [F9, F6]. Leaves margin to 1 September 2027 if work starts in early 2027.
3. **Composa (B)** is not recommended: it is over budget, adds ~4 months of custom integration [F13] and has a nine-month reference [F10]. Its main strength, design flexibility [F10], is no longer a criterion [F11].
4. **Fram (C)** is not recommended as the shop platform: support for its commerce module ends December 2028, about 15 months after launch, and Fram itself recommends moving to a partner platform [F15]. Its same-tool marketing advantage [F2, F8] remains real and should be tested on A.
**Robustness:** A leads or is level on time, cost and ERP fit under any weighting; only a heavy weighting on same-tool marketing favours C, and [F15] undermines that.

**Conditions before approval:**
- Butikkskyen confirms the one-store licence applies and states the build scope as a fixed price; licence cancellable yearly [F4, F14].
- Northwind's customer price-list count is checked against the 2,000-list workaround threshold [F9].
- Near-real-time price/stock latency target agreed with Ola and demonstrated [F3].
- Demonstrate part-number quick order, one-click reorder and marketing editing alongside Fram [F2, F5].
- Gunnar/steering group confirm the criteria weights.
Handling: this draft contains Northwind prices. Share it only through the procurement portal, never by email.

Sources: F6–F15 in this brief; see item:841be41c-cf14-4d0b-b66f-fa28941f3b77 for cost and timing detail.

[Decision] 16 November 2026: Gunnar Holm agreed to drop Fram CMS's commerce module (option C) because its support ends in December 2028 [F15]. This is decided, as reported by Ana. Remaining options: A — Butikkskyen and B — Composa. This supersedes the Fram (C) rows and wording in the earlier comparison and recommendation drafts (item:d662b89f-b948-4a68-9d9e-4420faaac630, item:841be41c-cf14-4d0b-b66f-fa28941f3b77). Fram's same-tool marketing strength [F2, F8] still has to be tested on the remaining option(s), since marketing keeps the website in Fram CMS.

Add to the DRAFT recommendation (item:d662b89f-b948-4a68-9d9e-4420faaac630), under "Speed to market": **Earliest go-live for Butikkskyen: April 2027.** This counts four months from a decision in December 2026, the build time its reference reported [F9]. That is about four months before the 1 September 2027 deadline [F1]. It is a planning estimate, not a Butikkskyen commitment. It assumes the build starts straight after the decision, with no time for contract and procurement steps, and Northwind's price-list count and integration needs may lengthen it [F9]. It would also follow the website launch on 1 March 2027. Ask Butikkskyen for a dated delivery plan.

[F16; supplied as F14] Hanne Ruud, head of customer service, reported on 17 November 2026 that customer service receives about 300 calls a week about order status and prices. The split between the two topics and handling time are not established.

[F16; supplied as F14] Hanne Ruud reported on 17 November 2026 that customer service wants customers to be able to see order status themselves.

[F17; supplied as F15] Ola Nordmann reported on 18 November 2026 that Northwind has 3,100 customer-specific price lists. This establishes the count left open in earlier comparisons; it is distinct from the approximately 4,000 parts.

[F18; supplied as F16] Butikkskyen stated on 19 November 2026 that version 4 of B2B Pricing, released in October 2026, handles up to 10,000 price lists and makes the workarounds in the earlier reference unnecessary. This updates the applicability of the historical 2,000-list caveat [F9], not the historical report itself. It is a vendor claim, not a Northwind-scale performance demonstration.

[F19; supplied as F17] Lise Berg reported on 19 November 2026 that Butikkskyen partner Kodeverket offers the build at a fixed price of NOK 1.1 million. Use this offer rather than the earlier approximately NOK 0.9 million build estimate in the current comparison. Scope, exclusions and integration coverage still require verification.

[F19; supplied as F17] The Kodeverket fixed-price build offer reported by Lise Berg on 19 November 2026 is valid until 15 December 2026.

[F20; supplied as F18] Gunnar Holm reported on 20 November 2026 that management has reduced the first-year budget to NOK 2.0 million. This supersedes the NOK 2.5 million budget in F1 and the budget headroom figures in earlier analyses; the existing first-year licence-and-build basis is retained unless clarified.

## Updated comparison and conditional recommendation — 23 November 2026
Adds F16–F20. Mapping from supplied labels: new F14→F16 (customer service); F15→F17 (3,100 lists); F16→F18 (B2B Pricing v4); F17→F19 (Kodeverket offer); F18→F20 (budget). Existing F1–F15 remain unchanged. Supersedes earlier costs, budget headroom and the applicability of the old price-list workaround warning where stated. This is analysis, not a procurement decision.

### Customer service
About 300 calls/week concern order status and prices [F16]; no split, handling-time baseline or achievable reduction is known. Customer self-service order status is an explicit need, not demonstrated vendor functionality.
- A — Butikkskyen: v4's claimed capacity removes the old price-list workaround concern on paper for Northwind's 3,100 lists [F17–F18]. This could help price accuracy, but does not establish order-status visibility, actual sync latency or call reduction. Demonstrate customer-specific prices and order status using Northwind data, and define failed-sync support ownership.
- B — Composa: order-status self-service and customer-price accuracy remain unproven. Custom integration [F13] creates delivery and support risks for the two-person team, not proof of a particular failure rate.
- C — Fram commerce was dropped by Gunnar on 16 November (item:b3b13af5-3a3f-4839-8ed2-4c4ee7eada82); not an active option. Website content remains in Fram.

### Four-criterion comparison (no agreed weights or scores)
| Criterion | A — Butikkskyen | B — Composa |
|---|---|---|
| Time to market | Four-month reference [F9], not a Northwind commitment. Require Kodeverket plan to 1 September 2027. Offer valid until 15 December 2026 [F19]. | Four months integration before shop work [F13]; nine-month reference with overrun [F10]. Significant risk against September 2027; do not simply add reference and estimate as a proven duration. |
| Cost over three years | NOK 2.45M subtotal = 1.1M fixed build [F19] + 3 × 0.45M one-store licence [F14]. Year one 1.55M, leaving 0.45M against revised 2.0M budget [F20]. | NOK 5.3M if 0.8M integration is additional to 1.8M build; year one 3.5M, 1.5M over budget. If integration is included, three years 4.5M and year one 2.7M, still 0.7M over [F7, F13]. |
| Dynamics 365 fit | Included standard connector [F6]; vendor claims v4 supports 10,000 price lists without earlier workarounds [F18], versus Northwind's 3,100 [F17]. Capacity concern reduced, but near-real-time operation and complex price behaviour need testing. | Custom integration; near-real-time prices/stock and pricing scale unverified [F7, F13]. |
| Marketing usability | Same-tool workflow alongside Fram remains unproven. | Same-tool workflow alongside Fram remains unproven. |

Costs are licence-plus-build subtotals, not full TCO; assume one-store licence applies, three annual charges at unchanged rates, and new build replaces old estimate. Confirm scope, tax basis, integration coverage, hosting, support, internal effort and annual cancellation. A's subtotal rises 0.2M from the previous 2.25M; its first-year headroom falls from 1.15M to 0.45M because build increases 0.2M and budget falls 0.5M.

### Conditional recommendation
Continue with A — Butikkskyen as preferred, not yet approved. Fixed-price offer now addresses the pricing form procurement requested, and v4's claim addresses the historical capacity concern; neither proves scope completeness or live performance. B remains over the new budget even on its favourable cost interpretation. C stays excluded. No claim of dominance under every weighting is justified: weights and marketing evidence remain open.

Before commitment: confirm Kodeverket scope and dated delivery plan; demonstrate v4 with 3,100 lists, agreed price/stock latency and customer order status; validate quick order/reorder and marketing workflow; confirm one-store licence and yearly cancellation; complete costs against remaining NOK 0.45M; agree criteria weights. Review the offer before 15 December or seek an extension. Do not assume the December steering-group date is before expiry.

Evidence: customer-service baseline item:0da487cf-7e92-4406-811b-463486efb1de and need item:77bda0ca-6b69-4938-b27a-d7283b2c173b; count item:0718e79c-f562-4213-a0c8-193eb6b46f31; v4 claim item:a0ba729e-457e-4638-a1bf-f8e403a98ee9; build item:c6bfeddb-f61c-4576-a553-d04f929eeb29; expiry item:bd6dbfdb-648b-41cd-b29e-3d55e491e392; budget item:3ffe8634-d82f-46d7-b5a3-49c400781ab5; licence item:ae866526-38a4-4a7c-8860-30363777aae5; prior comparison item:d662b89f-b948-4a68-9d9e-4420faaac630. Northwind pricing must be shared only through the procurement portal, never email.

## Steering-group recommendation and presentation outline — 23 November 2026 (draft)
Based on F1–F20 and updated analysis item:48d196a3-4004-42a6-b89c-2a89673f1941. Supersedes the 16 November recommendation where inconsistent; not an approved platform selection.

### Customer service
A — Butikkskyen: potential to reduce price and status enquiries, but customer-visible order status and accurate live prices must be demonstrated. B — Composa: same intended benefit, with greater custom-integration delivery and support risk. C — Fram commerce: excluded by Gunnar on 16 November; website remains in Fram. Baseline is about 300 status/price calls per week; no quantified savings claim is justified.

### Updated recommendation
Recommend Butikkskyen as preferred platform, with Kodeverket as proposed build partner, subject to technical, commercial and delivery validation before commitment. NOK 1.1M fixed build + NOK 0.45M one-store annual licence = NOK 1.55M first year and NOK 2.45M over three years. NOK 0.45M remains against the reduced NOK 2.0M first-year budget before unpriced costs. Confirm one-store applicability and scope. Vendor-claimed v4 capacity of 10,000 lists exceeds Northwind's 3,100, so the historical workaround concern is no longer a current v4 limitation on the vendor's evidence, but practical performance remains unverified. Composa is not recommended: NOK 2.7–3.5M year one depending on integration inclusion, plus greater schedule/integration risk. Fram commerce remains excluded because support ends December 2028. No weighted score or guaranteed launch is asserted.

### Presentation outline — 10 slides
1. **Decision requested: Butikkskyen as preferred platform.** Conditional endorsement, not unconditional contract approval; proposed build partner Kodeverket; launch target 1 September 2027.
2. **Customer service: turn enquiries into self-service.** About 300 calls/week about status and prices; customers need order-status access; A and B must demonstrate this; do not treat baseline as avoidable calls or savings. Establish topic split, handling time and adoption measures.
3. **Decision framework and remaining options.** Four criteria: time to market, three-year cost, Dynamics 365 fit, marketing usability. No agreed weights/scores; design flexibility removed. A and B remain; C already excluded, website CMS unchanged.
4. **New evidence changes the case for A.** 3,100 lists versus vendor-claimed 10,000 capacity in v4; historical workarounds no longer necessary per vendor. Kodeverket fixed build NOK 1.1M, valid until 15 December 2026. First-year budget now NOK 2.0M. Claims and scope still to validate.
5. **Economics: A fits the subtotal, but margin is limited.** A year one NOK 1.55M, three years NOK 2.45M, headroom NOK 0.45M. B year one NOK 3.5M and three years NOK 5.3M if integration additional; NOK 2.7M and 4.5M if included. B exceeds budget by NOK 0.7–1.5M. These are licence/build subtotals, not TCO; confirm operating/support costs, internal effort, tax and scope.
6. **Delivery: evidence favours A, not a committed launch date.** A has a four-month reference, anonymised; B has four months of integration before shop work and a nine-month reference with overrun, not additive proven durations. Obtain dated Kodeverket plan, procurement/resource dependencies and testing/cutover milestones. Website launch 1 March 2027 is distinct from shop target 1 September 2027.
7. **Dynamics 365: prove pricing, stock and order status end to end.** A included standard connector versus B custom integration; two-person Northwind team. Test 3,100 price lists, agree numerical price/stock latency target, validate order-status flow and failed-sync ownership; establish what is within fixed scope.
8. **Marketing and dealer experience remain acceptance tests.** Demonstrate editing alongside Fram CMS, part-number quick order, reorder and customer accounts. Same-tool marketing workflow remains unproven for both options. Validate with marketing and customer service before commitment.
9. **Conditions before contract commitment.** Written scope/exclusions, dated delivery plan, Northwind-scale demonstration, complete cost within NOK 2.0M, applicable licence with yearly cancellation, agreed support ownership. Confirm criterion priorities/weights; stop and return to steering group if material conditions fail.
10. **Resolution and immediate next steps.** Proposed: endorse A conditionally, permit final validation/negotiation, retain NOK 2.0M cap and require evidence before commitment. Proposed validation leads, not assigned owners: Ola for ERP, Hanne for service, Lise for terms, Gunnar for priorities and marketing coordination. Review offer before 15 December or seek extension; steering-group meeting date not yet confirmed relative to expiry. No contract acceptance is implied.

Evidence references: latest synthesis item:48d196a3-4004-42a6-b89c-2a89673f1941; exclusion decision item:b3b13af5-3a3f-4839-8ed2-4c4ee7eada82. All reference customers anonymised in client-facing content. Distribution: contains Northwind prices; procurement portal only, never email. Saved privately, not shared.

## Presentation amendment — slide 9 only
Amends the steering-group presentation outline in item:ef9298b8-70b7-4904-93e0-4594f91dd255. Add the following bullet to slide 9, **Conditions before contract commitment**:

- **Third-party dependency:** the B2B Pricing app is a dependency for customer-specific pricing.

All existing slide 9 content, slides 1–8 and 10, and the recommendation remain unchanged. This is a user-confirmed presentation edit, not a new scoring criterion or a change to guidance.

## Option B (Composa): nightly price import instead of custom integration — 30 November 2026
Adds [F21] (supplied as "F19", which is already the Kodeverket offer; numbered F21 so existing references stay unchanged). Question from Gunnar: would Composa work with a nightly import of prices and stock instead of the custom integration?

**[F21] Ola Nordmann, 27 November 2026:** a nightly import of prices and stock would cost about NOK 200,000 instead of NOK 800,000, but prices in the shop could be up to a day old.

**Analysis (our reading, not vendor-confirmed):**
- **Cost:** if the integration is additional to the ~1.8M build [F7], B falls from 3.5M to about 2.9M in year one and from 5.3M to about 4.7M over three years. That is still about NOK 0.9M over the NOK 2.0M first-year budget [F20], and well above A (1.55M year one, 2.45M three years). If integration is already inside the build quote, the saving is unclear; unconfirmed.
- **Requirement conflict:** it does not meet the agreed constraint that every option reads prices and stock from Dynamics 365 in near real time [F3]. Using it would need Gunnar or the steering group to relax that constraint. Ola's view on acceptable staleness is not recorded.
- **Customer impact:** prices (including customer-specific prices) and stock up to a day old could cause mismatches at order time, and may add to the ~300 weekly price/status calls [F16]. Not quantified.
- **Time to market:** whether the cheaper import shortens the four-month integration estimate [F13] is not stated; do not assume it does.
- **Net:** the nightly option narrows B's cost gap but does not bring B within budget, and it trades away near-real-time. It does not change the recommendation of A. A's standard connector is not affected by this question.

Handling: contains Northwind prices; procurement portal only, never email.
