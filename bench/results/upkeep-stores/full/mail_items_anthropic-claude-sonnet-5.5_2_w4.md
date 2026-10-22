# Bislett løpeklubb (personal)
- Club runs the Oslo half marathon on Saturday 19 September 2026. Registration closes 5 September, so sign up before then (Tone Haug). (m018, 2026-08-29)
- Interval training every Tuesday at 18:00 from the clubhouse, until the race. (m017, 2026-08-28)
- Ana asked Tone Haug on 4 Sep 2026 to register her for the half marathon on 19 September; her goal is under 1:45. Registration confirmed: Tone sent her start number 4417 on 13 Sep 2026; start at 10:00 from Rådhusplassen. (m036, 2026-09-04; m060, 2026-09-13)
- Ana ran the Oslo half marathon on 19 Sep 2026 in 1:44:10, a personal record and under her 1:45 goal. (m078, 2026-09-19)
- Club party at the clubhouse on Friday (25 Sep 2026) after the race (Tone Haug). (m079, 2026-09-19)
No longer true:
- Ana asked Tone Haug on 4 Sep 2026 to register her for the half marathon on 19 September; her goal is under 1:45. No confirmation seen yet. (m036, 2026-09-04), until 2026-09-13

# Northwind website relaunch (project)
- Budget: 450,000 NOK, approved by Gunnar Holm on 24 Aug 2026. (m002, 2026-08-24; m006, 2026-08-25)
- Steering group meets every four weeks; first meeting 14 September 2026. (m002, 2026-08-24; m006, 2026-08-25)
- Migration plan (Cara): about 1,200 pages move from the old Fram CMS; product pages first, news last. (m005, 2026-08-25)
- Invoicing: every invoice to Northwind needs a purchase order number from Lise Berg (Northwind procurement). Do not invoice before having a PO number. (m013, 2026-08-27)
- Risk: Fram's API allows only 10 requests/second (Standard plan), making the bulk export slow. Cara has admin access to Fram and the export API works, just slowly. Lars Moe replied 31 Aug: the limit can be raised to 50 requests/second only on the Enterprise plan, 20,000 NOK/month extra. At 10 req/s the export of 1,200 pages takes about three weeks longer than planned (Cara, 1 Sep), which puts the 1 March go-live at risk. See the open decision on the Fram API limit. (m005, 2026-08-25; m011, 2026-08-26; m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01)
- Analytics: Northwind legal (Mona Lie) prefers Matomo over Google Analytics, since Matomo can run on Northwind's own servers and no data goes to the US. Ana is to plan for Matomo. (m024, 2026-08-31)
- The cookie banner needs Mona Lie's approval before launch. (m024, 2026-08-31)
- PO number for the relaunch, received 2 Sep 2026 from Lise Berg: PO-77120. Put it on every invoice. (m029, 2026-09-02)
- Pilot: Gunnar Holm wants a pilot with the product pages on staging in October 2026 before everything is migrated; if it goes well, the rest follows (3 Sep). (m034, 2026-09-03)
- Cookie banner: Mona Lie (7 Sep 2026) will approve the draft on one condition: the 'Reject all' button must be as visible as 'Accept all', with the same size and color. Ana is to send her the revised design when ready (open). (m044, 2026-09-07)
- Steering group meeting: Monday 14 September 2026, 10:00–11:30 at Northwind, Storgata 1. Organizer: Gunnar Holm. (m046, 2026-09-08)
- Design: Gunnar Holm approved the new design at the review on 9 Sep 2026. The product pages get larger images. (m051, 2026-09-09)
- Content workshop with Northwind (10 Sep 2026, per Cara Lund): about 40% of the old pages are dropped. Northwind writes the new product texts, deadline 1 December 2026. This likely reduces the number of pages to migrate from the ~1,200 in the plan; the new count is not yet stated. (m054, 2026-09-10)
- DNS changes must be notified to Northwind IT one week in advance (Per Hansen, 11 Sep 2026). (m057, 2026-09-11)
- Agenda for the steering group on 14 Sep 2026 (Gunnar Holm, 11 Sep): the hosting decision, the API issue and the timeline. (m058, 2026-09-11)
- Decision (steering group, 14 Sep 2026, per Gunnar Holm): the new site is hosted on Azure. AWS was about 15% cheaper per year, but would need a new framework agreement; Northwind's IT team already runs Azure, which also keeps the data in Norway (valued by Mona Lie, legal). Per Hansen had recommended Azure. (m003, 2026-08-24; m033, 2026-09-03; m063, 2026-09-14)
- Decision on the Fram API limit (steering group, 14 Sep 2026): Northwind will not buy Fram's Enterprise plan (20,000 NOK/month for 50 req/s; Gunnar Holm did not want to pay that for a temporary need). Lars Moe (Fram) is to find another way to speed up the export. Lars's proposal (16 Sep): Fram runs a one-time bulk export on its side for 15,000 NOK, which would remove most of the delay; he will confirm the date. Not yet accepted by Northwind/Acme (open). (m045, 2026-09-08; m063, 2026-09-14; m068, 2026-09-16)
- Go-live date: 1 March 2027. Steering group on 14 Sep 2026 decided to keep it "for now" (the Fram export delay is still a risk). (m002, 2026-08-24; m006, 2026-08-25; m063, 2026-09-14)
- Next steering group meeting: 12 October 2026 (announced by Gunnar Holm after the 14 Sep meeting). (m063, 2026-09-14)
- Owners: Jonas Vik (Acme) owns the content migration from the old Fram CMS, taking over from Cara Lund on 14 Sep 2026; Cara stays on the relaunch for design questions. Per Hansen (Northwind) owns hosting and DNS. (m002, 2026-08-24; m006, 2026-08-25; m064, 2026-09-14)
- Matomo hosting (Mona Lie, 16 Sep 2026): Matomo will run in Northwind's own Azure tenant, set up by Per Hansen's team. (m071, 2026-09-16)
- Staging environment on Azure will be ready 1 October 2026 (Per Hansen, 18 Sep); needed for the October pilot with the product pages. (m075, 2026-09-18)
- Possible budget increase of about 100,000 NOK is NOT approved (Gunnar Holm, 18 Sep 2026). Do not plan with it until Northwind management decides after the October pilot. Budget stays 450,000 NOK for now. (m066, 2026-09-15; m077, 2026-09-18)
No longer true:
- Go-live date: 1 March 2027. (m002, 2026-08-24; m006, 2026-08-25), until 2026-09-16
- Owners: Cara Lund (Acme) owns the content migration from the old Fram CMS; Per Hansen (Northwind) owns hosting and DNS. (m002, 2026-08-24; m006, 2026-08-25), until 2026-09-16
- Open decision: hosting on Azure or AWS. Northwind IT already runs Azure; procurement has received an offer from AWS. Per Hansen is preparing a comparison for the steering group on 14 September. (m003, 2026-08-24), until 2026-09-06
- Risk: Fram's API allows only 10 requests/second, making the bulk export slow. Cara asked Lars Moe at Fram whether the limit can be raised (no answer yet). As of 26 Aug Cara has admin access to Fram and the export API works, just slowly. (m005, 2026-08-25; m011, 2026-08-26), until 2026-09-02
- Open decision: Fram API limit. Option A: pay Fram 20,000 NOK/month for the Enterprise plan (50 req/s). Option B: accept the migration taking about three weeks longer, putting the 1 March 2027 go-live at risk. Cara suggested letting Gunnar choose; Ana asked Gunnar on 1 Sep to discuss it at the steering group on 14 September. No answer yet. (m023, 2026-08-31; m025, 2026-09-01; m026, 2026-09-01), until 2026-09-09
- Open decision: hosting on Azure or AWS, to be taken at the steering group on 14 September. Per Hansen's comparison (3 Sep): AWS is about 15% cheaper per year, but needs a new framework agreement and the team must learn a new platform. Northwind IT already runs Azure, and the Norwegian Azure region keeps data in the country, which Mona Lie (legal) values. Per recommends Azure. (m003, 2026-08-24; m033, 2026-09-03), until 2026-09-16
- Open decision: Fram API limit. Option A: pay Fram 20,000 NOK/month for the Enterprise plan (50 req/s). Option B: accept the migration taking about three weeks longer, putting the 1 March 2027 go-live at risk. Gunnar Holm answered on 8 Sep 2026: he does not want to pay 20,000 NOK/month for a temporary need; Ana is to see what Lars Moe (Fram) can do, and the decision will be made at the steering group on 14 September. (m045, 2026-09-08), until 2026-09-16
- Possible budget increase (Gunnar Holm, 15 Sep 2026, "between us"): if the October pilot with the product pages goes well, he may add about 100,000 NOK to the budget. Nothing is decided. (m066, 2026-09-15), until 2026-09-20

