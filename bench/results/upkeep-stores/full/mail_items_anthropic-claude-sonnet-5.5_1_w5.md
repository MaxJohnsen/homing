# Fram CMS content migration (project)
- As of 26 Aug 2026 Cara has admin access to Fram; the export API works, just slowly. (m011, 2026-08-26)
- Gunnar Holm (3 Sep 2026) wants a pilot first: migrate the product pages to staging in October, before moving everything. If the pilot goes well, the rest follows. (Does not by itself settle the open question of paying for the Enterprise plan vs. a delay.) (m034, 2026-09-03)
- Gunnar Holm (8 Sep 2026) declined paying 20,000 NOK/month for the Enterprise plan for a temporary need; wants to see what Lars Moe (Fram) can do about the limit, then decide at the steering group on 14 Sep 2026. (m045, 2026-09-08)
- Content workshop with Northwind on 10 Sep 2026: about 40% of the old pages are dropped, so fewer than the ~1,200 pages will move. Northwind writes the new product texts, deadline 1 December 2026. (Reported by Cara Lund.) (m054, 2026-09-10)
- Scope: about 1,200 pages move from the old Fram CMS. Order: product pages first, news last. Owner: Jonas Vik (from 14 Sep 2026; previously Cara Lund). (m002, 2026-08-24; m005, 2026-08-25; m064, 2026-09-14)
- Jonas Vik reported on 17 Sep 2026 that he has read Cara's migration plan and started on the product pages. (m073, 2026-09-17)
- Risk: Fram's API allows only 10 requests/s (Standard plan), so the export of the ~1,200 pages would take about three weeks longer than planned. The Enterprise plan (50 requests/s, 20,000 NOK/month) was rejected by the steering group on 14 Sep 2026. Solution: a one-time bulk export on Fram's side for 15,000 NOK, accepted by Gunnar Holm on 21 Sep 2026 and booked for 11–15 January 2027. This pushed the go-live to 15 March 2027. (m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01; m063, 2026-09-14; m068, 2026-09-16; m082, 2026-09-21; m089, 2026-09-23)
- Status 25 Sep 2026 (Jonas Vik): 25% of the content migrated; product pages for the October pilot are on track for 5 Oct 2026. Ana told Gunnar Holm on 24 Sep that the plan is updated for the 15 March go-live. (m091, 2026-09-24; m096, 2026-09-25)
No longer true:
- Scope: about 1,200 pages move from the old Fram CMS. Order: product pages first, news last. Owner: Cara Lund. (m002, 2026-08-24; m005, 2026-08-25), until 2026-09-16
- Risk: Fram's API allows only 10 requests per second, making the bulk export slow. Cara asked Lars Moe at Fram on 25 Aug whether the limit can be raised; no answer yet. (m005, 2026-08-25), until 2026-09-02
- Risk: Fram's API allows only 10 requests per second (Standard plan, applies to all customers), making the bulk export slow. At that rate the export of the 1,200 pages takes about three weeks longer than planned. Lars Moe (Fram) answered on 31 Aug 2026: the limit can be raised to 50 requests per second only on the Enterprise plan, at 20,000 NOK a month extra. Choice (pay or accept delay) put to Gunnar Holm on 1 Sep; see Northwind page. (m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01), until 2026-09-16
- Risk: Fram's API allows only 10 requests/s (Standard plan), so the export of the ~1,200 pages takes about three weeks longer than planned. Enterprise plan (50 requests/s, 20,000 NOK/month) was rejected by the steering group on 14 Sep 2026. Alternative offered by Lars Moe on 16 Sep: one-time bulk export on Fram's side for 15,000 NOK, date to be confirmed. (m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01; m063, 2026-09-14; m068, 2026-09-16), until 2026-09-23

