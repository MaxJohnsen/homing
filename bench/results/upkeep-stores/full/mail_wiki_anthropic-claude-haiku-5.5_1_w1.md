=== index.md ===
# Index

- [northwind/relaunch.md](northwind/relaunch.md): Northwind website relaunch. Key dates, budget, owners, invoicing rule, open items.
- [northwind/hosting-decision.md](northwind/hosting-decision.md): Azure vs AWS hosting choice for the relaunch. Open.
- [northwind/fram-migration.md](northwind/fram-migration.md): migration of about 1,200 pages from the Fram CMS, API rate limit, status.
- [fjordbank/framework-agreement.md](fjordbank/framework-agreement.md): Fjord Bank framework agreement with Acme. Price, renewal, notice, signing rule.
- [fjordbank/kundeportal-feasibility.md](fjordbank/kundeportal-feasibility.md): Fjord Bank customer portal feasibility study. Estimate 180,000 NOK, start date and scope open.
- [home/kitchen-renovation.md](home/kitchen-renovation.md): kitchen renovation quote from Erik Dahl (personal).
- [home/mamma-70.md](home/mamma-70.md): Mamma's 70th birthday party, 10 October 2026 (personal).
- [home/bislett-running-club.md](home/bislett-running-club.md): running club training and half marathon sign-up deadline, 5 September (personal).
- [people/gunnar-holm.md](people/gunnar-holm.md): Head of Marketing, Northwind; steering group contact.
- [people/per-hansen.md](people/per-hansen.md): IT manager, Northwind; hosting and DNS owner.
- [people/cara-lund.md](people/cara-lund.md): Acme colleague; content migration owner.
- [people/lise-berg.md](people/lise-berg.md): Procurement, Northwind; issues purchase order numbers for invoices.
- [people/siri-dahl.md](people/siri-dahl.md): Digitaldirektør, Fjord Bank; customer portal study contact.

=== log.md ===
# Log

- 2026-08-30: Learned from m012, m013, m016–m018, m020. Added Fjord Bank customer portal feasibility study (estimate 180,000 NOK, start 21 September proposed), Lise Berg invoicing rule (PO number), Siri Dahl and Lise Berg people pages, Mamma 70 party, running club sign-up deadline. Skipped adverts, notifications, newsletters and office notices: m014, m015, m019, m021.

- 2026-08-26: Learned from m002–m011. Added Northwind relaunch pages (kickoff facts, hosting, Fram migration), Fjord Bank framework agreement, kitchen quote, and people pages. Skipped newsletters and notifications: m001, m007, m009, m010.

=== fjordbank/framework-agreement.md ===
# Fjord Bank: framework agreement with Acme

Client: Fjord Bank. Contact: Kari Lie, Finance Director [^m004].

## Current terms

- **Price today:** 1.2 million NOK per year [^m004].
- **Renewal:** the agreement renews on 1 January 2027 [^m004].
- **Notice:** either party can terminate with three months' notice [^m004].
- **Changes:** any changes must be agreed before 1 October 2026, so that they can take effect at renewal [^m004].
- **Approval:** every order over 100,000 NOK must be signed by Kari Lie [^m004].

## Open

- Whether to change any terms for 2027. Must be settled by 1 October 2026 [^m004].

## Sources

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"

=== fjordbank/kundeportal-feasibility.md ===
# Fjord Bank: customer portal feasibility study (forstudie)

Client: Fjord Bank. Contact: Siri Dahl, Digitaldirektør ([[people/siri-dahl]]) [^m012].

## Request

- Fjord Bank wants Acme to do a feasibility study for its new customer portal this autumn [^m012].
- Two routes are being considered: build it in-house, or buy a ready-made platform [^m012].
- Open scope question: unclear whether the mobile app is part of the study [^m012].

## Estimate (sent)

- **Price:** 180,000 NOK for the study [^m016].
- **Duration:** six weeks [^m016].
- **Proposed start:** 21 September 2026, "if that suits you" [^m016]. Not yet confirmed by Fjord Bank.

## Open

- Confirm the start date of 21 September 2026 [^m016].
- Decide whether the mobile app is in scope [^m012].
- Check whether the order needs Kari Lie's signature. Under the framework agreement, every order over 100,000 NOK must be signed by her [^m004][^m016]. See [[fjordbank/framework-agreement]].

## Sources

