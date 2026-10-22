=== index.md ===
# Index

## Northwind
- [northwind/relaunch.md](northwind/relaunch.md): website relaunch project. Go-live, budget, governance, owners, invoicing rule, open items.
- [northwind/hosting-decision.md](northwind/hosting-decision.md): open decision between Azure and AWS, due 14 Sept 2026.
- [northwind/cms-migration.md](northwind/cms-migration.md): migration of about 1,200 pages from the Fram CMS. Owner, status, API rate limit.

## Fjord Bank
- [fjordbank/framework-agreement.md](fjordbank/framework-agreement.md): framework agreement with Acme. Price, renewal 1 Jan 2027, notice deadline, approval rule.
- [fjordbank/customer-portal-study.md](fjordbank/customer-portal-study.md): pre-study for a new customer portal. 180,000 NOK estimate, awaiting decision, open scope questions.

## Acme
- [acme/timesheets.md](acme/timesheets.md): weekly timesheet rules.

## People
- [people/gunnar-holm.md](people/gunnar-holm.md): Head of Marketing, Northwind. Relaunch sponsor.
- [people/per-hansen.md](people/per-hansen.md): IT lead, Northwind. Hosting and DNS owner.
- [people/cara-lund.md](people/cara-lund.md): Acme colleague. Content migration owner.
- [people/kari-lie.md](people/kari-lie.md): CFO, Fjord Bank. Signs orders over 100,000 NOK.
- [people/lars-moe.md](people/lars-moe.md): contact at Fram. Asked about the API rate limit.
- [people/lise-berg.md](people/lise-berg.md): procurement, Northwind. Requires a PO number on every invoice.
- [people/siri-dahl.md](people/siri-dahl.md): Digitaldirektør, Fjord Bank. Asked for the customer portal pre-study estimate.

=== log.md ===
# Log

- 2026-08-26: Learned from m002–m006, m009–m011 (Northwind kickoff and migration, Fjord Bank renewal, Acme timesheet rule). Skipped m001, m007 (newsletter and notifications) and m008 (private kitchen quote, not Acme work).
- 2026-08-30: Learned from m012, m013, m016 (Fjord Bank customer portal pre-study and estimate, Northwind PO number rule). Skipped m014, m015, m017–m021 (adverts, office and club notices, personal mail, newsletter, prize notice).

=== acme/timesheets.md ===
# Acme timesheets

- Timesheets are due every Friday by 15:00 [^m009].
- Hours are booked on the customer project, not on internal time [^m009].

[^m009]: m009, 2026-08-26, Acme, "Timelister"

=== fjordbank/customer-portal-study.md ===
# Fjord Bank customer portal pre-study

Client: Fjord Bank. Client contact: [Siri Dahl](../people/siri-dahl.md), Digitaldirektør [^m012]. Acme consultant: Ana Berg.

Status (as of 28 Aug 2026): estimate sent to Fjord Bank, awaiting their decision [^m016].

## Scope
- Pre-study (forstudie) for Fjord Bank's new customer portal, to be done in autumn 2026 [^m012].
- Two routes are being considered: build in-house, or buy a ready-made platform [^m012].
- Open: whether the mobile app is part of the pre-study [^m012].

## Estimate
- 180,000 NOK for the pre-study, over six weeks, with a proposed start on 21 September 2026 [^m016].
- This is above the 100,000 NOK limit in the [framework agreement](../fjordbank/framework-agreement.md), where every order over that amount must be signed by [Kari Lie](../people/kari-lie.md) [^m004]. Whether this work would be ordered under the framework is not yet recorded.

