=== index.md ===
# Index

- [northwind/website-relaunch.md](northwind/website-relaunch.md): Northwind relaunch with go-live date, budget, owners, steering group, people, PO number and open items.
- [northwind/analytics-and-cookies.md](northwind/analytics-and-cookies.md): Matomo chosen over Google Analytics; cookie banner needs legal approval.
- [northwind/hosting-decision.md](northwind/hosting-decision.md): Azure vs AWS hosting choice; Per Hansen recommends Azure; decision due 14 Sept.
- [northwind/fram-migration.md](northwind/fram-migration.md): Migration of about 1,200 pages from Fram CMS, with API limit, Enterprise-plan option (20,000 NOK/month), October pilot and open decision.
- [fjordbank/framework-agreement.md](fjordbank/framework-agreement.md): Fjord Bank agreement renewal, price, notice period, signing rule and monthly-invoicing request.
- [fjordbank/customer-portal-study.md](fjordbank/customer-portal-study.md): Fjord Bank customer portal pre-study: request, 180,000 NOK estimate accepted, start 21 Sept, mobile app question open.
- [personal/kitchen-renovation.md](personal/kitchen-renovation.md): Carpenter quote and start date for Ana's kitchen.
- [personal/events.md](personal/events.md): Mother's 70th birthday (surprise) and Bislett running club events.
- [personal/travel.md](personal/travel.md): Oslo–Bergen flight 9 Sept.
- [acme/timesheets.md](acme/timesheets.md): Timesheet deadline rule.
- [acme/team.md](acme/team.md): Acme colleagues, incl. new developer Jonas Vik from 14 Sept.

=== log.md ===
# Log

- 2026-08-26: Learned from 11 emails (m001–m011). Created Northwind relaunch, hosting, and migration pages, plus the Fjord Bank agreement, kitchen and timesheets pages. Skipped m001, m007 and m010 as newsletter, ad and notification noise.
- 2026-09-02: Learned from 10 emails (m022–m031). Added Fram API limit options, Matomo/cookie page, PO-77120, and Fjord Bank's acceptance of the pre-study. Skipped m022, m027, m030 as newsletters/notifications; m031 only repeats the existing timesheet rule.
- 2026-09-06: Learned from 10 emails (m032–m041). Added Fjord Bank monthly invoicing request, Per Hansen's Azure recommendation, Gunnar's October pilot, new colleague Jonas Vik, half marathon sign-up, surprise party note and Bergen flight. Skipped m038, m039, m041 as notifications, ads and newsletter.
- 2026-08-30: Learned from 10 emails (m012–m021). Created Fjord Bank customer portal pre-study and personal events pages; added Northwind PO rule and Lise Berg to the relaunch page. Skipped m014, m015, m019 and m021 as ads, notifications, newsletter and a likely scam.

=== acme/team.md ===
# Acme team

- Jonas Vik: new developer, starts 14 September 2026 and will sit next to Ana. Announced by Cara Lund.[^m035]
- Cara Lund: Acme colleague; owns the Northwind [content migration](../northwind/fram-migration.md).[^m035]

[^m035]: m035, 2026-09-03, Cara Lund, "New colleague"

=== acme/timesheets.md ===
# Acme timesheets

- Timesheets are due every Friday by 15:00.[^m009]
- Hours go on the client project, not on internal.[^m009]

[^m009]: m009, 2026-08-26, Acme, "Timelister"

=== fjordbank/customer-portal-study.md ===
# Fjord Bank customer portal pre-study (forstudie kundeportal)

Contact: Siri Dahl, Digital Director (Digitaldirektør), Fjord Bank.[^m012]

- Request (2026-08-27): Fjord Bank wants Acme to do the pre-study for its new customer portal this autumn, and asked Ana for an estimate.[^m012]
- The study looks at two options: build the portal in-house or buy a ready-made platform.[^m012]
- Estimate sent by Ana on 2026-08-28: 180,000 NOK for the pre-study, over six weeks, starting 21 September 2026.[^m016]
- **Accepted** by Siri Dahl on 2026-09-02: Fjord Bank goes ahead as proposed, 180,000 NOK, start 21 September 2026.[^m028]

## Open
- Whether the mobile app is included in the pre-study is still open. Siri Dahl will come back to it.[^m028]

See also the [framework agreement](framework-agreement.md).

