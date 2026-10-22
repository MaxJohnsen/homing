// Benchmark 0, scenario 1: eight weeks of a consultant's mail, and what she should know at the end
// of each week. Written before any approach ran, and not changed to suit a result.
//
// Ana Berg is a consultant at Acme in Oslo. Her clients are Northwind, whose website relaunch she
// runs, Fjord Bank, with a framework agreement up for renewal and a customer portal pre-study, and
// Havbris, whose maintenance agreement ends. She also has a kitchen renovation, a half marathon and
// a family. Facts change: dates move, people leave, decisions are reversed, a colleague gets the
// date wrong, a hint isn't a decision. Newsletters and notifications come in between.

import type { Fact } from './benchmarks.ts';

export interface Email {
  id: string;
  /** When it arrived, in Oslo time. */
  at: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  kind: 'work' | 'personal' | 'noise';
  /** A name for the emails the questions cite, so their ids can follow the order. */
  key?: string;
}

const ana = 'Ana Berg <ana@acme.test>';
const cara = 'Cara Lund <cara@acme.test>';
const jonas = 'Jonas Vik <jonas@acme.test>';
const acme = 'Acme <admin@acme.test>';
const gunnar = 'Gunnar Holm <gunnar.holm@northwind.test>';
const per = 'Per Hansen <per.hansen@northwind.test>';
const ola = 'Ola Nordmann <ola.nordmann@northwind.test>';
const mona = 'Mona Lie <mona.lie@northwind.test>';
const lise = 'Lise Berg <lise.berg@northwind.test>';
const lars = 'Lars Moe <lars.moe@framcms.test>';
const kari = 'Kari Lie <kari.lie@fjordbank.test>';
const siri = 'Siri Dahl <siri.dahl@fjordbank.test>';
const marte = 'Marte Lien <marte@havbris.test>';
const erik = 'Erik Dahl <erik@dahlsnekker.test>';
const ingrid = 'Ingrid Berg <ingrid.berg@epost.test>';
const tone = 'Tone Haug <tone@bislettlk.test>';
const erlend = 'Erlend Strand <erlend.strand@cloudpartner.test>';
const dentist = 'Tannlegene på Majorstuen <time@tannlegene.test>';
const utvikler = 'Utviklerposten <nyhetsbrev@utviklerposten.test>';
const techWeekly = 'Tech Weekly <hello@techweekly.test>';
const nettverk = 'Nettverk <varsler@nettverk.test>';
const lopelogg = 'Løpelogg <no-reply@lopelogg.test>';
const moterom = 'Møterom <no-reply@moterom.test>';
const torget = 'Torget <agent@torget.test>';
const calendar = 'Kalender <calendar@acme.test>';

type Row = [at: string, from: string, to: string, subject: string, body: string, kind: Email['kind'], key?: string];