## Open
- Fjord Bank's decision on the estimate and the 21 Sept start.
- Build or buy.
- Whether the mobile app is in scope.

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"
[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"

=== fjordbank/framework-agreement.md ===
# Fjord Bank framework agreement with Acme

Client: Fjord Bank. Contact: [Kari Lie](../people/kari-lie.md), Finansdirektør.

## Current terms
- Price today: 1.2 million NOK per year [^m004].
- Renewal: 1 January 2027 [^m004].
- Notice: either party can give three months' notice. Any changes must be agreed before 1 October 2026 [^m004].
- Approval rule: every order over 100,000 NOK must be signed by Kari Lie [^m004].
- Related: Acme sent Fjord Bank a 180,000 NOK estimate for a customer portal pre-study on 28 Aug 2026. Above the approval threshold if ordered under this agreement. See [customer portal pre-study](customer-portal-study.md) [^m016].

## Open
- Whether any changes to the agreement are wanted for 2027. Must be agreed before 1 Oct 2026 [^m004].

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"

=== northwind/cms-migration.md ===
# Content migration from Fram CMS (Northwind)

Owner: [Cara Lund](../people/cara-lund.md) (Acme) [^m002] [^m005]. Part of [Northwind website relaunch](relaunch.md).

## Scope and order
- About 1,200 pages move from the old Fram CMS. Product pages go first, news last [^m005].

## Status (as of 26 Aug 2026)
- Cara has started the migration plan [^m005].
- Cara has admin access to Fram. The export API works, but slowly [^m011].

## Constraint
- Fram's API allows only 10 requests per second. This makes the bulk export slow [^m005] [^m011].

## Open
- Cara asked [Lars Moe](../people/lars-moe.md) at Fram whether the limit can be raised [^m005]. No answer is recorded yet.

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"

=== northwind/hosting-decision.md ===
# Northwind hosting decision: Azure or AWS

Status: **open**. Owner: [Per Hansen](../people/per-hansen.md) (Northwind IT lead). Decision expected at the steering group on 14 September 2026 [^m003].

## Options
- **Azure.** Northwind's IT team already runs Azure [^m003].
- **AWS.** Northwind procurement has received an offer from AWS [^m003].

## Reasoning so far
- Per Hansen is preparing a comparison of the two for the 14 Sept steering group [^m003]. The criteria he will use are not yet recorded.

Part of [Northwind website relaunch](relaunch.md).

[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"

=== northwind/relaunch.md ===
# Northwind website relaunch

Client: Northwind. Acme consultant: Ana Berg. Main contacts: [Gunnar Holm](../people/gunnar-holm.md) (Head of Marketing), [Per Hansen](../people/per-hansen.md) (IT lead). Acme colleague [Cara Lund](../people/cara-lund.md) owns the content migration.

## Key facts (current)
- Go-live: 1 March 2027 [^m002] [^m006]
- Budget: 450,000 NOK, approved by Gunnar Holm on 24 Aug 2026 [^m002] [^m006]
- Steering group meets every four weeks. First meeting: 14 September 2026 [^m002] [^m006]

## Ownership
- Content migration from the old Fram CMS: Cara Lund (Acme) [^m002] [^m005]
- Hosting and DNS on the Northwind side: Per Hansen [^m002] [^m003]

## Invoicing
- Every invoice needs a purchase order (PO) number from Northwind procurement, [Lise Berg](../people/lise-berg.md). Do not invoice before you have the PO number [^m013].

## Open
- Hosting platform, Azure or AWS, not yet decided. Per Hansen's comparison goes to the 14 Sept steering group. See [hosting decision](hosting-decision.md) [^m003]
- Whether Fram will raise its API rate limit. See [content migration](cms-migration.md) [^m005] [^m011]

## Meetings
- Kickoff held 24 Aug 2026. The recording was made available on 26 Aug and is deleted automatically after 30 days, around 25 Sept 2026 [^m010]

## Change history
- 24 Aug 2026: kickoff agreements recorded [^m002].
- 27 Aug 2026: invoicing rule added (PO number required on every invoice) [^m013].

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"
[^m010]: m010, 2026-08-26, Møterom, "Opptaket er klart: Northwind kickoff"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"
[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"

=== people/cara-lund.md ===
# Cara Lund

Colleague at Acme (cara@acme.test). Owns the content migration from the old Fram CMS for the [Northwind website relaunch](../northwind/relaunch.md) [^m002] [^m005]. Has admin access to Fram [^m011]. See [content migration](../northwind/cms-migration.md).

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"

=== people/gunnar-holm.md ===
# Gunnar Holm

Head of Marketing, Northwind. Sponsor of the [website relaunch](../northwind/relaunch.md). Approved the 450,000 NOK budget on 24 Aug 2026 [^m002] [^m006]. Chairs the steering group, which meets every four weeks from 14 Sept 2026 [^m002].

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"

=== people/kari-lie.md ===
# Kari Lie

Finansdirektør (CFO), Fjord Bank. Contact for the [Fjord Bank framework agreement](../fjordbank/framework-agreement.md). Must sign every order over 100,000 NOK [^m004].

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"

=== people/lars-moe.md ===
# Lars Moe

Contact at Fram (the old Northwind CMS vendor). Cara Lund asked him whether Fram can raise its API rate limit of 10 requests per second [^m005]. No answer recorded yet. See [content migration](../northwind/cms-migration.md).

[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"

=== people/lise-berg.md ===
# Lise Berg

Procurement, Northwind. Sets the invoicing rule for Acme's work on the [Northwind website relaunch](../northwind/relaunch.md): every invoice needs a purchase order (PO) number from her, and Acme must not invoice before it has one [^m013].

[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"

=== people/per-hansen.md ===
# Per Hansen

IT lead, Northwind. Owns hosting and DNS for the [website relaunch](../northwind/relaunch.md) on the Northwind side [^m002] [^m003]. Is preparing the Azure vs AWS comparison for the 14 Sept 2026 steering group [^m003]. See [hosting decision](../northwind/hosting-decision.md).

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"

=== people/siri-dahl.md ===
# Siri Dahl

Digitaldirektør (digital director), Fjord Bank. Asked Acme for an estimate for the pre-study of Fjord Bank's new customer portal [^m012]. Received Acme's estimate of 180,000 NOK on 28 Aug 2026 [^m016]. See [customer portal pre-study](../fjordbank/customer-portal-study.md).

[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"
