=== index.md ===
# Index

## Northwind
- [northwind/relaunch.md](northwind/relaunch.md): website relaunch project. Go-live, budget, governance, owners, invoicing rule and PO number, open items.
- [northwind/hosting-decision.md](northwind/hosting-decision.md): open decision between Azure and AWS, due 14 Sept 2026. Per Hansen recommends Azure.
- [northwind/cms-migration.md](northwind/cms-migration.md): migration of about 1,200 pages from the Fram CMS. Owner, status, API rate limit and the paid Enterprise option.
- [northwind/analytics-and-cookies.md](northwind/analytics-and-cookies.md): Matomo instead of Google Analytics, cookie banner approval before launch.

## Fjord Bank
- [fjordbank/framework-agreement.md](fjordbank/framework-agreement.md): framework agreement with Acme. Price, renewal 1 Jan 2027, notice deadline, approval rule, monthly invoicing from January.
- [fjordbank/customer-portal-study.md](fjordbank/customer-portal-study.md): pre-study for a new customer portal. 180,000 NOK, accepted 2 Sept 2026, starts 21 Sept. Open scope questions.

## Acme
- [acme/timesheets.md](acme/timesheets.md): weekly timesheet rules.

## People
- [people/gunnar-holm.md](people/gunnar-holm.md): Head of Marketing, Northwind. Relaunch sponsor. Decides the Fram API limit choice at the 14 Sept steering group.
- [people/per-hansen.md](people/per-hansen.md): IT lead, Northwind. Hosting and DNS owner.
- [people/cara-lund.md](people/cara-lund.md): Acme colleague. Content migration owner.
- [people/kari-lie.md](people/kari-lie.md): CFO, Fjord Bank. Signs orders over 100,000 NOK.
- [people/lars-moe.md](people/lars-moe.md): Account Manager, Fram CMS. Answered the API rate limit question on 31 Aug 2026.
- [people/lise-berg.md](people/lise-berg.md): procurement, Northwind. Requires a PO number on every invoice. Relaunch PO number PO-77120.
- [people/mona-lie.md](people/mona-lie.md): Legal, Northwind. Matomo requirement and cookie banner approval.
- [people/siri-dahl.md](people/siri-dahl.md): Digitaldirektør, Fjord Bank. Accepted the customer portal pre-study estimate on 2 Sept 2026.
- [people/jonas-vik.md](people/jonas-vik.md): developer at Acme, starts 14 Sept 2026, sits next to Ana Berg.

=== log.md ===
# Log

- 2026-08-26: Learned from m002–m006, m009–m011 (Northwind kickoff and migration, Fjord Bank renewal, Acme timesheet rule). Skipped m001, m007 (newsletter and notifications) and m008 (private kitchen quote, not Acme work).
- 2026-08-30: Learned from m012, m013, m016 (Fjord Bank customer portal pre-study and estimate, Northwind PO number rule). Skipped m014, m015, m017–m021 (adverts, office and club notices, personal mail, newsletter, prize notice).
- 2026-09-02: Learned from m023–m026, m028, m029 (Fram API rate limit options and prices, Northwind Legal analytics and cookie requirements, decision escalated to Gunnar Holm, Fjord Bank accepted the portal pre-study, relaunch PO number). Skipped m022, m030 (newsletters), m027 (community notification), m031 (timesheet reminder, already recorded in m009).
- 2026-09-06: Learned from m032–m035 (Fjord Bank monthly invoicing from January, Per Hansen's Azure vs AWS comparison and Azure recommendation, Gunnar Holm's October pilot, new Acme developer Jonas Vik from 14 Sept). Skipped m036–m041 (personal mail, running and travel notices, marketplace adverts, newsletter).

=== acme/timesheets.md ===
# Acme timesheets

- Timesheets are due every Friday by 15:00 [^m009].
- Hours are booked on the customer project, not on internal time [^m009].

[^m009]: m009, 2026-08-26, Acme, "Timelister"

=== fjordbank/customer-portal-study.md ===
# Fjord Bank customer portal pre-study

Client: Fjord Bank. Client contact: [Siri Dahl](../people/siri-dahl.md), Digitaldirektør [^m012]. Acme consultant: Ana Berg.

Status (as of 2 Sept 2026): Fjord Bank has accepted the estimate. They are going ahead with the pre-study as proposed, at 180,000 NOK, starting 21 September 2026 [^m028].

## Scope
- Pre-study (forstudie) for Fjord Bank's new customer portal, to be done in autumn 2026 [^m012].
- Two routes are being considered: build in-house, or buy a ready-made platform [^m012].
- Open: whether the mobile app is part of the pre-study. Siri Dahl says it is still open and she will come back on it [^m028].

