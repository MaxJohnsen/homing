=== index.md ===
# Index

- [northwind/website-relaunch.md](northwind/website-relaunch.md): Northwind relaunch project: go-live, budget, owners, steering group, people.
- [northwind/hosting-decision.md](northwind/hosting-decision.md): open choice between Azure and AWS, to be discussed 14 Sep.
- [northwind/fram-migration.md](northwind/fram-migration.md): migration of ~1,200 pages from Fram CMS, API rate-limit issue.
- [fjordbank/framework-agreement.md](fjordbank/framework-agreement.md): Fjord Bank agreement renewal 1 Jan 2027, price, notice, signing rule.
- [fjordbank/customer-portal-prestudy.md](fjordbank/customer-portal-prestudy.md): Fjord Bank portal pre-study, estimate 180,000 NOK, start 21 Sep, open scope question.
- [northwind/invoicing.md](northwind/invoicing.md): Northwind requires a PO number on every invoice.
- [personal/mother-70th-birthday.md](personal/mother-70th-birthday.md): mother's 70th, 10 Oct at Frognerseteren, Ana to bring cake.
- [personal/bislett-running-club.md](personal/bislett-running-club.md): club intervals Tuesdays, half marathon 19 Sep, sign-up by 5 Sep.
- [personal/kitchen-renovation.md](personal/kitchen-renovation.md): carpenter offer and start date for kitchen.
- [acme/timesheets.md](acme/timesheets.md): Acme timesheet deadline and rules.

=== log.md ===
# Log

- 2026-08-26: Learned from 11 emails (m001–m011): created pages on Northwind relaunch, hosting decision, Fram migration, Fjord Bank agreement, kitchen renovation, timesheets. Skipped newsletters/notifications (m001, m007, m010).
- 2026-08-30: Learned from 10 emails (m012–m021): created pages on Fjord Bank portal pre-study, Northwind invoicing (PO rule), mother's 70th, running club. Skipped ads/notifications/noise (m014, m015, m019, m021 – the gift card message looks like a scam).

=== acme/timesheets.md ===
# Acme timesheet rules

- Timesheets are due every Friday by 15:00.[^m009]
- Hours go on the client project, not on internal.[^m009]

[^m009]: m009, 2026-08-26, Acme admin, "Timelister"

=== fjordbank/customer-portal-prestudy.md ===
# Fjord Bank customer portal pre-study (forstudie kundeportal)

Contact: Siri Dahl, digital director (digitaldirektør), Fjord Bank.[^m012]

- Fjord Bank wants Acme to do the pre-study for its new customer portal this autumn and asked Ana for an estimate on 2026-08-27.[^m012]
- The study compares two routes: build the portal themselves, or buy a ready-made platform.[^m012]
- Estimate sent by Ana on 2026-08-28: 180,000 NOK for the pre-study, over six weeks, starting 21 September 2026 if that suits Fjord Bank.[^m016]

## Open
- Whether the mobile app is part of the pre-study is not settled; it was not clear in Siri's request, and the estimate does not say.[^m012][^m016]
- Siri has not yet answered the estimate or the start date in the emails seen.

See also the [framework agreement](framework-agreement.md) with Fjord Bank (different contact: Kari Lie).