# Per Hansen (person)
- IT lead (IT-leder) at Northwind; owned hosting and DNS for the website relaunch. He is leaving Northwind; last day Friday 2 Oct 2026. Ola Nordmann takes over hosting and DNS from 1 Oct 2026; Per will arrange a handover. (m002, 2026-08-24; m003, 2026-08-24; m084, 2026-09-22)
- Handover meeting with Ola Nordmann is on 29 Sep 2026; the documentation is in Northwind's IT wiki (Per, 24 Sep 2026). (m093, 2026-09-24)
No longer true:
- IT lead (IT-leder) at Northwind; owns hosting and DNS for the website relaunch. (m002, 2026-08-24; m003, 2026-08-24), until 2026-09-23

# Northwind website relaunch (project)
- Budget: 450,000 NOK, approved by Gunnar Holm on 24 Aug 2026. (m002, 2026-08-24; m006, 2026-08-25)
- Invoicing rule: every invoice to Northwind must carry a PO number from Lise Berg (Procurement); don't invoice before receiving one. (m013, 2026-08-27)
- Analytics: Northwind Legal (Mona Lie) prefers Matomo over Google Analytics, because Matomo can run on Northwind's own servers and no data goes to the US. Ana should plan for Matomo. (m024, 2026-08-31)
- PO number for the relaunch: PO-77120 (from Lise Berg, 2 Sep 2026). Put it on every invoice. (m029, 2026-09-02)
- The cookie banner needs Mona Lie's (Legal, Northwind) approval before launch. On 7 Sep 2026 she said she can approve the draft on one condition: the 'Reject all' button must be as visible as 'Accept all' (same size and color). Ana must send her the revised design when ready. (m044, 2026-09-07)
- Steering group meeting: Monday 14 September 2026, 10:00–11:30 at Northwind, Storgata 1. Organizer: Gunnar Holm. (m046, 2026-09-08)
- Gunnar Holm approved the new design at the design review on 9 Sep 2026. The product pages get larger images. (Reported by Cara Lund.) (m051, 2026-09-09)
- DNS changes must be announced to Northwind IT one week in advance (Per Hansen, 11 Sep 2026). (m057, 2026-09-11)
- Agenda for the steering group on 14 Sep 2026 (from Gunnar Holm, 11 Sep): the hosting decision, the API issue and the timeline. (m058, 2026-09-11)
- Hosting decided on 14 Sep 2026: Azure (see page "Northwind hosting decision"). (m063, 2026-09-14)
- Steering group meets every four weeks; first meeting was 14 September 2026; next meeting 12 October 2026. (m063, 2026-09-14)
- Matomo will run in Northwind's own Azure tenant, set up by Per Hansen's team (confirmed by Mona Lie, 16 Sep 2026). (m071, 2026-09-16)
- The Azure staging environment will be ready on 1 October 2026 (Per Hansen, 18 Sep 2026). (m075, 2026-09-18)
- Budget: Gunnar Holm mentioned privately on 15 Sep 2026 that he might add about 100,000 NOK if the October pilot with the product pages goes well. On 18 Sep 2026 he clarified that the extra 100,000 is NOT approved; Ana should not plan with it until management decides after the pilot. (m066, 2026-09-15; m077, 2026-09-18)
- Go-live date for the new website: 15 March 2027. Gunnar Holm decided on 21 Sep 2026 to move it from 1 March 2027, because Fram can only run the one-time bulk export in the second week of January 2027, which makes 1 March too tight. (Earlier: 1 March 2027, agreed at kickoff on 24 Aug and kept "for now" on 14 Sep 2026.) (m002, 2026-08-24; m006, 2026-08-25; m063, 2026-09-14; m082, 2026-09-21; m089, 2026-09-23)
- Fram API limit: the steering group decided on 14 Sep 2026 not to buy Fram's Enterprise plan (20,000 NOK/month). Instead, Lars Moe (Fram) offered a one-time bulk export on Fram's side for 15,000 NOK. Gunnar Holm accepted this on 21 Sep 2026. Lars booked the export for 11–15 January 2027 (confirmed 23 Sep 2026), price 15,000 NOK. (m063, 2026-09-14; m068, 2026-09-16; m082, 2026-09-21; m089, 2026-09-23)
- Owners: Jonas Vik (Acme) owns the content migration from the old Fram CMS from 14 Sep 2026, taking over from Cara Lund, who stays on the relaunch for design questions. Hosting and DNS (Northwind): Per Hansen until he leaves (last day 2 Oct 2026); Ola Nordmann takes over from Thursday 1 Oct 2026. (m002, 2026-08-24; m006, 2026-08-25; m064, 2026-09-14; m084, 2026-09-22)
- Cookie banner: Mona Lie confirmed on 24 Sep 2026 that she received the revised banner from Cara Lund and will review it the following week (week of 28 Sep 2026). Approval still pending. (m092, 2026-09-24)
No longer true:
- Go-live date for the new website: 1 March 2027 (agreed at kickoff on 24 Aug 2026). (m002, 2026-08-24; m006, 2026-08-25), until 2026-09-16
- Owners: Cara Lund (Acme) owns the content migration from the old Fram CMS; Per Hansen (Northwind) owns hosting and DNS. (m002, 2026-08-24; m006, 2026-08-25), until 2026-09-16
- Steering group meets every four weeks; first meeting 14 September 2026. (m002, 2026-08-24; m003, 2026-08-24; m006, 2026-08-25), until 2026-09-16
- Open: hosting must be chosen between Azure and AWS (see page "Northwind hosting decision"). (m003, 2026-08-24), until 2026-09-16
- Open decision for Gunnar Holm: either pay Fram 20,000 NOK a month for the Enterprise plan (50 requests/s), or accept that the content migration takes about three weeks longer, which puts the 1 March 2027 go-live at risk. Cara Lund suggested asking Gunnar whether he would rather pay or move the date; Ana asked him on 1 Sep 2026 to discuss it at the steering group on 14 September. No answer yet. (m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01), until 2026-09-09
- The cookie banner needs Mona Lie's (Legal, Northwind) approval before launch. (m024, 2026-08-31), until 2026-09-09
- Open decision on the Fram API limit: pay Fram 20,000 NOK a month for the Enterprise plan (50 requests/s), or accept that the content migration takes about three weeks longer, which puts the 1 March 2027 go-live at risk. Gunnar Holm answered on 8 Sep 2026: he does not want to pay 20,000 a month for a temporary need; Lars Moe (Fram) should first be asked what he can do, and the decision is to be made at the steering group on 14 September. (m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01; m045, 2026-09-08), until 2026-09-16
- Go-live date for the new website: 1 March 2027 (agreed at kickoff on 24 Aug 2026; kept "for now" by the steering group on 14 Sep 2026). (m002, 2026-08-24; m006, 2026-08-25; m063, 2026-09-14), until 2026-09-23
- Fram API limit: the steering group decided on 14 Sep 2026 not to buy Fram's Enterprise plan (20,000 NOK/month). Lars Moe (Fram) is to find another way to speed up the export. On 16 Sep 2026 Lars offered a one-time bulk export run on Fram's side for 15,000 NOK, which would remove most of the delay; he will confirm the date. Not yet accepted by Northwind/Acme. (m063, 2026-09-14; m068, 2026-09-16), until 2026-09-23
- Owners: Jonas Vik (Acme) owns the content migration from the old Fram CMS from 14 Sep 2026, taking over from Cara Lund, who stays on the relaunch for design questions; Per Hansen (Northwind) owns hosting and DNS. (m002, 2026-08-24; m006, 2026-08-25; m064, 2026-09-14), until 2026-09-23
- Budget: Gunnar Holm said privately on 15 Sep 2026 that if the October pilot with the product pages goes well he may add about 100,000 NOK to the budget. Nothing is decided. (m066, 2026-09-15), until 2026-09-20