[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"
[^m028]: m028, 2026-09-02, Siri Dahl, "Re: Forstudie kundeportal"

=== fjordbank/framework-agreement.md ===
# Fjord Bank framework agreement (rammeavtale)

Contact: Kari Lie, Finance Director (Finansdirektør), Fjord Bank.[^m004]

- The agreement with Acme renews on 1 January 2027.[^m004]
- Current price: 1.2 million NOK per year.[^m004]
- Either party can terminate with three months' notice. Any changes must therefore be agreed before 1 October 2026.[^m004]
- Rule: every order over 100,000 NOK must be signed by Kari Lie.[^m004]
- Invoicing change requested (2026-09-03): from January 2027 Fjord Bank wants monthly invoices instead of quarterly, to fit its new budget system. No reply from Acme is recorded yet.[^m032]

[^m032]: m032, 2026-09-03, Kari Lie, "Fakturering fra januar"
[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"

=== northwind/analytics-and-cookies.md ===
# Northwind analytics and cookies

Contact: Mona Lie, Legal, Northwind.[^m024]

- Decision/request (2026-08-31): plan for **Matomo**, not Google Analytics. Northwind's legal team prefers Matomo because it can run on Northwind's own servers, so no data goes to the US.[^m024]
- The cookie banner needs Mona Lie's approval before launch.[^m024]
- Implication: Matomo is self-hosted, so it may interact with the open [hosting decision](hosting-decision.md). This is an inference, not stated in the email.

Part of the [website relaunch](website-relaunch.md).

[^m024]: m024, 2026-08-31, Mona Lie, "Analytics and cookies"

=== northwind/fram-migration.md ===
# Fram CMS content migration

Owner: Cara Lund.[^m002] Part of the [website relaunch](website-relaunch.md).

- Scope: about 1,200 pages move from the old Fram CMS. Product pages go first and news goes last.[^m005]
- Problem: Fram's API allows only 10 requests per second, so the bulk export is slow.[^m005]
- Update 2026-08-26: Cara now has admin access to Fram. The export API works, but slowly.[^m011]

## API rate limit: open decision for Northwind
- Fram's answer (Lars Moe, Account Manager, 2026-08-31): 10 requests per second applies to all customers on the Standard plan. The limit can be raised to 50 requests per second only on the Enterprise plan, which costs 20,000 NOK a month extra.[^m023]
- Cara's view (2026-09-01): 20,000 NOK a month is a lot. At 10 requests per second the bulk export takes about three weeks longer than planned.[^m025]
- Options put to Gunnar Holm by Ana (2026-09-01): (a) pay Fram 20,000 NOK a month for the higher limit, or (b) accept about three weeks' delay, which puts the 1 March 2027 go-live at risk.[^m026]
- Status: **open**. Ana proposed discussing it at the steering group on 14 September 2026. No answer from Gunnar is recorded yet.[^m026]

## Pilot in October
- Gunnar Holm (2026-09-03) wants a pilot first: the product pages on staging in October, before everything is moved. If it goes well, the rest follows.[^m034]

[^m034]: m034, 2026-09-03, Gunnar Holm, "Pilot in October"
[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"
[^m023]: m023, 2026-08-31, Lars Moe, "API rate limit"
[^m025]: m025, 2026-09-01, Cara Lund, "Re: API rate limit"
[^m026]: m026, 2026-09-01, Ana Berg, "Fram API limit – a choice for you"

=== northwind/hosting-decision.md ===
# Northwind hosting decision (Azure vs AWS)

Status: **open**, to be decided at the steering group on 14 September 2026. Per Hansen recommends Azure.[^m033]

- The choice is between Azure and AWS for hosting the new website.[^m003]
- For Azure: Northwind's IT team already runs Azure.[^m003] The Norwegian Azure region keeps data in the country, which Mona Lie (Legal) emphasises.[^m033]
- For AWS: about 15% cheaper per year, and procurement (innkjøp) has an offer.[^m003][^m033] But it needs a new framework agreement and the team must learn a new platform.[^m033]
- Per Hansen sent his comparison for the steering group on 2026-09-03 and **recommends Azure**.[^m033]
- Matomo is self-hosted, so the choice also touches [analytics](analytics-and-cookies.md) (inference).

Part of the [website relaunch](website-relaunch.md).

[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m033]: m033, 2026-09-03, Per Hansen, "Sammenligning Azure og AWS"

=== northwind/website-relaunch.md ===
# Northwind website relaunch

Acme is building a new website for Northwind. Kickoff was on 2026-08-24.

## Agreed at kickoff
- Go-live: 1 March 2027.[^m002][^m006]
- Budget: 450,000 NOK, approved by Gunnar Holm on 2026-08-24.[^m002][^m006]
- Content migration from the old Fram CMS: owned by Cara Lund (Acme). See [migration](fram-migration.md).[^m002][^m006]
- Hosting and DNS: owned by Per Hansen (Northwind).[^m002][^m006]
- Steering group meets every four weeks. The first meeting is 14 September 2026.[^m002][^m006]

## People
- Gunnar Holm: Head of Marketing, Northwind. He is the client sponsor and approved the budget.[^m002]
- Per Hansen: IT lead (IT-leder), Northwind. He owns hosting and DNS.[^m003]
- Cara Lund: Acme colleague. She owns the content migration.[^m002]
- Lise Berg: Procurement, Northwind. She issues the PO numbers needed for invoicing.[^m013]
- Mona Lie: Legal, Northwind. Wants Matomo analytics and approves the cookie banner. See [analytics and cookies](analytics-and-cookies.md).[^m024]

## Invoicing
- Every invoice to Northwind must carry a purchase order (PO) number.[^m013]
- The PO number for the relaunch is **PO-77120** (issued 2026-09-02). Put it on every invoice.[^m029]

## Analytics
- Plan for Matomo rather than Google Analytics; the cookie banner needs Mona Lie's approval before launch. See [analytics and cookies](analytics-and-cookies.md).[^m024]

## Open
- Hosting choice between Azure and AWS. Per Hansen recommends Azure (AWS ~15% cheaper but needs a new agreement); decision expected 14 September. See [hosting decision](hosting-decision.md).[^m033]
- Gunnar wants an October pilot of the product pages on staging before the full migration.[^m034]
- Fram API limit: pay 20,000 NOK a month or accept about three weeks' delay that puts the 1 March 2027 go-live at risk. To be raised at the 14 September steering group. See [migration](fram-migration.md).[^m026]

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"
[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"
[^m024]: m024, 2026-08-31, Mona Lie, "Analytics and cookies"
[^m026]: m026, 2026-09-01, Ana Berg, "Fram API limit – a choice for you"
[^m033]: m033, 2026-09-03, Per Hansen, "Sammenligning Azure og AWS"
[^m034]: m034, 2026-09-03, Gunnar Holm, "Pilot in October"
[^m029]: m029, 2026-09-02, Lise Berg, "PO for the relaunch"

=== personal/events.md ===
# Personal events and commitments

## Family
- Ana's mother turns 70. The celebration is Saturday 10 October 2026 at 13:00 at Frognerseteren. Ingrid Berg asks Ana to bring a cake.[^m020] It is a surprise: Ana must not tell her mother (Ingrid, 2026-09-05).[^m040]

## Bislett running club (Bislett løpeklubb)
- Oslo half marathon on Saturday 19 September 2026: the club is taking part. Registration closes 5 September 2026.[^m018]
- Ana asked Tone on 2026-09-04 to register her for the half marathon, with a goal of under 1:45. This was sent a day before registration closed; no confirmation is recorded yet.[^m036]
- Interval training every Tuesday at 18:00 from the clubhouse, until the race.[^m017]
- Tone Haug sends the club's messages.[^m017][^m018]

[^m017]: m017, 2026-08-28, Tone Haug, "Intervaller"
[^m018]: m018, 2026-08-29, Tone Haug, "Halvmaraton 19. september"
[^m036]: m036, 2026-09-04, Ana Berg, "Påmelding halvmaraton"
[^m040]: m040, 2026-09-05, Ingrid Berg, "Re: Mamma 70"
[^m020]: m020, 2026-08-30, Ingrid Berg, "Mamma 70"

=== personal/kitchen-renovation.md ===
# Kitchen renovation (private)

- Carpenter: Erik Dahl (Dahl Snekker). He can start on Monday 2 November 2026.[^m008]
- Quote: 85,000 NOK including materials, excluding an electrician.[^m008]
- Open: an electrician must be arranged separately. Ana has not yet accepted the quote.

[^m008]: m008, 2026-08-26, Erik Dahl, "Kjøkkenet"

=== personal/travel.md ===
# Travel

- Flight Oslo–Bergen (Nordfly) on Wednesday 9 September 2026 at 07:10. Booking reference QX7P2L.[^m037]

[^m037]: m037, 2026-09-04, Nordfly, "Kvittering: Oslo–Bergen 9. september"