[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"

=== fjordbank/framework-agreement.md ===
# Fjord Bank framework agreement (rammeavtale) 2027

Contact: Kari Lie, finance director (finansdirektør), Fjord Bank.[^m004]

- The agreement with Acme renews on 1 January 2027.[^m004]
- Current price: 1.2 million NOK per year.[^m004]
- Either party can terminate with three months' notice, so any changes must be agreed before 1 October 2026.[^m004]
- Rule: every order above 100,000 NOK must be signed by Kari Lie.[^m004]

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"

=== northwind/fram-migration.md ===
# Fram CMS content migration

Owner: Cara Lund. Part of the [website relaunch](website-relaunch.md).

- Scope: about 1,200 pages move from the old Fram CMS. Order: product pages first, news last.[^m005]
- Problem: Fram's API allows only 10 requests per second, so the bulk export is slow. On 2026-08-25 Cara asked Lars Moe at Fram whether the limit can be raised. No answer yet in the emails.[^m005]
- Update 2026-08-26: Cara now has admin access to Fram. The export API works, but slowly.[^m011]

## Open
- Whether Fram will raise the rate limit.[^m005][^m011]

[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"

=== northwind/hosting-decision.md ===
# Northwind hosting decision (Azure vs AWS)

**Status: open.** Hosting for the new website must be chosen between Azure and AWS.[^m003]

- Argument for Azure: Northwind's IT team already runs Azure.[^m003]
- Argument for AWS: Northwind's purchasing department has received an offer from AWS.[^m003]
- Per Hansen (owner of hosting and DNS) is preparing a comparison for the steering group meeting on 14 September 2026, where the decision is expected.[^m003]

See [website relaunch](website-relaunch.md).

[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"

=== northwind/invoicing.md ===
# Northwind invoicing rules

- Northwind requires a purchase order (PO) number on every invoice. Ana must not invoice before she has a PO number from Lise Berg (Procurement, Northwind).[^m013]

Related: [website relaunch](website-relaunch.md).

[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"

=== northwind/website-relaunch.md ===
# Northwind website relaunch

Acme project for Northwind, kicked off 2026-08-24.

## Agreed at kickoff
- Go-live: 1 March 2027.[^m002][^m006]
- Budget: 450,000 NOK, approved by Gunnar Holm on 2026-08-24.[^m002][^m006]
- Content migration from the old Fram CMS is owned by Cara Lund (Acme).[^m002][^m006]
- Hosting and DNS are owned by Per Hansen (Northwind).[^m002][^m006]
- Steering group meets every four weeks; the first meeting is 14 September 2026.[^m002][^m006]

## People
- Gunnar Holm: Head of Marketing, Northwind. Approved the budget.[^m002]
- Per Hansen: IT lead (IT-leder), Northwind. Owns hosting and DNS.[^m003]
- Cara Lund: Acme colleague, owns content migration.[^m002]
- Lars Moe: contact at Fram (the CMS vendor).[^m005]

## Related
- [Hosting decision](hosting-decision.md) (open)
- [Fram content migration](fram-migration.md)

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"

=== personal/bislett-running-club.md ===
# Bislett løpeklubb (running club)

Coordinator: Tone Haug.

- Interval training every Tuesday at 18:00 from the clubhouse, until the race.[^m017]
- The club runs Oslo half marathon on Saturday 19 September 2026. Registration closes 5 September 2026, so sign-up is needed soon.[^m018]

## Open
- Whether Ana has registered is not known from the emails.

[^m017]: m017, 2026-08-28, Tone Haug, "Intervaller"
[^m018]: m018, 2026-08-29, Tone Haug, "Halvmaraton 19. september"

=== personal/kitchen-renovation.md ===
# Kitchen renovation (Erik Dahl, carpenter)

- Erik Dahl (snekker) visited for an inspection and can start on Monday 2 November 2026.[^m008]
- Offer: 85,000 NOK including materials, excluding electrician.[^m008]

## Open
- Ana has not yet accepted the offer in the emails seen.
- The electrician is not included and must be arranged separately.[^m008]

[^m008]: m008, 2026-08-26, Erik Dahl, "Kjøkkenet"

=== personal/mother-70th-birthday.md ===
# Mother's 70th birthday

- Celebration on Saturday 10 October 2026 at 13:00 at Frognerseteren.[^m020]
- Ingrid Berg (family) asks Ana to bring a cake.[^m020]

## Open
- Ana has not confirmed or answered about the cake in the emails seen.

[^m020]: m020, 2026-08-30, Ingrid Berg, "Mamma 70"