# Kitchen renovation (personal)
- Carpenter Erik Dahl can start on the kitchen Monday 2 November 2026. (m008, 2026-08-26)
- Erik Dahl's offer: 85,000 NOK including materials, excluding electrician (electrician still to be arranged). (m008, 2026-08-26)
- Electrician: Erik Dahl's electrician Bjørn quoted 7,000 NOK for the electrical work (17 Sep 2026). Erik confirmed on 9 Sep that the 2 November start stands. (m049, 2026-09-09; m074, 2026-09-17)
- Total price for the kitchen: 92,000 NOK all inclusive (85,000 carpenter incl. materials + 7,000 electrician), per Erik Dahl on 17 Sep 2026. (m074, 2026-09-17)
No longer true:
- Electrician: Erik Dahl's electrician Bjørn can do the electrical work but has not given a price yet (9 Sep 2026). Erik confirms the 2 November start stands. (m049, 2026-09-09), until 2026-09-20

# Jonas Vik (person)
- New developer at Acme, starts 14 September 2026; will sit next to Ana (per Cara Lund). (m035, 2026-09-03)
- Took over the Northwind content migration from Cara Lund on 14 Sep 2026. Lars Moe (Fram) includes him in the export discussion. (m064, 2026-09-14; m068, 2026-09-16)
- 17 Sep 2026: has read Cara's migration plan and started on the product pages. (m073, 2026-09-17)