# Hege Moen (person)
- CEO (administrerende direktør) of Fjord Bank. Since 25 Sep 2026 must co-sign, with Kari Lie, orders over 250,000 NOK. (m094, 2026-09-25)

# Kari Lie (person)
- Finance Director (Finansdirektør) at Fjord Bank; signs orders between 100,000 and 250,000 NOK alone; orders over 250,000 NOK need her and CEO Hege Moen together (since 25 Sep 2026). (m004, 2026-08-25; m094, 2026-09-25)
No longer true:
- Finance Director (Finansdirektør) at Fjord Bank; must sign all orders over 100,000 NOK. (m004, 2026-08-25), until 2026-09-27

# Fjord Bank (client)
- Framework agreement with Acme renews 1 January 2027. Current price: 1.2 million NOK per year. (m004, 2026-08-25)
- Either party can terminate with three months' notice, so any changes to the agreement must be agreed before 1 October 2026. (m004, 2026-08-25)
- Billing change requested by Kari Lie on 3 Sep 2026: from January 2027 Fjord Bank wants monthly invoices instead of quarterly, to fit their new budget system. Not yet confirmed by Acme. Likely relates to the framework agreement renewing 1 Jan 2027 (changes must be agreed before 1 Oct 2026). (m032, 2026-09-03)
- Price renegotiation: on 10 Sep 2026 Kari Lie said Fjord Bank wants to negotiate the price before the renewal (1 Jan 2027) and asked Ana to send a proposal during the following week (week of 14 Sep 2026). Changes must be agreed before 1 Oct 2026 (three months' notice). (m053, 2026-09-10)
- Ana's renewal proposal sent to Kari Lie on 15 Sep 2026: 1.35 million NOK per year from 1 Jan 2027 (up from 1.2 million), two-year commitment, including quarterly operations reports. Kari answered on 21 Sep 2026: 1.35 million is too high; Fjord Bank can accept 1.25 million NOK per year with a two-year commitment. Open: Ana's reply (changes must be agreed before 1 Oct 2026). (m065, 2026-09-15; m083, 2026-09-21)
- Signing rule (changed by Fjord Bank's board, announced by Kari Lie 25 Sep 2026): orders over 250,000 NOK must be signed by both Kari Lie (Finance Director) and CEO Hege Moen. Orders between 100,000 and 250,000 NOK are signed by Kari Lie alone, as before. (m094, 2026-09-25)
No longer true:
- Rule: all orders over 100,000 NOK must be signed by Kari Lie (Finance Director, Fjord Bank). (m004, 2026-08-25), until 2026-09-27
- Ana's renewal proposal sent to Kari Lie on 15 Sep 2026: 1.35 million NOK per year from 1 Jan 2027 (up from 1.2 million), with a two-year commitment, including quarterly operations reports. No answer yet. (m065, 2026-09-15), until 2026-09-23

# Mamma's 70th birthday (personal)
- It is a surprise: Ingrid Berg (5 Sep 2026) asked Ana not to say anything to mamma. (m040, 2026-09-05)
- Celebration moved (Ingrid Berg, 23 Sep 2026) to Sunday 11 October 2026 at 14:00, at Ingrid's home in Kongsberg, because Frognerseteren was fully booked. (Was Saturday 10 Oct at 13:00 at Frognerseteren.) Ana is still to bring the cake. (m020, 2026-08-30; m087, 2026-09-23)
No longer true:
- Celebration on Saturday 10 October 2026 at 13:00 at Frognerseteren. Ingrid Berg asked Ana to bring a cake. (m020, 2026-08-30), until 2026-09-23

# Fjord Bank customer portal feasibility study (project)
- Request: Siri Dahl (Fjord Bank) asked on 27 Aug 2026 for Acme to do the feasibility study (forstudie) for the new customer portal this autumn. Two options under consideration: build in-house or buy a ready-made platform. (m012, 2026-08-27)
- Open: it is not settled whether the mobile app is included in the feasibility study. (m012, 2026-08-27) (uncertain: Still open: on 2 Sep 2026 Siri said the mobile app remains an open question and she will come back to it. [m028])
- Estimate of 180,000 NOK for six weeks, starting 21 September 2026, was accepted by Siri Dahl on 2 Sep 2026. As it is over 100,000 NOK, the order needs Kari Lie's signature under Fjord Bank's rule; no confirmation yet that she has signed. (m004, 2026-08-25; m016, 2026-08-28; m028, 2026-09-02)
- Siri Dahl sent the contract for the feasibility study on 8 Sep 2026 and asked Ana to sign by Friday 11 Sep 2026. (Kari Lie's signature requirement for orders over 100,000 NOK still applies.) (m047, 2026-09-08)
- Cara Lund joins the pre-study three days a week from 21 Sep 2026 (the start date). (m064, 2026-09-14)
- Kickoff meeting for the pre-study: Monday 21 September 2026 at 09:00 at Fjord Bank in Bergen (Siri Dahl invited Ana and Cara Lund). (m072, 2026-09-17)
- Kickoff took place on 21 Sep 2026. Siri Dahl wants a recommendation on build vs. buy by 13 Nov 2026. Criteria: time to launch, cost over five years, and control over customer data. (Reported by Cara Lund, 22 Sep 2026.) (m085, 2026-09-22)
No longer true:
- Estimate sent by Ana on 28 Aug 2026: 180,000 NOK for six weeks, starting 21 September 2026 if it suits Fjord Bank. No answer yet. As it is over 100,000 NOK, the order would need Kari Lie's signature under Fjord Bank's rule. (m004, 2026-08-25; m016, 2026-08-28), until 2026-09-02

# Ola Nordmann (person)
- At Northwind; takes over responsibility for hosting and DNS (Northwind website relaunch) from Per Hansen from Thursday 1 Oct 2026. (m084, 2026-09-22)

# Lars Moe (person)
- Contact at Fram (CMS vendor); asked by Cara to raise the API rate limit. (m005, 2026-08-25)
- Replied 31 Aug 2026 on the API limit: 10 requests/s applies to all Standard-plan customers; Enterprise plan gives 50 requests/s for 20,000 NOK a month extra. Title: Account Manager, Fram CMS. (m023, 2026-08-31)
- Offered a one-time bulk export on Fram's side for 15,000 NOK (16 Sep 2026) as an alternative to the Enterprise plan. Northwind accepted; Lars booked it for 11–15 January 2027 (forwarded 23 Sep 2026). (m068, 2026-09-16; m082, 2026-09-21; m089, 2026-09-23)
No longer true:
- 16 Sep 2026: offered a one-time bulk export on Fram's side for 15,000 NOK as an alternative to the Enterprise plan; will confirm the date. (m068, 2026-09-16), until 2026-09-23

# Oslo halvmaraton with Bislett løpeklubb (personal)
- The club runs Oslo halvmaraton on Saturday 19 September 2026. Registration closes 5 September 2026. Interval training every Tuesday at 18:00 from the clubhouse until the race. Organiser: Tone Haug. (m017, 2026-08-28; m018, 2026-08-29)
- Ana is registered for the half marathon on 19 Sep 2026 (goal: under 1:45). On 13 Sep 2026 Tone Haug sent her start number 4417; start at 10:00 from Rådhusplassen. (m036, 2026-09-04; m060, 2026-09-13)
- Result 19 Sep 2026: Ana ran 21.1 km in 1:44:10, a new personal record and under her goal of 1:45. The club celebrates at the clubhouse on Friday (25 Sep 2026) (Tone Haug). (m078, 2026-09-19; m079, 2026-09-19)
No longer true:
- Ana asked Tone Haug on 4 Sep 2026 to register her for the half marathon on 19 Sep; her goal is under 1:45. No confirmation seen yet (registration closed 5 Sep). (m036, 2026-09-04), until 2026-09-13

# Kitchen renovation (personal)
- Carpenter Erik Dahl can start on the kitchen Monday 2 November 2026. (m008, 2026-08-26)
- Erik Dahl's quote: 85,000 NOK including materials, excluding the electrician. On 17 Sep 2026 Erik said his electrician Bjørn quoted 7,000 NOK for the electrical work, so the total for the kitchen is 92,000 NOK, all inclusive. Start on 2 November still stands. (m008, 2026-08-26; m049, 2026-09-09; m074, 2026-09-17)
No longer true:
- Quote from Erik Dahl: 85,000 NOK including materials, excluding the electrician (electrician still to be arranged). (m008, 2026-08-26), until 2026-09-09
- Quote from Erik Dahl: 85,000 NOK including materials, excluding the electrician. On 9 Sep 2026 Erik said his electrician Bjørn can do the electrical work but has not given a price yet. Start on 2 November still stands. (m008, 2026-08-26; m049, 2026-09-09), until 2026-09-20

# Jonas Vik (person)
- Developer at Acme, started 14 Sep 2026; sits next to Ana. Took over the Fram content migration for the Northwind relaunch from Cara Lund. (m035, 2026-09-03; m064, 2026-09-14)
No longer true:
- New developer at Acme, starts 14 September 2026; will sit next to Ana. (Announced by Cara Lund.) (m035, 2026-09-03), until 2026-09-16

# Cara Lund (person)
- Acme colleague; handed the Fram content migration to Jonas Vik on 14 Sep 2026; stays on the Northwind relaunch for design questions; from 21 Sep 2026 works three days a week on the Fjord Bank pre-study. (m064, 2026-09-14)
No longer true:
- Acme colleague; owns the content migration from Fram CMS for the Northwind relaunch. (m002, 2026-08-24; m005, 2026-08-25), until 2026-09-16

# Northwind hosting decision (decision)
- Decided at the steering group on 14 Sep 2026: the new Northwind site is hosted on Azure. AWS was about 15% cheaper, but would need a new framework agreement; Northwind's IT team already runs Azure, and it keeps the data in Norway. (m063, 2026-09-14)
- Per Hansen's comparison (3 Sep 2026): AWS about 15% cheaper per year, but needs a new framework agreement and a new platform for the team. Azure is already operated by Northwind and the Norwegian region keeps data in the country (valued by Mona Lie). Per recommended Azure; the steering group chose Azure on 14 Sep 2026. (m033, 2026-09-03; m063, 2026-09-14)
No longer true:
- Undecided: Azure vs AWS for hosting the new Northwind site. Northwind's IT team already operates Azure; Northwind procurement has received an offer from AWS. Per Hansen is preparing a comparison for the steering group on 14 September 2026. (m003, 2026-08-24), until 2026-09-16
- Per Hansen's comparison (3 Sep 2026) for the steering group: AWS is about 15% cheaper per year, but needs a new framework agreement and the team would have to learn a new platform. Azure is already operated by Northwind, and the Azure region in Norway keeps data in the country, which Mona Lie (Legal) values. Per's recommendation: Azure. Final decision still pending at the steering group on 14 Sep 2026. (m033, 2026-09-03), until 2026-09-16

# Havbris (client)
- Havbris is ending the maintenance agreement with Acme for their websites on 30 September 2026. They will take operations in-house from October. Contact: Marte Lien (informed Ana on 7 Sep 2026). (m043, 2026-09-07)

# Trip to Bergen 9 September 2026 (personal)
- Nordfly flight Oslo–Bergen on Wednesday 9 September 2026 at 07:10. Booking number QX7P2L. (m037, 2026-09-04)

# Lise Berg (person)
- Procurement at Northwind. Issues purchase order (PO) numbers: Northwind needs a PO number on every invoice, and Acme must not invoice before getting one from her. (m013, 2026-08-27)
- Issued PO number PO-77120 for the Northwind relaunch on 2 Sep 2026, so Acme can now invoice. (m029, 2026-09-02)

# Mona Lie (person)
- Legal at Northwind. Prefers Matomo over Google Analytics for the new site; must approve the cookie banner before launch. (m024, 2026-08-31)

# Siri Dahl (person)
- Digital Director (Digitaldirektør) at Fjord Bank; requested the customer portal feasibility study from Acme. (m012, 2026-08-27)

# Acme timesheets (personal)
- Timesheets are due every Friday by 15:00. Hours go on the client project, not on internal. (m009, 2026-08-26)

# Gunnar Holm (person)
- Head of Marketing at Northwind; sponsor of the website relaunch who approved the 450,000 NOK budget. (m002, 2026-08-24)