/** The mail, in the order it arrived. Ids are given in that order: m001, m002, … */
const rows: Row[] = [
  // Week 1, 24 to 30 August.
  ['2026-08-24 08:05', utvikler, ana, 'Ukas viktigste: ny Postgres-beta og jobbtips', 'Denne uka: Postgres 19 beta 2, en guide til kodegjennomgang, og 40 nye utviklerjobber i Oslo. God lesing!', 'noise'],
  [
    '2026-08-24 14:30',
    gunnar,
    `${ana}, cc ${cara}`,
    'Kickoff summary: website relaunch',
    'Hi Ana,\n\nThanks for a good kickoff today. To sum up what we agreed:\n\n- The new website goes live on 1 March 2027.\n- The budget is 450,000 NOK, which I approved this morning.\n- Cara owns the content migration from the old Fram CMS.\n- Per Hansen owns hosting and DNS on our side.\n- We meet as a steering group every four weeks. The first meeting is on 14 September.\n\nBest,\nGunnar Holm\nHead of Marketing, Northwind',
    'work',
    'kickoff',
  ],
  [
    '2026-08-24 16:02',
    per,
    ana,
    'Hosting – to alternativer',
    'Hei Ana.\n\nSom nevnt på kickoff må vi velge mellom Azure og AWS for hostingen av det nye nettstedet. IT-teamet vårt drifter allerede Azure, men innkjøp har fått et tilbud fra AWS. Jeg lager en sammenligning til styringsgruppen 14. september.\n\nMvh\nPer Hansen\nIT-leder, Northwind',
    'work',
    'per-hosting',
  ],
  [
    '2026-08-25 09:40',
    kari,
    ana,
    'Avtalen for 2027',
    'Hei Ana,\n\nBare en påminnelse om at rammeavtalen vår med Acme fornyes 1. januar 2027. Prisen i dag er 1,2 millioner kroner i året. Begge parter kan si opp med tre måneders varsel, så eventuelle endringer må vi bli enige om før 1. oktober.\n\nOg husk: alle bestillinger over 100 000 kroner må signeres av meg.\n\nHilsen\nKari Lie\nFinansdirektør, Fjord Bank',
    'work',
    'kari-2027',
  ],
  [
    '2026-08-25 11:15',
    cara,
    ana,
    'Migration plan',
    "Ana,\n\nI've started the migration plan. About 1,200 pages move from the old Fram CMS. Product pages go first, news last.\n\nOne worry: Fram's API only allows 10 requests a second, which makes the bulk export slow. I've asked Lars Moe at Fram whether they can raise it.\n\nCara",
    'work',
    'migration-plan',
  ],
  [
    '2026-08-25 12:40',
    cara,
    ana,
    'My notes from the kickoff',
    'For the record, my notes from yesterday: go-live 1 March 2027, budget 450k approved by Gunnar, I own the migration, Per owns hosting and DNS. Steering group every four weeks from 14 September.',
    'work',
    'cara-kickoff',
  ],
  ['2026-08-25 13:00', nettverk, ana, 'Du dukket opp i 14 søk denne uka', 'Se hvem som har sett på profilen din, og få flere treff med Nettverk Premium.', 'noise'],
  [
    '2026-08-26 07:30',
    erik,
    ana,
    'Kjøkkenet',
    'Hei Ana!\n\nTakk for befaringen. Jeg kan starte på kjøkkenet mandag 2. november. Tilbudet blir 85 000 kroner inkludert materialer, men eksklusive elektriker.\n\nHilsen\nErik Dahl, snekker',
    'personal',
    'erik-kitchen',
  ],
  ['2026-08-26 10:20', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00. Timer føres på kundeprosjektet, ikke på internt.', 'noise'],
  ['2026-08-26 15:45', moterom, ana, 'Opptaket er klart: Northwind kickoff', 'Skyopptaket av møtet «Northwind kickoff» er klart. Det slettes automatisk om 30 dager.', 'noise'],
  [
    '2026-08-27 09:05',
    siri,
    ana,
    'Forstudie kundeportal',
    'Hei Ana.\n\nVi vil gjerne at Acme gjør forstudien for den nye kundeportalen vår i høst. Vi ser på to veier: bygge selv eller kjøpe en ferdig plattform. Det er ikke avklart om mobilappen skal være med i forstudien.\n\nKan du sende et estimat?\n\nHilsen\nSiri Dahl\nDigitaldirektør, Fjord Bank',
    'work',
    'siri-prestudy',
  ],
  [
    '2026-08-27 10:30',
    lise,
    ana,
    'Purchase orders',
    "Hello Ana,\n\nA reminder that Northwind needs a purchase order number on every invoice. Please don't invoice before you have a PO number from me.\n\nRegards,\nLise Berg\nProcurement, Northwind",
    'work',
    'lise-po',
  ],
  ['2026-08-27 18:10', torget, ana, 'Nye treff: spisebord', '3 nye annonser matcher søket ditt «spisebord eik». Se dem på Torget.', 'noise'],
  ['2026-08-28 08:00', acme, 'Alle i Acme', 'Fredagsfrokost', 'Frokost i kantina kl. 8.30 i dag. Velkommen!', 'noise'],
  [
    '2026-08-28 12:10',
    ana,
    siri,
    'Re: Forstudie kundeportal',
    'Hei Siri,\n\nEstimatet vårt er 180 000 kroner for forstudien, over seks uker, med oppstart 21. september hvis det passer dere.\n\nHilsen Ana',
    'work',
    'ana-estimate',
  ],
  [
    '2026-08-29 09:00',
    tone,
    'Bislett løpeklubb',
    'Halvmaraton 19. september',
    'Hei alle!\n\nKlubben stiller i Oslo halvmaraton lørdag 19. september. Påmeldingen stenger 5. september, så meld dere på nå.\n\nTone',
    'personal',
  ],
  ['2026-08-29 20:00', techWeekly, ana, 'The week in tech: chips, courts and a new phone', 'This week: a new chip factory, a court ruling on app stores, and our review of the latest phone.', 'noise'],
  [
    '2026-08-30 11:20',
    ingrid,
    ana,
    'Mamma 70',
    'Hei!\n\nMamma fyller 70, og vi feirer lørdag 10. oktober kl. 13 på Frognerseteren. Kan du ta med kake?\n\nKlem Ingrid',
    'personal',
    'birthday',
  ],
  ['2026-08-30 19:00', 'Premieavdelingen <vinner@gaver.test>', ana, 'Gratulerer! Du har vunnet et gavekort', 'Klikk her innen 24 timer for å hente gavekortet ditt på 5 000 kroner.', 'noise'],

  // Week 2, 31 August to 6 September.
  ['2026-08-31 08:05', utvikler, ana, 'Ukas viktigste: TypeScript 7 og sikkerhetsoppdateringer', 'Denne uka: TypeScript 7 er ute, tre kritiske sikkerhetshull, og hvordan du skriver bedre commit-meldinger.', 'noise'],
  [
    '2026-08-31 09:30',
    lars,
    `${cara}, cc ${ana}`,
    'API rate limit',
    'Hi Cara,\n\nI checked with our product team. The limit of 10 requests per second applies to all customers on the Standard plan. We can raise it to 50 requests per second on the Enterprise plan, which costs 20,000 NOK a month extra.\n\nLet me know.\n\nLars Moe\nAccount Manager, Fram CMS',
    'work',
    'lars-api',
  ],
  [
    '2026-08-31 11:00',
    mona,
    ana,
    'Analytics and cookies',
    'Ana,\n\nAbout analytics on the new site: legal prefers Matomo over Google Analytics, because Matomo can run on our own servers and no data goes to the US. Please plan for Matomo.\n\nThe cookie banner will need my approval before launch.\n\nMona Lie\nLegal, Northwind',
    'work',
    'mona-matomo',
  ],
  [
    '2026-09-01 08:45',
    cara,
    ana,
    'Re: API rate limit',
    'Ana, 20,000 a month for the Enterprise plan is a lot. At 10 requests a second the bulk export of the 1,200 pages takes about three weeks longer than planned. Should we ask Gunnar whether he would rather pay or move the date?\n\nCara',
    'work',
    'cara-api',
  ],
  [
    '2026-09-01 10:10',
    ana,
    gunnar,
    'Fram API limit – a choice for you',
    "Hi Gunnar,\n\nFram's API limit slows our content migration. There are two options: pay Fram 20,000 NOK a month for a higher limit, or accept that the migration takes about three weeks longer, which puts the 1 March go-live at risk.\n\nCould we discuss it at the steering group on 14 September?\n\nAna",
    'work',
    'ana-choice',
  ],
  ['2026-09-01 13:30', nettverk, ana, 'Cara Lund kommenterte et innlegg', 'Cara Lund kommenterte: «Godt poeng om innholdsmigrering!» Se hele diskusjonen.', 'noise'],
  [
    '2026-09-02 09:15',
    siri,
    ana,
    'Re: Forstudie kundeportal',
    'Takk for estimatet. Vi går for forstudien som foreslått, 180 000 kroner, med oppstart 21. september.\n\nMobilappen er fortsatt et åpent spørsmål. Jeg kommer tilbake til det.\n\nSiri',
    'work',
    'siri-accept',
  ],
  ['2026-09-02 14:00', techWeekly, ana, 'The week in tech: an outage and a merger', 'This week: a cloud outage took down a dozen apps, and two chat startups merged.', 'noise'],
  ['2026-09-02 16:20', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  [
    '2026-09-03 08:50',
    kari,
    ana,
    'Fakturering fra januar',
    'Hei Ana.\n\nFra januar ønsker vi månedlige fakturaer i stedet for kvartalsvise, slik at det passer med det nye budsjettsystemet vårt.\n\nKari',
    'work',
    'kari-monthly',
  ],
  [
    '2026-09-03 11:40',
    per,
    ana,
    'Sammenligning Azure og AWS',
    'Hei Ana,\n\nHer er hovedpunktene til styringsgruppen.\n\nAWS er rundt 15 prosent billigere i året, men krever en ny rammeavtale og at teamet lærer en ny plattform. Azure drifter vi allerede, og Azure-regionen i Norge holder dataene i landet, noe Mona i juridisk legger vekt på.\n\nMin anbefaling er Azure.\n\nPer',
    'work',
    'per-compare',
  ],
  [
    '2026-09-03 13:20',
    gunnar,
    ana,
    'Pilot in October',
    "Ana, let's do a pilot with the product pages on staging in October before we move everything. If it goes well, the rest follows.\n\nGunnar",
    'work',
  ],
  ['2026-09-03 15:05', cara, ana, 'New colleague', "Jonas Vik starts with us on 14 September as a developer. He'll sit next to you.", 'work'],
  ['2026-09-04 07:55', ana, tone, 'Påmelding halvmaraton', 'Hei Tone, meld meg på halvmaraton 19. september. Målet er under 1:45. Ana', 'personal'],
  ['2026-09-04 12:30', 'Nordfly <kvittering@nordfly.test>', ana, 'Kvittering: Oslo–Bergen 9. september', 'Takk for bestillingen. Oslo–Bergen onsdag 9. september kl. 07.10. Bestillingsnummer QX7P2L.', 'noise'],
  ['2026-09-04 17:00', lopelogg, ana, 'Uka di: 32 km', 'Du løp 32 km denne uka, 4 km mer enn forrige uke. Bra jobba!', 'noise'],
  ['2026-09-05 10:00', torget, ana, 'Nye treff: spisebord', '2 nye annonser matcher søket ditt «spisebord eik».', 'noise'],
  ['2026-09-06 18:30', techWeekly, ana, 'Weekend reading', 'Five long reads for your weekend, from batteries to bird migration.', 'noise'],

  // Week 3, 7 to 13 September.
  ['2026-09-07 08:05', utvikler, ana, 'Ukas viktigste: nye regler for KI-merking', 'Denne uka: EU-regler for merking av KI-innhold, og hvorfor alle snakker om små språkmodeller.', 'noise'],
  [
    '2026-09-07 09:20',
    marte,
    ana,
    'Vedlikeholdsavtalen',
    'Hei Ana.\n\nBare så du vet: vi har bestemt at vedlikeholdsavtalen med Acme for nettsidene våre avsluttes 30. september. Vi tar driften inn i eget team fra oktober.\n\nTakk for samarbeidet så langt!\n\nMarte Lien\nHavbris',
    'work',
    'havbris-end',
  ],
  [
    '2026-09-07 13:45',
    mona,
    ana,
    'Cookie banner',
    "Ana,\n\nI've reviewed the draft cookie banner. I can approve it on one condition: the 'Reject all' button must be as visible as 'Accept all', with the same size and color. Send me the revised design when it's ready.\n\nMona",
    'work',
    'mona-cookie',
  ],
  [
    '2026-09-08 08:30',
    gunnar,
    ana,
    'Re: Fram API limit – a choice for you',
    "Ana, I don't want to pay 20,000 a month for a temporary need. Let's see what Lars can do, and decide at the steering group.\n\nGunnar",
    'work',
    'gunnar-nopay',
  ],
  ['2026-09-08 09:00', calendar, ana, 'Invitation: Steering group – Northwind relaunch', 'Monday 14 September, 10:00–11:30, Northwind, Storgata 1. Organizer: Gunnar Holm.', 'noise', 'steering-invite'],
  ['2026-09-08 16:00', per, ana, 'Automatisk svar: Per Hansen', 'Jeg er på kurs til og med 10. september og svarer når jeg er tilbake.', 'noise'],
  [
    '2026-09-09 07:45',
    erik,
    ana,
    'Kjøkken – elektriker',
    'Hei igjen. Jeg har snakket med elektrikeren min, Bjørn. Han kan ta det elektriske, men har ikke gitt pris ennå. Starten 2. november står.\n\nErik',
    'personal',
    'erik-electrician',
  ],
  ['2026-09-09 12:00', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  ['2026-09-09 15:30', cara, ana, 'Design review', 'Gunnar approved the new design at the review today. The product pages get larger images.', 'work'],
  ['2026-09-09 19:20', nettverk, ana, '5 nye stillinger som passer deg', 'Prosjektleder, Oslo. Senior konsulent, Bergen. Og 3 til.', 'noise'],
  [
    '2026-09-10 09:10',
    kari,
    ana,
    'Fornyelse',
    'Hei Ana,\n\nFør fornyelsen vil vi gjerne forhandle om prisen. Send oss gjerne et forslag i løpet av neste uke.\n\nKari',
    'work',
  ],
  [
    '2026-09-10 14:30',
    cara,
    ana,
    'Content workshop notes',
    'From the workshop with Northwind today: we drop about 40% of the old pages. Northwind writes the new product texts, with a deadline of 1 December.',
    'work',
  ],
  ['2026-09-11 08:00', techWeekly, ana, 'The week in tech: a recall', 'This week: a battery recall, and what it means for your laptop.', 'noise'],
  ['2026-09-11 10:15', per, ana, 'DNS', 'Hei Ana, en praktisk ting: endringer i DNS må varsles til IT en uke i forveien. Per', 'work', 'per-dns'],
  [
    '2026-09-11 11:00',
    gunnar,
    ana,
    'Agenda for Monday',
    'Agenda for the steering group on 14 September: the hosting decision, the API issue and the timeline.\n\nGunnar',
    'work',
    'agenda-monday',
  ],
  ['2026-09-12 09:00', lopelogg, ana, 'Uka di: 38 km', 'Du løp 38 km denne uka. Lengste tur: 18 km.', 'noise'],
  ['2026-09-13 10:30', tone, 'Bislett løpeklubb', 'Startnummer', 'Startnummeret ditt er 4417. Start kl. 10.00 fra Rådhusplassen. Lykke til!', 'personal'],
  ['2026-09-13 21:00', 'Premieavdelingen <vinner@gaver.test>', ana, 'Siste sjanse: gavekortet ditt utløper', 'Du har fortsatt ikke hentet gavekortet ditt. Klikk her.', 'noise'],

  // Week 4, 14 to 20 September.
  ['2026-09-14 08:05', utvikler, ana, 'Ukas viktigste: universell utforming', 'Denne uka: nye krav til universell utforming fra 2027, og ti verktøy som hjelper.', 'noise'],
  [
    '2026-09-14 13:15',
    gunnar,
    `${ana}, ${cara}, ${per}`,
    'Steering group 14 September – decisions',
    "Hi all,\n\nDecisions from today's steering group:\n\n1. We host the new site on Azure. AWS was about 15% cheaper, but it would need a new framework agreement, and our IT team already runs Azure, which also keeps the data in Norway.\n2. We keep 1 March 2027 as the go-live date for now.\n3. We won't buy Fram's Enterprise plan. Lars will look for another way to speed up the export.\n4. The next steering group meeting is on 12 October.\n\nGunnar",
    'work',
    'steering-decisions',
  ],
  [
    '2026-09-14 15:00',
    cara,
    `${ana}, ${jonas}`,
    'Handing over the migration',
    "Ana,\n\nAs we discussed: Jonas started today, and he takes over the content migration from now on. I'm moving to the Fjord Bank pre-study three days a week from 21 September, and I'll stay on the relaunch for design questions.\n\nCara",
    'work',
    'handover',
  ],
  [
    '2026-09-15 09:30',
    ana,
    kari,
    'Forslag til fornyelse',
    'Hei Kari,\n\nVårt forslag er 1,35 millioner kroner i året fra 1. januar 2027, med to års bindingstid. Da tar vi med kvartalsvise driftsrapporter.\n\nHilsen Ana',
    'work',
    'ana-proposal',
  ],
  [
    '2026-09-15 11:45',
    gunnar,
    ana,
    'Budget',
    "Ana, between us: if the pilot with the product pages goes well in October, I may be able to add about 100,000 NOK to the budget. Nothing is decided.\n\nGunnar",
    'work',
    'budget-hint',
  ],
  ['2026-09-15 14:00', moterom, ana, 'Opptaket er klart: Styringsgruppe Northwind', 'Skyopptaket av møtet «Styringsgruppe Northwind» er klart.', 'noise'],
  [
    '2026-09-16 10:00',
    lars,
    `${ana}, ${jonas}`,
    'Faster export',
    "Hi Ana and Jonas,\n\nAn alternative to the Enterprise plan: we can run a one-time bulk export on our side for 15,000 NOK. That would remove most of the delay. I'll confirm the date it can run.\n\nLars",
    'work',
    'lars-bulk',
  ],
  ['2026-09-16 12:00', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  ['2026-09-16 17:30', techWeekly, ana, 'The week in tech: earnings', 'This week: earnings from the big five, and a new open model.', 'noise'],
  [
    '2026-09-16 18:20',
    mona,
    ana,
    'Matomo hosting',
    "Ana, to confirm: Matomo will run in Northwind's own Azure tenant, set up by Per's team.\n\nMona",
    'work',
    'mona-matomo-azure',
  ],
  ['2026-09-17 08:40', siri, `${ana}, ${cara}`, 'Oppstartsmøte forstudien', 'Oppstartsmøtet for forstudien blir mandag 21. september kl. 9 hos oss i Bergen.', 'work'],
  [
    '2026-09-17 16:10',
    erik,
    ana,
    'Pris elektriker',
    'Hei Ana. Bjørn har gitt pris på det elektriske: 7 000 kroner. Da blir totalen for kjøkkenet 92 000 kroner, alt inkludert.\n\nErik',
    'personal',
    'erik-price',
  ],
  ['2026-09-18 09:00', per, ana, 'Staging på Azure', 'Hei Ana, staging-miljøet på Azure er klart 1. oktober. Per', 'work', 'staging'],
  ['2026-09-18 13:00', nettverk, ana, 'Gratuler Jonas Vik med ny jobb', 'Jonas Vik har startet i ny stilling hos Acme. Send en gratulasjon!', 'noise'],
  ['2026-09-19 13:05', lopelogg, ana, 'Oslo halvmaraton: ny personlig rekord!', 'Du løp 21,1 km på 1:44:10. Ny personlig rekord!', 'personal', 'half'],
  ['2026-09-19 18:00', tone, 'Bislett løpeklubb', 'Gratulerer alle sammen!', 'For en dag! Takk til alle som løp og heiet. Fest på klubbhuset fredag.', 'noise'],
  ['2026-09-20 10:00', techWeekly, ana, 'Weekend reading', 'Five long reads for your weekend.', 'noise'],

  // Week 5, 21 to 27 September.
  ['2026-09-21 08:05', utvikler, ana, 'Ukas viktigste: Kubernetes og kaffe', 'Denne uka: Kubernetes 2.0 og en test av kaffetraktere til kontoret.', 'noise'],
  [
    '2026-09-21 10:30',
    gunnar,
    `${ana}, ${jonas}`,
    'Go-live moves to 15 March',
    "Hi Ana,\n\nLars confirmed the one-time bulk export, but Fram can only run it in the second week of January. With that, 1 March is too tight, so I've decided to move the go-live to 15 March 2027. We accept the 15,000 NOK for the bulk export.\n\nGunnar",
    'work',
    'golive-moves',
  ],
  [
    '2026-09-21 14:20',
    kari,
    ana,
    'Re: Forslag til fornyelse',
    'Hei Ana,\n\n1,35 millioner er for høyt for oss. Vi kan gå med på 1,25 millioner kroner i året med to års bindingstid.\n\nKari',
    'work',
    'kari-counter',
  ],
  [
    '2026-09-22 09:00',
    per,
    ana,
    'Jeg slutter',
    'Hei Ana.\n\nJeg vil at du skal høre det fra meg: jeg slutter i Northwind, og siste dag er fredag 2. oktober. Ola Nordmann overtar ansvaret for hosting og DNS fra torsdag 1. oktober. Jeg sørger for en god overlevering.\n\nPer',
    'work',
    'per-leaves',
  ],
  [
    '2026-09-22 15:30',
    cara,
    ana,
    'Forstudie: oppstart',
    'Oppstarten med Fjord Bank var i går. Siri vil ha en anbefaling om bygge eller kjøpe innen 13. november. Kriteriene er tid til lansering, kostnad over fem år og kontroll over kundedataene.\n\nCara',
    'work',
    'prestudy-kickoff',
  ],
  ['2026-09-22 17:00', lise, ana, 'Automatic reply: Lise Berg', "I'm away until 28 September. For urgent purchase orders, contact procurement@northwind.test.", 'noise'],
  [
    '2026-09-23 08:15',
    ingrid,
    ana,
    'Endring bursdag',
    'Hei! Vi flytter feiringen av mamma til søndag 11. oktober kl. 14, hjemme hos meg i Kongsberg. Frognerseteren var fullbooket. Kaka er fortsatt på deg!\n\nIngrid',
    'personal',
    'birthday-moved',
  ],
  ['2026-09-23 12:00', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  [
    '2026-09-23 14:10',
    gunnar,
    ana,
    'Fwd: Bulk export booked',
    'FYI.\n\n---------- Forwarded message ----------\nFrom: Lars Moe\nThe one-time bulk export is booked for the second week of January, 11 to 15 January 2027. Price as agreed, 15,000 NOK.',
    'work',
    'bulk-booked',
  ],
  ['2026-09-23 16:45', techWeekly, ana, 'The week in tech: a new browser', 'This week: a new browser from an old name, and the end of a messaging app.', 'noise'],
  [
    '2026-09-24 09:20',
    ana,
    gunnar,
    'Re: Go-live moves to 15 March',
    "Thanks Gunnar, I've updated the plan. Jonas will have the product pages ready for the pilot in October.\n\nAna",
    'work',
  ],
  ['2026-09-24 11:00', mona, ana, 'Cookie banner revision', "Thanks, I've received the revised banner from Cara. I'll review it next week.\n\nMona", 'work', 'mona-revision'],
  [
    '2026-09-25 10:10',
    kari,
    ana,
    'Signeringsfullmakter',
    'Hei Ana.\n\nTil orientering: styret har endret fullmaktene. Fra nå må bestillinger over 250 000 kroner signeres av både meg og administrerende direktør Hege Moen. Mellom 100 000 og 250 000 signerer jeg alene, som før.\n\nKari',
    'work',
    'signing',
  ],
  ['2026-09-25 14:00', lopelogg, ana, 'Uka di: 18 km', 'Du løp 18 km denne uka. Hvileuke etter løpet?', 'noise'],
  ['2026-09-25 16:00', jonas, ana, 'Migration status', "We're at 25% of the content. The product pages for the pilot are on track for 5 October.\n\nJonas", 'work', 'status-25'],
  ['2026-09-26 09:30', torget, ana, 'Nye treff: spisebord', '1 ny annonse matcher søket ditt «spisebord eik».', 'noise'],
  ['2026-09-27 20:00', 'Premieavdelingen <vinner@gaver.test>', ana, 'Du er valgt ut!', 'Du er en av tre heldige vinnere. Svar på denne e-posten for å hente premien.', 'noise'],

  // Week 6, 28 September to 4 October.
  ['2026-09-28 08:05', utvikler, ana, 'Ukas viktigste: passnøkler overalt', 'Denne uka: passnøkler blir standard i norske banker, og en guide til migrering.', 'noise'],
  [
    '2026-09-28 09:40',
    kari,
    ana,
    'Fakturering – endring',
    'Hei Ana,\n\nVi snur på fakturaene: vi holder oss til kvartalsvise fakturaer også etter januar. Det nye budsjettsystemet blir forsinket til høsten 2027, og revisor vil ikke at vi bytter rutine midt i året.\n\nKari',
    'work',
    'quarterly',
  ],
  [
    '2026-09-28 13:00',
    siri,
    `${ana}, ${cara}`,
    'Mobilapp',
    'Hei begge. Vi har bestemt at mobilappen holdes utenfor forstudien. Den tas i en egen runde i 2027, slik at vi holder oss innenfor budsjettet på 180 000.\n\nSiri',
    'work',
    'mobile-out',
  ],
  [
    '2026-09-28 15:20',
    cara,
    ana,
    'Forstudie: første uke',
    'Første uke med Fjord Bank: seks intervjuer gjort. Alle vil ha mer selvbetjening for kundene.',
    'work',
  ],
  [
    '2026-09-29 08:50',
    gunnar,
    ana,
    'Budget increase approved',
    "Ana, good news: the product page pilot went well, and management approved a budget increase of 70,000 NOK, so the relaunch budget is now 520,000 NOK. Not the 100,000 I hoped for, but it covers the bulk export and the extra testing.\n\nGunnar",
    'work',
    'budget-up',
  ],
  ['2026-09-29 11:30', mona, ana, 'Cookie banner approved', 'Ana, I approve the revised cookie banner. The reject button now meets my condition.\n\nMona', 'work', 'cookie-ok'],
  ['2026-09-29 15:00', nettverk, ana, 'Du har 3 nye kontaktforespørsler', 'Godta eller avslå forespørslene dine på Nettverk.', 'noise'],
  ['2026-09-30 09:00', marte, ana, 'Siste dag', 'Takk for alt! Avtalen avsluttes i dag, som planlagt.\n\nMarte, Havbris', 'work', 'havbris-last'],
  [
    '2026-09-30 10:30',
    erlend,
    ana,
    'A new offer for Northwind',
    "Hi Ana,\n\nOn behalf of AWS, CloudPartner can offer Northwind 25% off the first year if the new website is hosted on AWS. Happy to set up a call.\n\nErlend Strand\nCloudPartner",
    'work',
    'aws-offer',
  ],
  ['2026-09-30 12:00', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  [
    '2026-10-01 08:30',
    ola,
    ana,
    'Hosting og DNS',
    'Hei Ana,\n\nJeg har tatt over hosting og DNS etter Per fra i dag. Si fra om DNS-endringer en uke i forveien, som før.\n\nOla Nordmann\nIT, Northwind',
    'work',
    'ola-dns',
  ],
  [
    '2026-10-01 10:00',
    ana,
    gunnar,
    'AWS offer',
    'Hi Gunnar, a reseller has offered 25% off the first year if we host on AWS. Do we want to reopen the hosting decision?\n\nAna',
    'work',
  ],
  ['2026-10-01 15:00', per, 'Alle i IT, Northwind', 'Takk for samarbeidet', 'I morgen er siste dag. Takk for fem fine år!\n\nPer', 'noise'],
  [
    '2026-10-02 09:15',
    gunnar,
    ana,
    'Re: AWS offer',
    'No. We stay with Azure. Switching now would cost us weeks of migration work, and the reasons from September still hold.\n\nGunnar',
    'work',
    'aws-no',
  ],
  ['2026-10-02 14:30', jonas, ana, 'Migration status', "40% of the content is migrated now, and the pilot's product pages are live on staging.\n\nJonas", 'work', 'status-40'],
  ['2026-10-02 16:00', erlend, ana, 'Re: A new offer for Northwind', 'Just following up: the offer is valid until 15 October.', 'noise'],
  ['2026-10-03 08:20', erik, ana, 'Ny startdato', 'Hei Ana, jeg må dessverre utsette starten en uke, til mandag 9. november. Forrige jobb har dratt ut. Prisen står.\n\nErik', 'personal', 'kitchen-moved'],
  ['2026-10-03 12:00', lopelogg, ana, 'Uka di: 41 km', 'Du løp 41 km denne uka. Ny ukesrekord!', 'noise'],
  ['2026-10-04 19:00', techWeekly, ana, 'Weekend reading', 'Five long reads for your weekend.', 'noise'],

  // Week 7, 5 to 11 October.
  ['2026-10-05 08:05', utvikler, ana, 'Ukas viktigste: budsjett for 2027', 'Denne uka: hva statsbudsjettet betyr for IT-bransjen.', 'noise'],
  [
    '2026-10-05 09:00',
    cara,
    `${ana}, ${jonas}`,
    'Relaunch timeline',
    'Quick note for Jonas: the go-live is 1 April, so the news archive can wait until February.\n\nCara',
    'work',
    'cara-april',
  ],
  [
    '2026-10-05 10:45',
    gunnar,
    `${cara}, ${ana}, ${jonas}`,
    'Re: Relaunch timeline',
    'Just to be clear: the go-live is 15 March, not 1 April. The agency suggested 1 April, but I said no.\n\nGunnar',
    'work',
    'golive-confirmed',
  ],
  ['2026-10-05 13:00', dentist, ana, 'Timebekreftelse', 'Du har time hos tannlegen tirsdag 20. oktober kl. 08.15.', 'personal', 'dentist-1'],
  ['2026-10-06 08:30', gunnar, ana, 'Steering group moved', 'The steering group on 12 October moves to 19 October, same time.\n\nGunnar', 'work', 'steering-moved'],
  [
    '2026-10-06 13:20',
    kari,
    ana,
    'Enighet om fornyelse',
    'Hei Ana,\n\nVi er enige: 1,3 millioner kroner i året fra 1. januar 2027, med to års bindingstid og kvartalsvise driftsrapporter. Jeg sender signert avtale neste uke.\n\nKari',
    'work',
    'renewal-agreed',
  ],
  ['2026-10-06 15:00', calendar, ana, 'Updated invitation: Steering group – Northwind relaunch', 'Monday 19 October, 10:00–11:30. Organizer: Gunnar Holm.', 'noise', 'steering-invite-2'],
  [
    '2026-10-07 09:10',
    kari,
    ana,
    'Foreldrepermisjon',
    'Hei Ana. Jeg går ut i foreldrepermisjon fra 1. november. Mens jeg er borte er controller Eirik Sand kontakt for fakturaer og avtalen.\n\nKari',
    'work',
    'leave',
  ],
  ['2026-10-07 12:00', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  ['2026-10-07 16:30', techWeekly, ana, 'The week in tech: a new phone', 'This week: the new phone, reviewed.', 'noise'],
  ['2026-10-08 10:00', ola, ana, 'DNS for staging', 'Vi flytter staging til staging.northwind.test 21. oktober. Varsler som avtalt.\n\nOla', 'work'],
  ['2026-10-08 12:30', jonas, ana, 'Redirects', "I've started the redirect list. About 700 old addresses need redirects.\n\nJonas", 'work'],
  ['2026-10-08 14:00', nettverk, ana, 'Populære innlegg i nettverket ditt', 'Se hva folk i nettverket ditt snakker om denne uka.', 'noise'],
  ['2026-10-09 11:30', ana, jonas, 'Next steps on migration', 'The pilot is done. Next: the news pages from 19 October, then the redirect list.\n\nAna', 'work'],
  ['2026-10-09 15:00', ingrid, ana, 'Kake', 'Husk kaka på søndag! Vi blir 14 stykker.', 'personal'],
  ['2026-10-10 09:00', lopelogg, ana, 'Uka di: 35 km', 'Du løp 35 km denne uka.', 'noise'],
  ['2026-10-11 20:00', ingrid, ana, 'Takk for i dag', 'Takk for i dag! Mamma koste seg. Bilder kommer.', 'noise'],

  // Week 8, 12 to 18 October.
  ['2026-10-12 08:05', utvikler, ana, 'Ukas viktigste: sikkerhetsmåneden', 'Denne uka: oktober er sikkerhetsmåned. Fem ting du bør sjekke.', 'noise'],
  ['2026-10-12 09:30', kari, ana, 'Signert avtale', 'Her er signert avtale: 1,3 millioner kroner per år, to år fra 1. januar 2027.\n\nKari', 'work', 'signed'],
  [
    '2026-10-12 13:00',
    siri,
    `${ana}, ${cara}`,
    'Forstudie: status',
    'Hei begge. Vi heller mot å kjøpe en ferdig plattform. Det store åpne spørsmålet er om vi beholder kontroll over kundedataene med en kjøpt plattform. Vi tar en egen workshop om det 3. november.\n\nSiri',
    'work',
    'prestudy-status',
  ],
  [
    '2026-10-13 10:00',
    gunnar,
    ana,
    'Agenda 19 October',
    'Agenda for the steering group on 19 October: the go-live plan, the budget, and the cookie banner, which is done. One open question for the meeting: whether to add a Swedish version in 2027.\n\nGunnar',
    'work',
    'agenda-19',
  ],
  ['2026-10-13 14:30', moterom, ana, 'Opptaket er klart: Forstudie Fjord Bank', 'Skyopptaket av møtet «Forstudie Fjord Bank» er klart.', 'noise'],
  ['2026-10-14 09:00', acme, 'Alle i Acme', 'Timelister', 'Påminnelse: timelister leveres hver fredag innen kl. 15.00.', 'noise'],
  ['2026-10-14 11:00', ola, ana, 'DNS-endring', 'Bekrefter DNS-endringen for staging 21. oktober.\n\nOla', 'work'],
  ['2026-10-14 15:10', dentist, ana, 'Endring av time', 'Timen din er flyttet til tirsdag 27. oktober kl. 08.15. Gi beskjed om tidspunktet ikke passer.', 'personal', 'dentist-2'],
  ['2026-10-14 16:40', cara, ana, 'Forstudie: kandidater', "We've shortlisted two platforms for Fjord Bank: Nordportal and Kundeflate.\n\nCara", 'work'],
  ['2026-10-15 16:00', jonas, ana, 'Migration status', '75% of the content is migrated. The news pages start next week.\n\nJonas', 'work', 'status-75'],
  ['2026-10-15 18:00', techWeekly, ana, 'The week in tech: a fine', 'This week: a record fine for a search giant.', 'noise'],
  ['2026-10-16 10:30', erik, ana, 'Bekreftelse', 'Bekrefter oppstart mandag 9. november kl. 7. Totalt 92 000 kroner, som avtalt.\n\nErik', 'personal', 'erik-confirm'],
  ['2026-10-16 13:00', nettverk, ana, 'Du dukket opp i 9 søk denne uka', 'Se hvem som har sett på profilen din.', 'noise'],
  ['2026-10-17 09:00', lopelogg, ana, 'Uka di: 44 km', 'Du løp 44 km denne uka. Ny ukesrekord!', 'noise'],
  ['2026-10-18 19:00', techWeekly, ana, 'Weekend reading', 'Five long reads for your weekend.', 'noise'],

  // More of the same weeks, sorted in by time.
  ['2026-08-26 16:30', cara, ana, 'Fram access', "I've got admin access to Fram now. The export API works, just slowly.\n\nCara", 'work'],
  ['2026-08-28 15:00', tone, 'Bislett løpeklubb', 'Intervaller', 'Intervalltrening hver tirsdag kl. 18 fra klubbhuset fram til løpet.', 'personal'],
  ['2026-09-02 10:40', lise, ana, 'PO for the relaunch', 'Your purchase order number for the relaunch is PO-77120. Put it on every invoice.\n\nLise', 'work', 'lise-po-number'],
  ['2026-09-05 12:00', ingrid, ana, 'Re: Mamma 70', 'Supert! Ikke si noe til mamma, det er en overraskelse.', 'personal'],
  ['2026-09-08 11:30', siri, ana, 'Kontrakt forstudie', 'Vedlagt er kontrakten for forstudien. Signer gjerne innen fredag.\n\nSiri', 'work'],
  ['2026-09-10 16:00', utvikler, ana, 'Webinar: CMS-migrering uten tårer', 'Bli med på webinar torsdag om hvordan du flytter innhold mellom publiseringsløsninger.', 'noise'],
  ['2026-09-17 11:00', jonas, ana, 'First week', "Settling in. I've read Cara's migration plan and started on the product pages.\n\nJonas", 'work'],
  [
    '2026-09-18 15:30',
    gunnar,
    ana,
    'Re: Budget',
    "Ana, to be clear: the extra 100,000 isn't approved. Don't plan with it until management decides after the pilot.\n\nGunnar",
    'work',
    'budget-not-yet',
  ],
  ['2026-09-24 13:00', per, ana, 'Overlevering', 'Overleveringsmøtet med Ola er 29. september. Dokumentasjonen ligger i IT-wikien.\n\nPer', 'work'],
  ['2026-09-26 11:00', 'Nordfly <kvittering@nordfly.test>', ana, 'Du har 2 400 bonuspoeng', 'Bruk poengene på din neste reise.', 'noise'],
  ['2026-10-01 11:30', jonas, ana, 'Pilot feedback', 'Gunnar liked the pilot. One fix: larger product images on mobile.\n\nJonas', 'work'],
  ['2026-10-04 10:00', tone, 'Bislett løpeklubb', 'Neste løp', 'Neste felles løp er Sylvesterløpet 31. desember. Påmelding åpner i november.', 'personal'],
  ['2026-10-07 14:00', mona, ana, 'Privacy statement', 'Please make sure the new privacy statement mentions Matomo and says no data leaves Norway.\n\nMona', 'work'],
  ['2026-10-10 12:00', torget, ana, 'Prisfall: spisebord', 'Et spisebord du har sett på er satt ned i pris.', 'noise'],
  ['2026-10-13 09:00', cara, ana, 'Forstudie: intervjuer ferdig', 'Alle intervjuene i forstudien er ferdige. Jeg skriver sammendraget denne uka.\n\nCara', 'work'],
  ['2026-10-16 09:00', gunnar, ana, 'Swedish version', 'Any thoughts on a Swedish version before Monday? I want us to decide it at the steering group.\n\nGunnar', 'work', 'swedish'],
  ['2026-10-17 10:00', 'Nordfly <kvittering@nordfly.test>', ana, 'Tilbud til Bergen', 'Fly til Bergen fra 499 kroner i november.', 'noise'],
];

export const emails: Email[] = rows
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([at, from, to, subject, body, kind, key], index) => ({ id: `m${String(index + 1).padStart(3, '0')}`, at, from, to, subject, body, kind, ...(key && { key }) }));

const byKey = new Map(emails.filter((email) => email.key).map((email) => [email.key!, email.id]));

/** The ids of the emails with these keys. */
export function idsOf(keys: string[]): string[] {
  return keys.map((key) => {
    const id = byKey.get(key);
    if (!id) throw new Error(`No email has the key ${key}.`);
    return id;
  });
}

/** The first day of each simulated week. Each week's mail arrives in two batches, Monday to Wednesday and Thursday to Sunday. */
export const weekStarts = ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];

export interface Batch {
  week: number;
  /** The last day of the batch, when it is learned from. */
  day: string;
  emails: Email[];
}

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Sixteen batches, two a week. */
export const batches: Batch[] = weekStarts.flatMap((start, index) =>
  [
    [start, addDays(start, 2)],
    [addDays(start, 3), addDays(start, 6)],
  ].map(([first, last]) => ({ week: index + 1, day: last, emails: emails.filter((email) => email.at.slice(0, 10) >= first && email.at.slice(0, 10) <= last) })),
);

/** The day a week's questions are asked: its Sunday. */
export const checkpointDay = (week: number) => addDays(weekStarts[week - 1], 6);

// Patterns for answers in English and stores in either language. Each Fact is alternatives.

const months: [string, string][] = [
  ['jan', 'jan'],
  ['feb', 'feb'],
  ['mar', 'mar'],
  ['apr', 'apr'],
  ['may', 'mai'],
  ['jun', 'jun'],
  ['jul', 'jul'],
  ['aug', 'aug'],
  ['sep', 'sep'],
  ['oct', 'okt'],
  ['nov', 'nov'],
  ['dec', 'des'],
];

/** A day of a month, as "15 March", "March 15th", "15. mars", "15.03." or "-03-15". */
export function day(date: number, month: number): Fact {
  const [en, no] = months[month - 1];
  const names = en === no ? en : `(${en}|${no})`;
  const mm = String(month).padStart(2, '0');
  return [
    new RegExp(`\\b${date}(st|nd|rd|th)?\\.?\\s+(of\\s+)?${names}`, 'i'),
    new RegExp(`\\b${names}[a-z]*\\.?\\s+${date}(st|nd|rd|th)?\\b`, 'i'),
    new RegExp(`\\b0?${date}[./]0?${month}[./]`),
    new RegExp(`-${mm}-${String(date).padStart(2, '0')}\\b`),
  ];
}

/** An amount in kroner, as "450,000", "450 000", "450.000", "450k", or from 100,000 up also "0.45M" or "0,45 million", but not inside "2,450,000". */
export function kroner(thousands: number): Fact {
  const patterns = [new RegExp(`(?<!\\d[\\s,.\\u00a0])\\b${thousands}[\\s,.\\u00a0]?000\\b`), new RegExp(`\\b${thousands}\\s?k\\b`, 'i'), new RegExp(`\\b${thousands}\\s?(thousand|tusen)`, 'i')];
  if (thousands >= 100 && thousands < 1000) {
    const decimals = String(thousands / 1000).slice(2);
    patterns.push(new RegExp(`\\b0[.,]${decimals}0*(?!\\d)\\s*(million|mill|mnok|m\\b)`, 'i'));
  }
  return patterns;
}

/** An amount in millions of kroner, as "1.2 million", "1,2 millioner", "1.2M" or "1,200,000". */
export function millions(whole: number, tenths: number, hundredths?: number): Fact {
  const decimals = `${tenths}${hundredths ?? ''}`;
  const full = `${tenths}${hundredths ?? 0}0`;
  return [
    new RegExp(`\\b${whole}[.,]${decimals}(?!\\d)\\s*(million|mill|mnok|m\\b|mill\\.)`, 'i'),
    new RegExp(`\\b${whole}[\\s,.\\u00a0]?${full}[\\s,.\\u00a0]?000\\b`),
  ];
}

const words = (...patterns: RegExp[]): Fact => patterns;
const yes: Fact = [/^\W*yes\b/i];
const no: Fact = [/^\W*no\b/i];
const undecided: Fact = [/^\W*(undecided|not (yet )?decided|open|unknown|unclear)\b/i];

/** What a question's answer is from a week on, and how to tell it from an earlier one. */
export interface Truth {
  /** The first week this is the answer. */
  from: number;
  /** The answer, as a person would give it. */
  answer: string;
  /** Every fact must be in a short answer for it to count as right. */
  expect: Fact[];
  /** Earlier answers: a wrong answer with one of these presents an outdated fact as current. */
  stale?: Fact[];
  /** The keys of the emails that support this answer, which a traced claim cites. */
  sources: string[];
  /** For questions about understanding: what a full answer holds, for the judge. */
  rubric?: Element[];
}

/** One thing a full answer to an understanding question holds, or, when negative, must not say. */
export interface Element {
  id: string;
  text: string;
  negative?: boolean;
}

export interface Question {
  id: string;
  /** fact: a short answer. yesno: yes, no or undecided. past: what used to be true. why and open: understanding, judged against a rubric. */
  kind: 'fact' | 'yesno' | 'past' | 'why' | 'open';
  ask: string;
  /** The last week it's asked, if it stops making sense. */
  until?: number;
  truths: Truth[];
}

/** The answer in a week, or nothing before the question is asked. */
export function truthIn(question: Question, week: number): Truth | undefined {
  if (question.until !== undefined && week > question.until) return undefined;
  return question.truths.filter((truth) => truth.from <= week).at(-1);
}

/** The questions, each with its answer week by week. The ids of the emails are those above. */
export const questions: Question[] = [
  // Facts that change.
  {
    id: 'golive',
    kind: 'fact',
    ask: 'When does the Northwind website relaunch go live?',
    truths: [
      { from: 1, answer: '1 March 2027', expect: [day(1, 3)], sources: ['kickoff', 'cara-kickoff', 'steering-decisions'] },
      { from: 5, answer: '15 March 2027', expect: [day(15, 3)], stale: [day(1, 3), words(/\b1(st)?\.?\s+(of\s+)?apr|apr[a-z]*\s+1(st)?\b/i)], sources: ['golive-moves', 'golive-confirmed'] },
    ],
  },
  {
    id: 'budget',
    kind: 'fact',
    ask: 'What is the budget for the Northwind website relaunch?',
    truths: [
      { from: 1, answer: '450,000 NOK', expect: [kroner(450)], sources: ['kickoff', 'cara-kickoff'] },
      { from: 6, answer: '520,000 NOK', expect: [kroner(520)], stale: [kroner(450)], sources: ['budget-up'] },
    ],
  },
  {
    id: 'migration-owner',
    kind: 'fact',
    ask: "Who owns the content migration on Northwind's website relaunch?",
    truths: [
      { from: 1, answer: 'Cara Lund', expect: [words(/\bcara\b/i)], sources: ['kickoff', 'migration-plan', 'cara-kickoff'] },
      { from: 4, answer: 'Jonas Vik', expect: [words(/\bjonas\b/i)], stale: [words(/\bcara\b/i)], sources: ['handover'] },
    ],
  },
  {
    id: 'dns-owner',
    kind: 'fact',
    ask: 'Who at Northwind is responsible for hosting and DNS?',
    truths: [
      { from: 1, answer: 'Per Hansen', expect: [words(/\bper\b|hansen/i)], sources: ['kickoff', 'per-hosting', 'cara-kickoff'] },
      { from: 6, answer: 'Ola Nordmann', expect: [words(/\bola\b|nordmann/i)], stale: [words(/\bper\b|hansen/i)], sources: ['per-leaves', 'ola-dns'] },
    ],
  },
  {
    id: 'next-steering',
    kind: 'fact',
    ask: 'When is the next Northwind steering group meeting?',
    truths: [
      { from: 1, answer: '14 September', expect: [day(14, 9)], sources: ['kickoff', 'cara-kickoff', 'steering-invite'] },
      { from: 4, answer: '12 October', expect: [day(12, 10)], stale: [day(14, 9)], sources: ['steering-decisions'] },
      { from: 7, answer: '19 October', expect: [day(19, 10)], stale: [day(12, 10), day(14, 9)], sources: ['steering-moved', 'steering-invite-2', 'agenda-19'] },
    ],
  },
  {
    id: 'hosting',
    kind: 'fact',
    ask: 'Where will the new Northwind website be hosted?',
    truths: [{ from: 4, answer: 'Azure', expect: [words(/azure/i)], sources: ['steering-decisions', 'aws-no'] }],
  },
  {
    id: 'cookie-approved',
    kind: 'yesno',
    ask: 'Has Mona Lie approved the cookie banner for the new Northwind site?',
    truths: [
      { from: 3, answer: 'No: she will approve it if the reject button is as visible as the accept button.', expect: [no], sources: ['mona-cookie', 'mona-revision'] },
      { from: 6, answer: 'Yes, on 29 September.', expect: [yes], stale: [no], sources: ['cookie-ok'] },
    ],
  },
  {
    id: 'aws-offer',
    kind: 'yesno',
    ask: "Did Northwind take up the discounted offer to host on AWS?",
    truths: [{ from: 6, answer: 'No. Gunnar decided to stay with Azure.', expect: [no], sources: ['aws-no'] }],
  },
  {
    id: 'fjord-price-now',
    kind: 'fact',
    ask: 'What does Fjord Bank pay Acme a year under its current framework agreement?',
    truths: [{ from: 1, answer: '1.2 million NOK', expect: [millions(1, 2)], sources: ['kari-2027'] }],
  },
  {
    id: 'fjord-price-2027',
    kind: 'fact',
    ask: 'What annual price has Acme agreed with Fjord Bank from 1 January 2027?',
    truths: [{ from: 7, answer: '1.3 million NOK a year, for two years', expect: [millions(1, 3)], sources: ['renewal-agreed', 'signed'] }],
  },
  {
    id: 'fjord-signoff',
    kind: 'fact',
    ask: 'Who has to sign a 300,000 NOK order at Fjord Bank?',
    truths: [
      { from: 1, answer: 'Kari Lie', expect: [words(/\bkari\b/i)], sources: ['kari-2027'] },
      { from: 5, answer: 'Both Kari Lie and the CEO, Hege Moen', expect: [words(/\bkari\b/i), words(/hege|moen|\bceo\b|chief executive|administrerende/i)], stale: [words(/\bkari\b/i)], sources: ['signing'] },
    ],
  },
  {
    id: 'fjord-invoicing',
    kind: 'fact',
    ask: 'How often will Acme invoice Fjord Bank from January 2027?',
    truths: [
      { from: 2, answer: 'Monthly', expect: [words(/month|måned/i)], sources: ['kari-monthly'] },
      { from: 6, answer: 'Quarterly', expect: [words(/quarter|kvartal/i)], stale: [words(/month|måned/i)], sources: ['quarterly'] },
    ],
  },
  {
    id: 'kitchen-start',
    kind: 'fact',
    ask: 'When does Erik Dahl start on the kitchen?',
    truths: [
      { from: 1, answer: 'Monday 2 November', expect: [day(2, 11)], sources: ['erik-kitchen', 'erik-electrician'] },
      { from: 6, answer: 'Monday 9 November', expect: [day(9, 11)], stale: [day(2, 11)], sources: ['kitchen-moved', 'erik-confirm'] },
    ],
  },
  {
    id: 'kitchen-price',
    kind: 'fact',
    ask: "What is Erik's total price for the kitchen?",
    truths: [
      { from: 1, answer: '85,000 NOK, without the electrician', expect: [kroner(85)], sources: ['erik-kitchen'] },
      { from: 4, answer: '92,000 NOK, everything included', expect: [kroner(92)], stale: [kroner(85)], sources: ['erik-price', 'erik-confirm'] },
    ],
  },
  {
    id: 'birthday',
    kind: 'fact',
    ask: "When and where is the celebration of Ana's mother's 70th birthday?",
    until: 6,
    truths: [
      { from: 1, answer: 'Saturday 10 October at 13:00, at Frognerseteren', expect: [day(10, 10), words(/frognerseter/i)], sources: ['birthday'] },
      { from: 5, answer: "Sunday 11 October at 14:00, at Ingrid's home in Kongsberg", expect: [day(11, 10), words(/kongsberg|ingrid/i)], stale: [day(10, 10), words(/frognerseter/i)], sources: ['birthday-moved'] },
    ],
  },
  {
    id: 'havbris-active',
    kind: 'yesno',
    ask: 'Is Havbris still an active client of Acme?',
    truths: [
      { from: 3, answer: 'Yes, until its maintenance agreement ends on 30 September.', expect: [yes], sources: ['havbris-end'] },
      { from: 6, answer: 'No: its maintenance agreement ended on 30 September.', expect: [no], stale: [yes], sources: ['havbris-end', 'havbris-last'] },
    ],
  },
  {
    id: 'prestudy-price',
    kind: 'fact',
    ask: "What is the price of Fjord Bank's customer portal pre-study?",
    truths: [{ from: 2, answer: '180,000 NOK', expect: [kroner(180)], sources: ['ana-estimate', 'siri-accept'] }],
  },
  {
    id: 'prestudy-mobile',
    kind: 'yesno',
    ask: "Is the mobile app part of Fjord Bank's customer portal pre-study? Answer yes, no or undecided.",
    truths: [
      { from: 2, answer: 'Undecided', expect: [undecided], sources: ['siri-prestudy', 'siri-accept'] },
      { from: 6, answer: 'No, it was left out.', expect: [no], stale: [undecided, yes], sources: ['mobile-out'] },
    ],
  },
  {
    id: 'half-marathon',
    kind: 'fact',
    ask: "What was Ana's time in the half marathon on 19 September?",
    truths: [{ from: 4, answer: '1:44:10', expect: [words(/1[:.]44[:.]10/)], sources: ['half'] }],
  },
  {
    id: 'analytics',
    kind: 'fact',
    ask: 'Which analytics tool will the new Northwind website use?',
    truths: [{ from: 2, answer: 'Matomo', expect: [words(/matomo/i)], sources: ['mona-matomo', 'mona-matomo-azure'] }],
  },
  {
    id: 'staging',
    kind: 'fact',
    ask: 'When is the Azure staging environment for the new Northwind site ready?',
    truths: [{ from: 4, answer: '1 October', expect: [day(1, 10)], sources: ['staging'] }],
  },
  {
    id: 'fjord-contact',
    kind: 'fact',
    ask: "Who is Ana's contact at Fjord Bank for invoices and the agreement from November?",
    truths: [{ from: 7, answer: 'Eirik Sand, the controller', expect: [words(/eirik|sand\b/i)], stale: [words(/\bkari\b/i)], sources: ['leave'] }],
  },
  {
    id: 'migration-status',
    kind: 'fact',
    ask: "How much of Northwind's content has been migrated?",
    truths: [
      { from: 5, answer: '25%', expect: [words(/\b25\s?(%|percent|prosent)/i)], sources: ['status-25'] },
      { from: 6, answer: '40%', expect: [words(/\b40\s?(%|percent|prosent)/i)], stale: [words(/\b25\s?(%|percent|prosent)/i)], sources: ['status-40'] },
      { from: 8, answer: '75%', expect: [words(/\b75\s?(%|percent|prosent)/i)], stale: [words(/\b(25|40)\s?(%|percent|prosent)/i)], sources: ['status-75'] },
    ],
  },
  {
    id: 'dentist',
    kind: 'fact',
    ask: "When is Ana's dentist appointment?",
    truths: [
      { from: 7, answer: 'Tuesday 20 October at 08:15', expect: [day(20, 10)], sources: ['dentist-1'] },
      { from: 8, answer: 'Tuesday 27 October at 08:15', expect: [day(27, 10)], stale: [day(20, 10)], sources: ['dentist-2'] },
    ],
  },
  {
    id: 'bulk-export',
    kind: 'fact',
    ask: "What does Fram's one-time bulk export cost, and when does it run?",
    truths: [
      { from: 4, answer: '15,000 NOK; the date is not confirmed yet', expect: [kroner(15)], sources: ['lars-bulk'] },
      { from: 5, answer: '15,000 NOK, in the second week of January 2027 (11 to 15 January)', expect: [kroner(15), words(/jan/i)], sources: ['golive-moves', 'bulk-booked'] },
    ],
  },
  {
    id: 'purchase-order',
    kind: 'fact',
    ask: 'What does Northwind need before Acme can invoice it?',
    truths: [{ from: 1, answer: "A purchase order number from Lise Berg in procurement", expect: [words(/purchase order|\bpo\b/i)], sources: ['lise-po', 'lise-po-number'] }],
  },
  {
    id: 'prestudy-deadline',
    kind: 'fact',
    ask: 'By when does Fjord Bank want the build-or-buy recommendation from the pre-study?',
    truths: [{ from: 5, answer: '13 November', expect: [day(13, 11)], sources: ['prestudy-kickoff'] }],
  },
  {
    id: 'dns-notice',
    kind: 'fact',
    ask: 'How far ahead must DNS changes at Northwind be announced?',
    truths: [{ from: 3, answer: 'A week', expect: [words(/week|uke|7 days|seven days/i)], sources: ['per-dns', 'ola-dns'] }],
  },

  // What used to be true.
  {
    id: 'past-golive',
    kind: 'past',
    ask: 'What go-live date did the kickoff in August set for the Northwind relaunch?',
    truths: [{ from: 5, answer: '1 March 2027', expect: [day(1, 3)], sources: ['kickoff', 'golive-moves'] }],
  },
  {
    id: 'past-dns',
    kind: 'past',
    ask: 'Who was responsible for hosting and DNS at Northwind in August?',
    truths: [{ from: 6, answer: 'Per Hansen', expect: [words(/\bper\b|hansen/i)], sources: ['per-leaves', 'ola-dns'] }],
  },
  {
    id: 'past-kitchen',
    kind: 'past',
    ask: 'What price did Erik give for the kitchen in August?',
    truths: [{ from: 4, answer: '85,000 NOK', expect: [kroner(85)], sources: ['erik-kitchen'] }],
  },

  // Understanding: reasons, rejected alternatives and what's open. Judged against the rubric.
  {
    id: 'why-azure',
    kind: 'why',
    ask: 'Where will the new Northwind site be hosted, and why there rather than the alternative?',
    truths: [
      {
        from: 4,
        answer: "Northwind's IT team already runs Azure, and Azure's region in Norway keeps the data in Norway. AWS was the alternative: about 15% cheaper a year, but it needed a new framework agreement.",
        expect: [words(/azure/i)],
        sources: ['per-compare', 'steering-decisions'],
        rubric: [
          { id: 'runs-azure', text: "Northwind's IT team already runs Azure" },
          { id: 'norway', text: 'Azure keeps the data in Norway (its Norwegian region)' },
          { id: 'aws-cheaper', text: 'AWS was the alternative, and about 15% cheaper a year' },
          { id: 'new-agreement', text: 'AWS would have needed a new framework agreement (or contract)' },
        ],
      },
      {
        from: 6,
        answer:
          "Northwind's IT team already runs Azure, and Azure's region in Norway keeps the data in Norway. AWS was about 15% cheaper but needed a new framework agreement. A later AWS offer of 25% off was turned down: switching would cost weeks of migration work.",
        expect: [words(/azure/i)],
        sources: ['per-compare', 'steering-decisions', 'aws-no'],
        rubric: [
          { id: 'runs-azure', text: "Northwind's IT team already runs Azure" },
          { id: 'norway', text: 'Azure keeps the data in Norway (its Norwegian region)' },
          { id: 'aws-cheaper', text: 'AWS was the alternative, and about 15% cheaper a year' },
          { id: 'new-agreement', text: 'AWS would have needed a new framework agreement (or contract)' },
          { id: 'offer-declined', text: 'A later discounted AWS offer was turned down, because switching would cost weeks of migration work' },
        ],
      },
    ],
  },
  {
    id: 'why-golive',
    kind: 'why',
    ask: 'Has the go-live date of the Northwind relaunch changed, and if so, why?',
    truths: [
      {
        from: 5,
        answer:
          "Fram's API allows only 10 requests a second, which slows the content export. Northwind wouldn't pay 20,000 NOK a month for Fram's Enterprise plan, and the one-time bulk export it chose instead (15,000 NOK) can only run in the second week of January, so the go-live moved from 1 March to 15 March 2027.",
        expect: [day(15, 3)],
        sources: ['migration-plan', 'lars-api', 'gunnar-nopay', 'steering-decisions', 'golive-moves'],
        rubric: [
          { id: 'api-limit', text: "Fram CMS's API limit (10 requests a second) slows the content export or migration" },
          { id: 'no-enterprise', text: "Northwind declined to pay for Fram's Enterprise plan (20,000 NOK a month) for a higher limit" },
          { id: 'bulk-january', text: 'The one-time bulk export can only run in the second week of January' },
          { id: 'dates', text: 'It moved from 1 March to 15 March 2027' },
        ],
      },
    ],
  },
  {
    id: 'why-quarterly',
    kind: 'why',
    ask: 'How will Acme invoice Fjord Bank from January 2027, and why?',
    truths: [
      {
        from: 6,
        answer:
          "Fjord Bank first asked for monthly invoices from January to fit its new budget system, but that system is delayed to autumn 2027, and its auditor doesn't want the routine to change in the middle of the year.",
        expect: [words(/quarter|kvartal/i)],
        sources: ['kari-monthly', 'quarterly'],
        rubric: [
          { id: 'asked-monthly', text: 'Fjord Bank had asked for monthly invoices from January, to fit a new budget system' },
          { id: 'system-delayed', text: 'The new budget system is delayed to autumn 2027' },
          { id: 'auditor', text: "The auditor doesn't want a change of routine in the middle of the year" },
        ],
      },
    ],
  },
  {
    id: 'why-matomo',
    kind: 'why',
    ask: 'Which analytics tool will the new Northwind site use, and why that one?',
    truths: [
      {
        from: 2,
        answer: "Northwind's legal team (Mona Lie) prefers it: Matomo can run on Northwind's own servers, so no data goes to the US.",
        expect: [words(/matomo/i)],
        sources: ['mona-matomo'],
        rubric: [
          { id: 'own-servers', text: "Matomo can run on Northwind's own servers" },
          { id: 'no-us', text: 'No data goes to the US' },
          { id: 'legal', text: "Northwind's legal team, Mona Lie, prefers it" },
        ],
      },
    ],
  },
  {
    id: 'why-mobile',
    kind: 'why',
    ask: "Is the mobile app part of Fjord Bank's portal pre-study, and why?",
    truths: [
      {
        from: 6,
        answer: 'To keep the pre-study within its budget of 180,000 NOK. The app will be handled in a separate round in 2027.',
        expect: [words(/budget|180/i)],
        sources: ['mobile-out'],
        rubric: [
          { id: 'budget', text: 'To keep the pre-study within its budget of 180,000 NOK' },
          { id: 'later', text: 'The mobile app gets a separate round in 2027' },
        ],
      },
    ],
  },
  {
    id: 'why-budget',
    kind: 'why',
    ask: 'Has the budget for the Northwind relaunch changed, and if so, why and by how much?',
    truths: [
      {
        from: 6,
        answer:
          'The product page pilot went well, so management added 70,000 NOK, to 520,000 NOK. It covers the bulk export and extra testing. Gunnar had hoped for about 100,000.',
        expect: [kroner(70)],
        sources: ['budget-hint', 'budget-up'],
        rubric: [
          { id: 'pilot', text: 'The product page pilot went well' },
          { id: 'amount', text: 'It went up by 70,000 NOK, to 520,000 NOK' },
          { id: 'covers', text: 'The increase covers the bulk export and extra testing' },
          { id: 'hint', text: 'It was less than the roughly 100,000 NOK Gunnar had hinted at' },
        ],
      },
    ],
  },
  {
    id: 'why-renewal',
    kind: 'why',
    ask: 'Where does the renewal of the Fjord Bank agreement stand, and how did it get there?',
    truths: [
      {
        from: 7,
        answer:
          'Acme proposed 1.35 million NOK a year with a two-year term, Fjord Bank countered with 1.25 million, and they agreed on 1.3 million a year from 1 January 2027 for two years, with quarterly operations reports.',
        expect: [millions(1, 3)],
        sources: ['ana-proposal', 'kari-counter', 'renewal-agreed'],
        rubric: [
          { id: 'proposed', text: 'Acme proposed 1.35 million NOK a year with a two-year term' },
          { id: 'countered', text: 'Fjord Bank countered with 1.25 million' },
          { id: 'agreed', text: 'They agreed on 1.3 million NOK a year from 1 January 2027, for two years' },
          { id: 'reports', text: 'Quarterly operations reports are included' },
        ],
      },
    ],
  },
  {
    id: 'open-relaunch',
    kind: 'open',
    ask: "What is still open or undecided on Northwind's website relaunch?",
    truths: [
      {
        from: 2,
        answer: "Whether to pay Fram for a higher API limit or accept a later migration, and whether to host on Azure or AWS. Mona's approval of the cookie banner is also needed before launch.",
        expect: [],
        sources: ['per-hosting', 'mona-matomo', 'cara-api', 'ana-choice'],
        rubric: [
          { id: 'api', text: "How to deal with Fram's API limit: pay for a higher limit or accept a slower migration" },
          { id: 'hosting', text: 'Whether to host on Azure or AWS' },
          { id: 'cookie', text: 'The cookie banner still needs Mona Lie’s approval' },
        ],
      },
      {
        from: 3,
        answer:
          "How to deal with Fram's API limit (Gunnar won't pay 20,000 a month; to be decided at the steering group), whether to host on Azure or AWS, and the cookie banner, which Mona will approve once the reject button is as visible as the accept button.",
        expect: [],
        sources: ['gunnar-nopay', 'mona-cookie', 'agenda-monday'],
        rubric: [
          { id: 'api', text: "How to deal with Fram's API limit, to be decided at the steering group" },
          { id: 'hosting', text: 'Whether to host on Azure or AWS' },
          { id: 'cookie', text: 'The cookie banner awaits Mona Lie’s approval, on condition that the reject button is as visible as the accept button' },
        ],
      },
      {
        from: 4,
        answer: "How to speed up the export without the Enterprise plan: Fram offers a one-time bulk export for 15,000 NOK, not yet accepted or dated. The cookie banner still awaits Mona's approval. Hosting is decided: Azure.",
        expect: [],
        sources: ['steering-decisions', 'lars-bulk', 'mona-cookie'],
        rubric: [
          { id: 'export', text: 'How to speed up the export: the one-time bulk export offer (15,000 NOK) is not settled yet' },
          { id: 'cookie', text: 'The cookie banner awaits Mona Lie’s approval' },
          { id: 'not-hosting', text: 'Presents hosting as still undecided', negative: true },
        ],
      },
      {
        from: 5,
        answer: "The cookie banner: Mona has the revised design and reviews it next week. The export and the date are settled (bulk export in January, go-live 15 March), and so is hosting.",
        expect: [],
        sources: ['mona-revision', 'golive-moves'],
        rubric: [
          { id: 'cookie', text: 'The cookie banner awaits Mona Lie’s approval of the revised design' },
          { id: 'not-export', text: 'Presents the API limit or export speed as still undecided', negative: true },
          { id: 'not-hosting', text: 'Presents hosting as still undecided', negative: true },
        ],
      },
      {
        from: 6,
        answer: 'Nothing major is open: the cookie banner is approved, hosting stays on Azure, and the go-live is 15 March.',
        expect: [],
        sources: ['cookie-ok', 'aws-no'],
        rubric: [
          { id: 'not-cookie', text: 'Presents the cookie banner as still awaiting approval', negative: true },
          { id: 'not-hosting', text: 'Presents hosting (Azure or AWS) as still undecided', negative: true },
          { id: 'not-export', text: 'Presents the API limit or export speed as still undecided', negative: true },
        ],
      },
      {
        from: 8,
        answer: 'Whether to add a Swedish version in 2027, which the steering group discusses on 19 October.',
        expect: [],
        sources: ['agenda-19', 'swedish'],
        rubric: [
          { id: 'swedish', text: 'Whether to add a Swedish version in 2027, an open question for the steering group on 19 October' },
          { id: 'not-cookie', text: 'Presents the cookie banner as still awaiting approval', negative: true },
          { id: 'not-hosting', text: 'Presents hosting (Azure or AWS) as still undecided', negative: true },
        ],
      },
    ],
  },
  {
    id: 'open-prestudy',
    kind: 'open',
    ask: "What is still open in Fjord Bank's customer portal pre-study?",
    truths: [
      {
        from: 2,
        answer: 'Whether the mobile app is part of the pre-study.',
        expect: [],
        sources: ['siri-prestudy', 'siri-accept'],
        rubric: [{ id: 'mobile', text: 'Whether the mobile app is part of the pre-study' }],
      },
      {
        from: 6,
        answer: 'Nothing is known to be open. The mobile app was left out; the recommendation is due 13 November.',
        expect: [],
        sources: ['mobile-out'],
        rubric: [{ id: 'not-mobile', text: 'Presents whether the mobile app is included as still open', negative: true }],
      },
      {
        from: 8,
        answer: 'Whether Fjord Bank keeps control over its customer data with a bought platform, which gets a workshop on 3 November. They lean towards buying.',
        expect: [],
        sources: ['prestudy-status'],
        rubric: [
          { id: 'data-control', text: 'Whether Fjord Bank keeps control over its customer data with a bought platform' },
          { id: 'workshop', text: 'A workshop on that is planned for 3 November' },
          { id: 'not-mobile', text: 'Presents whether the mobile app is included as still open', negative: true },
        ],
      },
    ],
  },
];