# Fjord Bank customer portal feasibility study (project)
- Fjord Bank (Siri Dahl) asked Acme on 27 Aug 2026 to do the feasibility study (forstudie) for its new customer portal this autumn. Two options are being considered: build in-house or buy a ready-made platform. (m012, 2026-08-27)
- Open: it is not settled whether the mobile app is part of the feasibility study. (m012, 2026-08-27)
- Ana's estimate of 28 Aug 2026: 180,000 NOK for the study, over six weeks, starting 21 September 2026. Siri Dahl accepted on 2 Sep 2026: Fjord Bank goes ahead as proposed, 180,000 NOK, start 21 September. (m016, 2026-08-28; m028, 2026-09-02)
- As of 2 Sep 2026 Siri Dahl says the mobile app is still an open question; she will come back to it. (m028, 2026-09-02)
- Contract for the feasibility study sent by Siri Dahl on 8 Sep 2026; she asks Ana to sign by Friday (11 Sep 2026). (m047, 2026-09-08)
- Cara Lund joins the study three days a week from 21 September 2026 (the start date). (m064, 2026-09-14)
- Kickoff meeting: Monday 21 September 2026 at 09:00 at Fjord Bank in Bergen (Siri Dahl, 17 Sep). Invited: Ana and Cara Lund. (m072, 2026-09-17)
No longer true:
- Ana's estimate, sent 28 Aug 2026: 180,000 NOK for the study, over six weeks, starting 21 September 2026 if that suits Fjord Bank. No reply yet. (m016, 2026-08-28), until 2026-09-02

# Lars Moe (person)
- Account Manager at Fram CMS. Replied 31 Aug to Cara's question: the 10 requests/second limit applies to all Standard plan customers; 50 requests/second is available on the Enterprise plan at 20,000 NOK/month extra. (m005, 2026-08-25; m023, 2026-08-31)
- 16 Sep 2026: offered a one-time bulk export run by Fram for 15,000 NOK as an alternative to the Enterprise plan; will confirm the date it can run. (m068, 2026-09-16)
No longer true:
- Contact at Fram; Cara asked him (25 Aug) whether Fram's API rate limit of 10 requests/second can be raised. (m005, 2026-08-25), until 2026-09-02