[^m004]: m004, 2026-08-25, Kari Lie, "Avtalen for 2027"
[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
[^m016]: m016, 2026-08-28, Ana Berg, "Re: Forstudie kundeportal"

=== home/bislett-running-club.md ===
# Bislett løpeklubb (running club, personal)

Ana is a member. Contact: Tone Haug [^m017][^m018].

- Interval training every Tuesday at 18:00 from the club house, until the race [^m017].
- Club entry for Oslo halvmaraton (half marathon) on Saturday 19 September 2026. **Registration closes 5 September 2026** [^m018].

## Sources

[^m017]: m017, 2026-08-28, Tone Haug, "Intervaller"
[^m018]: m018, 2026-08-29, Tone Haug, "Halvmaraton 19. september"

=== home/kitchen-renovation.md ===
# Kitchen renovation (personal)

Carpenter: Erik Dahl [^m008].

## Quote

- Price: 85,000 NOK including materials, excluding electrician [^m008].
- Earliest start: Monday 2 November 2026 [^m008].
- Electrician work is not included and must be arranged separately [^m008].

## Status

- Quote received 26 August 2026 after a site visit [^m008]. No decision recorded yet.

## Sources

[^m008]: m008, 2026-08-26, Erik Dahl, "Kjøkkenet"

=== home/mamma-70.md ===
# Mamma's 70th birthday (personal)

Mamma (Ingrid Berg's mother) turns 70. Family celebration: Saturday 10 October 2026 at 13:00 at Frognerseteren [^m020].

- Ana is asked to bring a cake [^m020].

## Sources

[^m020]: m020, 2026-08-30, Ingrid Berg, "Mamma 70"

=== northwind/fram-migration.md ===
# Northwind: content migration from Fram CMS

Owner: Cara Lund ([[people/cara-lund]]) [^m002][^m005]. Part of [[northwind/relaunch]].

## Scope

- About 1,200 pages move from the old Fram CMS [^m005].
- Order: product pages first, news last [^m005].

## Constraint

- Fram's API allows 10 requests per second, which makes the bulk export slow [^m005].
- Cara asked Lars Moe at Fram whether the limit can be raised [^m005]. **Open:** no answer recorded yet.

## Status

- 26 August 2026: Cara has admin access to Fram. The export API works, only slowly [^m011].

## Sources

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"

=== northwind/hosting-decision.md ===
# Northwind relaunch: hosting decision

Status: **open.** No choice made yet.

## Options

- **Azure:** Northwind's IT team already runs Azure [^m003].
- **AWS:** Northwind's procurement has received an offer from AWS [^m003].

## Process

- Per Hansen ([[people/per-hansen]]) is preparing a comparison of the two for the steering group on 14 September 2026 [^m003][^m002].
- Hosting and DNS are owned by Per Hansen [^m002].

Part of [[northwind/relaunch]].

## Sources

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"

=== northwind/relaunch.md ===
# Northwind website relaunch

Client: Northwind. Northwind contact: Gunnar Holm, Head of Marketing ([[people/gunnar-holm]]). Acme team: Ana Berg (lead consultant), Cara Lund (content migration, [[people/cara-lund]]). Northwind IT: Per Hansen ([[people/per-hansen]]).

## Key facts (current)

- **Go-live:** 1 March 2027 [^m002][^m006]
- **Budget:** 450,000 NOK. Gunnar Holm approved it on 24 August 2026 [^m002][^m006]
- **Steering group:** meets every four weeks. First meeting 14 September 2026 [^m002][^m006]
- **Hosting and DNS:** owned by Per Hansen on the Northwind side [^m002]
- **Invoicing:** every Acme invoice needs a purchase order number from Lise Berg, Northwind procurement ([[people/lise-berg]]). Do not invoice before the PO number is received [^m013].
- **Content migration:** owned by Cara Lund. About 1,200 pages move from the old Fram CMS, product pages first, news last [^m002][^m005]. Details in [[northwind/fram-migration]].

## Open items

- **Hosting choice, Azure or AWS:** not decided. Per Hansen is preparing a comparison for the steering group on 14 September [^m003]. See [[northwind/hosting-decision]].
- **Fram API rate limit:** Cara has asked Fram whether the limit of 10 requests per second can be raised. No answer recorded yet [^m005]. See [[northwind/fram-migration]].

## Sources

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"
[^m005]: m005, 2026-08-25, Cara Lund, "Migration plan"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"
[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"

=== people/cara-lund.md ===
# Cara Lund

Acme colleague of Ana Berg. Owns the content migration from the Fram CMS on the Northwind website relaunch ([[northwind/relaunch]], [[northwind/fram-migration]]) [^m002][^m006].

- Has admin access to Fram as of 26 August 2026 [^m011].

## Sources

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m006]: m006, 2026-08-25, Cara Lund, "My notes from the kickoff"
[^m011]: m011, 2026-08-26, Cara Lund, "Fram access"

=== people/gunnar-holm.md ===
# Gunnar Holm

Head of Marketing, Northwind. Ana Berg's main contact on the website relaunch ([[northwind/relaunch]]) [^m002].

- Approved the 450,000 NOK budget on 24 August 2026 [^m002].
- Chairs the steering group, which meets every four weeks from 14 September 2026 [^m002].

## Sources

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"

=== people/lise-berg.md ===
# Lise Berg

Procurement, Northwind. Sets the invoicing rule for the website relaunch ([[northwind/relaunch]]): every invoice needs a purchase order (PO) number from her before Acme invoices [^m013].

## Sources

[^m013]: m013, 2026-08-27, Lise Berg, "Purchase orders"

=== people/per-hansen.md ===
# Per Hansen

IT manager, Northwind. Owns hosting and DNS for the website relaunch ([[northwind/relaunch]]) [^m002][^m003].

- Preparing the Azure vs AWS comparison for the steering group on 14 September 2026 [^m003]. See [[northwind/hosting-decision]].

## Sources

[^m002]: m002, 2026-08-24, Gunnar Holm, "Kickoff summary: website relaunch"
[^m003]: m003, 2026-08-24, Per Hansen, "Hosting – to alternativer"

=== people/siri-dahl.md ===
# Siri Dahl

Digitaldirektør (digital director), Fjord Bank. Asked Acme for an estimate on the customer portal feasibility study ([[fjordbank/kundeportal-feasibility]]) [^m012].

- Not to be confused with Erik Dahl, the carpenter in [[home/kitchen-renovation]].

## Sources

[^m012]: m012, 2026-08-27, Siri Dahl, "Forstudie kundeportal"