## Estimate
- 180,000 NOK for the pre-study, over six weeks, with a proposed start on 21 September 2026 [^m016]. Accepted by Fjord Bank on 2 Sept 2026 [^m028].
- This is above the 100,000 NOK limit in the [framework agreement](../fjordbank/framework-agreement.md), where every order over that amount must be signed by [Kari Lie](../people/kari-lie.md) [^m004]. Whether this work is ordered under the framework is not yet recorded.

## Open
- Build or buy.
- Whether the mobile app is in scope.
- Whether the order goes under the framework agreement, and so needs Kari Lie's signature.

## Changes
- 28 Aug 2026: estimate sent to Fjord Bank, awaiting decision [^m016].
- 2 Sep 2026: Fjord Bank accepted the estimate and the 21 Sept start [^m028].

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"
[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"
[^m028]: m028, 2026-09-02, Siri Dahl, "Re: Forstudie kundeportal"

=== fjordbank/framework-agreement.md ===
# Fjord Bank framework agreement with Acme

Client: Fjord Bank. Contact: [Kari Lie](../people/kari-lie.md), Finansdirektør.

## Current terms
- Price today: 1.2 million NOK per year [^m004].
- Renewal: 1 January 2027 [^m004].
- Notice: either party can give three months' notice. Any changes must be agreed before 1 October 2026 [^m004].
- Approval rule: every order over 100,000 NOK must be signed by Kari Lie [^m004].
- Invoicing: from January (2027), Fjord Bank wants monthly invoices instead of quarterly, to fit its new budget system [^m032].
- Related: Acme sent Fjord Bank a 180,000 NOK estimate for a customer portal pre-study on 28 Aug 2026. Fjord Bank accepted it on 2 Sept 2026 [^m028]. Above the approval threshold if ordered under this agreement. See [customer portal pre-study](customer-portal-study.md) [^m016].

## Open
- Whether any changes to the agreement are wanted for 2027. Must be agreed before 1 Oct 2026 [^m004].

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"
[^m032]: m032, 2026-09-03, Kari Lie, "Fakturering fra januar"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"
[^m028]: m028, 2026-09-02, Siri Dahl, "Re: Forstudie kundeportal"

=== northwind/analytics-and-cookies.md ===
# Northwind analytics and cookies

Part of [Northwind website relaunch](relaunch.md). Legal review: [Mona Lie](../people/mona-lie.md) (Legal, Northwind).

## Decisions
- Analytics tool: Matomo, not Google Analytics. Northwind Legal prefers Matomo because it can run on Northwind's own servers, so no data goes to the US [^m024].
- Plan for Matomo in the new site [^m024].

## Open
- Cookie banner: needs Mona Lie's approval before launch [^m024].

[^m024]: m024, 2026-08-31, Mona Lie, "Analytics and cookies"

=== northwind/cms-migration.md ===
# Content migration from Fram CMS (Northwind)

Owner: [Cara Lund](../people/cara-lund.md) (Acme) [^m002] [^m005]. Part of [Northwind website relaunch](relaunch.md).

## Scope and order
- About 1,200 pages move from the old Fram CMS. Product pages go first, news last [^m005].
- Gunnar Holm wants a pilot in October with the product pages on staging, before everything else moves. If it goes well, the rest follows [^m034].

## Status (as of 2 Sept 2026)
- Cara has started the migration plan [^m005].
- Cara has admin access to Fram. The export API works, but slowly [^m011].

## Constraint: API rate limit
- Fram's API allows 10 requests per second on the Standard plan, which applies to all Standard customers [^m023] [^m005].
- The Enterprise plan allows 50 requests per second, for 20,000 NOK a month extra [^m023].
- At 10 requests per second the bulk export of the 1,200 pages takes about three weeks longer than planned [^m025]. This puts the 1 March 2027 go-live at risk [^m026].

## Open
- Decision: pay 20,000 NOK a month for the Enterprise plan, or accept a later migration. Ana Berg has asked [Gunnar Holm](../people/gunnar-holm.md) to decide at the steering group on 14 Sept 2026 [^m026].

## Changes
- 25 Aug 2026: Cara asked [Lars Moe](../people/lars-moe.md) at Fram whether the limit could be raised [^m005].
- 31 Aug 2026: Lars Moe answered with the Standard and Enterprise options and prices [^m023].
- 3 Sep 2026: Gunnar Holm asked for an October pilot with the product pages on staging [^m034].

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"
[^m023]: m023, 2026-08-31, Lars Moe, "API rate limit"
[^m025]: m025, 2026-09-01, Cara Lund, "Re: API rate limit"
[^m026]: m026, 2026-09-01, Ana Berg, "Fram API limit – a choice for you"
[^m034]: m034, 2026-09-03, Gunnar Holm, "Pilot in October"

=== northwind/hosting-decision.md ===
# Northwind hosting decision: Azure or AWS

Status: **open**. Owner: [Per Hansen](../people/per-hansen.md) (Northwind IT lead). Decision at the steering group on 14 September 2026 [^m003].

## Options
- **Azure.** Northwind's IT team already runs Azure. The Norwegian Azure region keeps the data in Norway [^m033].
- **AWS.** Northwind procurement has received an offer from AWS. It is about 15 percent cheaper per year, but it needs a new framework agreement and the team has to learn a new platform [^m033].

## Recommendation
- Per Hansen recommends Azure (3 Sept 2026) [^m033].
- Per Hansen notes that [Mona Lie](../people/mona-lie.md) in Legal gives weight to data staying in Norway, which favours Azure [^m033].

## Reasoning so far
- Per Hansen's comparison of the two goes to the 14 Sept steering group [^m003] [^m033].

Part of [Northwind website relaunch](relaunch.md).

[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m033]: m033, 2026-09-03, Per Hansen, "Sammenligning Azure og AWS"

=== northwind/relaunch.md ===
# Northwind website relaunch

Client: Northwind. Acme consultant: Ana Berg. Main contacts: [Gunnar Holm](../people/gunnar-holm.md) (Head of Marketing), [Per Hansen](../people/per-hansen.md) (IT lead), [Lise Berg](../people/lise-berg.md) (procurement), [Mona Lie](../people/mona-lie.md) (Legal). Acme colleague [Cara Lund](../people/cara-lund.md) owns the content migration.

## Key facts (current)
- Go-live: 1 March 2027 [^m002] [^m006]. At risk unless the Fram API limit is solved (see Open) [^m025] [^m026].
- Budget: 450,000 NOK, approved by Gunnar Holm on 24 Aug 2026 [^m002] [^m006]
- Steering group meets every four weeks. First meeting: 14 September 2026 [^m002] [^m006]
- Purchase order number for the relaunch: PO-77120 [^m029]

## Ownership
- Content migration from the old Fram CMS: Cara Lund (Acme) [^m002] [^m005]
- Hosting and DNS on the Northwind side: Per Hansen [^m002] [^m003]
- Legal review of analytics and cookies: Mona Lie (Northwind Legal) [^m024]

## Invoicing
- Every invoice needs a purchase order (PO) number from Northwind procurement, [Lise Berg](../people/lise-berg.md). Do not invoice before you have the PO number [^m013].
- Acme's PO number for the relaunch is PO-77120. Put it on every invoice [^m029].

## Analytics and cookies
- Use Matomo, not Google Analytics, per Northwind Legal [^m024]. Details in [analytics and cookies](analytics-and-cookies.md).
- The cookie banner needs Mona Lie's approval before launch [^m024].

## Open
- Fram API rate limit. The Standard plan allows 10 requests per second. The Enterprise plan allows 50 for 20,000 NOK a month extra [^m023]. At 10 requests per second the content migration takes about three weeks longer, which puts the 1 March go-live at risk [^m025]. Ana Berg has asked Gunnar Holm to choose between paying and moving the date, to be decided at the 14 Sept steering group [^m026]. See [content migration](cms-migration.md).
- Hosting platform, Azure or AWS, not yet decided. Per Hansen's comparison goes to the 14 Sept steering group, and he recommends Azure [^m033]. See [hosting decision](hosting-decision.md) [^m003]
- Cookie banner approval from Mona Lie before launch [^m024].

## Meetings
- Kickoff held 24 Aug 2026. The recording was made available on 26 Aug and is deleted automatically after 30 days, around 25 Sept 2026 [^m010]

## Change history
- 24 Aug 2026: kickoff agreements recorded [^m002].
- 27 Aug 2026: invoicing rule added (PO number required on every invoice) [^m013].
- 31 Aug 2026: Legal asked for Matomo instead of Google Analytics and a cookie banner approval before launch [^m024]. Fram confirmed the rate limit options [^m023].
- 1 Sep 2026: rate limit choice escalated to Gunnar Holm for the 14 Sept steering group [^m025] [^m026].
- 2 Sep 2026: PO number PO-77120 given by Lise Berg [^m029].
- 3 Sep 2026: Gunnar Holm asked for a pilot in October with the product pages on staging, before everything else moves [^m034]. Per Hansen recommended Azure over AWS [^m033].

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"
[^m010]: m010, 2026-08-26, Møterom, "Opptaket er klart: Northwind kickoff"
[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"
[^m023]: m023, 2026-08-31, Lars Moe, "API rate limit"
[^m024]: m024, 2026-08-31, Mona Lie, "Analytics and cookies"
[^m025]: m025, 2026-09-01, Cara Lund, "Re: API rate limit"
[^m026]: m026, 2026-09-01, Ana Berg, "Fram API limit – a choice for you"
[^m029]: m029, 2026-09-02, Lise Berg, "PO for the relaunch"
[^m033]: m033, 2026-09-03, Per Hansen, "Sammenligning Azure og AWS"
[^m034]: m034, 2026-09-03, Gunnar Holm, "Pilot in October"

=== people/cara-lund.md ===
# Cara Lund

Colleague at Acme (cara@acme.test). Owns the content migration from the old Fram CMS for the [Northwind website relaunch](../northwind/relaunch.md) [^m002] [^m005]. Has admin access to Fram [^m011]. See [content migration](../northwind/cms-migration.md).

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"

=== people/gunnar-holm.md ===
# Gunnar Holm

Head of Marketing, Northwind. Sponsor of the [website relaunch](../northwind/relaunch.md). Approved the 450,000 NOK budget on 24 Aug 2026 [^m002] [^m006]. Chairs the steering group, which meets every four weeks from 14 Sept 2026 [^m002]. Asked by Ana Berg on 1 Sept 2026 to decide at that meeting whether to pay Fram 20,000 NOK a month for a higher API limit or accept a later migration [^m026]. On 3 Sept 2026 he asked for an October pilot with the product pages on staging, before the rest of the migration [^m034]. See [content migration](../northwind/cms-migration.md).

[^m026]: m026, 2026-09-01, Ana Berg, "Fram API limit – a choice for you"

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"
[^m034]: m034, 2026-09-03, Gunnar Holm, "Pilot in October"

=== people/jonas-vik.md ===
# Jonas Vik

Developer at Acme. Starts on 14 September 2026 and sits next to Ana Berg [^m035]. Announced by [Cara Lund](cara-lund.md) on 3 Sept 2026 [^m035].

[^m035]: m035, 2026-09-03, Cara Lund, "New colleague"

=== people/kari-lie.md ===
# Kari Lie

Finansdirektør (CFO), Fjord Bank. Contact for the [Fjord Bank framework agreement](../fjordbank/framework-agreement.md). Must sign every order over 100,000 NOK [^m004].

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"

=== people/lars-moe.md ===
# Lars Moe

Account Manager, Fram CMS (the old Northwind CMS vendor) [^m023]. Cara Lund asked him whether Fram can raise its API rate limit [^m005]. On 31 Aug 2026 he answered: the limit of 10 requests per second applies to all Standard plan customers, and the Enterprise plan allows 50 requests per second for 20,000 NOK a month extra [^m023]. See [content migration](../northwind/cms-migration.md).

[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m023]: m023, 2026-08-31, Lars Moe, "API rate limit"

=== people/lise-berg.md ===
# Lise Berg

Procurement, Northwind. Sets the invoicing rule for Acme's work on the [Northwind website relaunch](../northwind/relaunch.md): every invoice needs a purchase order (PO) number from her, and Acme must not invoice before it has one [^m013]. Acme's PO number for the relaunch is PO-77120 [^m029].

[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"
[^m029]: m029, 2026-09-02, Lise Berg, "PO for the relaunch"

=== people/mona-lie.md ===
# Mona Lie

Legal, Northwind. Set Northwind's analytics requirement for the [website relaunch](../northwind/relaunch.md): use Matomo rather than Google Analytics [^m024]. Must approve the cookie banner before launch [^m024]. Per Hansen reports that she gives weight to data staying in Norway, which he cites in favour of Azure for hosting [^m033]. See [analytics and cookies](../northwind/analytics-and-cookies.md).

[^m024]: m024, 2026-08-31, Mona Lie, "Analytics and cookies"
[^m033]: m033, 2026-09-03, Per Hansen, "Sammenligning Azure og AWS"

=== people/per-hansen.md ===
# Per Hansen

IT lead, Northwind. Owns hosting and DNS for the [website relaunch](../northwind/relaunch.md) on the Northwind side [^m002] [^m003]. Is preparing the Azure vs AWS comparison for the 14 Sept 2026 steering group [^m003]. On 3 Sept 2026 he recommended Azure over AWS [^m033]. See [hosting decision](../northwind/hosting-decision.md).

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m033]: m033, 2026-09-03, Per Hansen, "Sammenligning Azure og AWS"

=== people/siri-dahl.md ===
# Siri Dahl

Digitaldirektør (digital director), Fjord Bank. Asked Acme for an estimate for the pre-study of Fjord Bank's new customer portal [^m012]. Received Acme's estimate of 180,000 NOK on 28 Aug 2026 [^m016]. On 2 Sept 2026 accepted it: the pre-study goes ahead as proposed, starting 21 September [^m028]. The mobile app question is still open [^m028]. See [customer portal pre-study](../fjordbank/customer-portal-study.md).

[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"
[^m028]: m028, 2026-09-02, Siri Dahl, "Re: Forstudie kundeportal"