# Fjord Bank framework agreement (client)
- Framework agreement with Acme renews 1 January 2027. Current price: 1.2 million NOK per year. (m004, 2026-08-25)
- Either party can terminate with three months' notice, so any changes must be agreed before 1 October 2026. (m004, 2026-08-25)
- All orders above 100,000 NOK must be signed by Kari Lie. (m004, 2026-08-25)
- Billing change requested by Kari Lie on 3 Sep 2026: from January 2027 Fjord Bank wants monthly invoices instead of quarterly, to fit its new budget system. Not yet confirmed by Acme. (m032, 2026-09-03)
- Price renegotiation: Kari Lie (10 Sep 2026) wanted to negotiate before the renewal. Ana sent the proposal on 15 Sep 2026: 1.35 million NOK per year from 1 January 2027 (up from 1.2 million), two-year binding period, including quarterly operations reports. Awaiting Kari's answer. Notice deadline for changes is 1 October 2026. (m053, 2026-09-10; m065, 2026-09-15)
No longer true:
- Price renegotiation: Kari Lie (10 Sep 2026) wants to negotiate the price before the renewal and asks Ana to send a proposal during the week of 14 Sep 2026. Open: Ana to send the proposal. Notice deadline for changes is 1 October 2026. (m053, 2026-09-10), until 2026-09-16

# Cara Lund (person)
- Acme colleague; handed the content migration from Fram CMS over to Jonas Vik on 14 Sep 2026 and stays on the Northwind relaunch for design questions. From 21 Sep 2026 she works three days a week on the Fjord Bank pre-study. (m064, 2026-09-14)
No longer true:
- Acme colleague; owns the content migration from Fram CMS in the Northwind website relaunch. (m002, 2026-08-24; m005, 2026-08-25; m006, 2026-08-25), until 2026-09-16

# Havbris website maintenance agreement (client)
- Havbris (Marte Lien) told Ana on 7 Sep 2026 that it is ending the website maintenance agreement with Acme on 30 September 2026. Havbris takes the operations in-house with its own team from October. (m043, 2026-09-07)

# Mother's 70th birthday (personal)
- Celebration on Saturday 10 October 2026 at 13:00 at Frognerseteren. Ingrid asked Ana to bring a cake. (m020, 2026-08-30)
- The celebration is a surprise: Ingrid asked (5 Sep) that nothing is said to Mother. (m040, 2026-09-05)

# Trip to Bergen 9 September (personal)
- Nordfly flight Oslo–Bergen on Wednesday 9 September 2026 at 07:10, booking number QX7P2L. (m037, 2026-09-04)

# Lise Berg (person)
- Procurement at Northwind; issues the purchase order (PO) numbers needed for invoicing. (m013, 2026-08-27)
- Issued PO-77120 for the website relaunch on 2 Sep 2026. (m029, 2026-09-02)

# Mona Lie (person)
- Legal at Northwind; prefers Matomo for analytics on the new site and must approve the cookie banner before launch. (m024, 2026-08-31)

# Siri Dahl (person)
- Digital director (Digitaldirektør) at Fjord Bank; requested the customer portal feasibility study from Acme. (m012, 2026-08-27)

# Acme timesheets (personal)
- Timesheets are due every Friday by 15:00. Hours go on the client project, not on internal. (m009, 2026-08-26)

# Kari Lie (person)
- Finance director (Finansdirektør) at Fjord Bank; must sign all orders above 100,000 NOK. (m004, 2026-08-25)

# Per Hansen (person)
- IT lead (IT-leder) at Northwind; owns hosting and DNS for the website relaunch. (m002, 2026-08-24; m003, 2026-08-24)

# Gunnar Holm (person)
- Head of Marketing at Northwind; client lead for the website relaunch, approved the 450,000 NOK budget. (m002, 2026-08-24)