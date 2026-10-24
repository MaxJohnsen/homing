# Running Homing

How to run your own Homing. It is one Docker image next to PostgreSQL, started with Docker Compose. How it works inside is in the [architecture](architecture.md).

## Start it

You need Docker and a copy of this repository. Compose builds the image from it.

```sh
echo "HOMING_SECRET=$(openssl rand -base64 32)" >> .env
docker compose up -d --build
docker compose logs homing
```

The log shows a link for creating the first account. It works once, for an hour; restart Homing for a new one. That account looks after this Homing: it invites the people who use it, but gets no access to their spaces. Your account page then shows the address to add to your assistants as a connector.

Keep the secret. It signs sessions, protects the keys that sign assistants' tokens, and seals the sign-ins of connected accounts, such as people's Microsoft 365. Changing it signs everyone out, stops assistants from getting new tokens, and makes each connected account need its owner to sign in again.

The log also shows what assistants ask Homing for, such as `mcp: Claude tools/call act`, but never what they send.

## HTTPS

Claude.ai and ChatGPT reach Homing at a public HTTPS address, and passkeys need HTTPS everywhere but localhost. Put Homing behind a reverse proxy that handles HTTPS, such as Caddy, and set `HOMING_URL` to the address people use. Compose publishes Homing only on this machine, at `127.0.0.1:4100`, for the proxy to forward to.

Then set `HOMING_TRUSTED_PROXIES` to the proxy's address, so sign-in's rate limits count each client by its own address. A proxy on the same machine reaches Homing through Docker's network, which `172.16.0.0/12` usually covers.

## Settings

Put them in `.env`, next to `compose.yaml`.

| Setting | What it does |
|---|---|
| `HOMING_URL` | Where people and assistants reach Homing, such as `https://homing.example.com`. Passkeys belong to its host name. Defaults to `http://localhost:4100` |
| `HOMING_SECRET` | Required: at least 32 random characters. Homing won't start without it, unless it listens only on localhost, as `npm test` does |
| `HOMING_TRUSTED_PROXIES` | The reverse proxies in front of Homing, as addresses or ranges. Only they can say who a client is, with `X-Forwarded-For` |
| `HOMING_ASSISTANT_SITES` | The sites whose assistants may connect, by the host of their client metadata document. Defaults to `claude.ai,chatgpt.com`; `*` allows any |
| `HOMING_PASSWORDS` | `off` turns off signing in with a password. Passkeys always work |
| `SMTP_URL` | For sending invites and sign-in links by email, such as `smtps://user:password@smtp.example.com`. Without it, Homing sends no email |
| `HOMING_EMAIL_FROM` | Who Homing's email comes from, such as `Homing <homing@example.com>` |
| `MICROSOFT_CLIENT_ID` | Lets people connect their Microsoft 365 or Outlook.com mailbox: the application (client) ID of this Homing's app registration. See [Microsoft 365](#microsoft-365) |
| `MICROSOFT_TENANT` | Which Microsoft accounts may connect: `common`, the default, for work and personal accounts; `organizations` for work accounts only; or one organization's directory (tenant) ID |
| `MICROSOFT_CERTIFICATE` | The app's certificate and its private key, in one PEM file: the file's path as Homing sees it, or the PEM itself, with `\n` for line breaks |
| `MICROSOFT_CLIENT_SECRET` | A client secret, instead of a certificate, if you can't use one |

## Microsoft 365

People connect their mailbox from a space's Connections, signing in on Microsoft's own page. For that, your Homing needs an app registration of its own in Microsoft Entra ID. It asks only for delegated permissions: Homing reads mail as the person who connected it, nobody else's, and can't send, change or delete anything.

1. In the [Microsoft Entra admin center](https://entra.microsoft.com), under App registrations, choose New registration.
   - **Name:** Homing, or what people know your Homing as. They see it on Microsoft's page.
   - **Supported account types:** "Accounts in any organizational directory and personal Microsoft accounts" lets anyone connect a work or personal account, and goes with `MICROSOFT_TENANT=common`. "Accounts in any organizational directory" takes work accounts only (`organizations`), and "this organizational directory only" your own organization's (its directory ID).
   - **Redirect URI:** platform Web, your `HOMING_URL` followed by `/connections/microsoft/callback`, such as `https://homing.example.com/connections/microsoft/callback`. A local install uses `http://localhost:4100/connections/microsoft/callback`.
2. Under API permissions, add Microsoft Graph's delegated permissions `openid`, `profile`, `email`, `offline_access`, `User.Read` and `Mail.Read`, and no application permissions.
3. Make a certificate, and upload `certificate.pem` under Certificates & secrets. It holds no key. Keep `microsoft.pem` on the server alone, owned by user 1000, which Homing runs as in its container, and readable only by it.

   ```sh
   openssl req -x509 -newkey rsa:2048 -nodes -days 730 -subj "/CN=Homing" -keyout key.pem -out certificate.pem
   cat key.pem certificate.pem > microsoft.pem && rm key.pem && chmod 600 microsoft.pem
   sudo chown 1000:1000 microsoft.pem
   ```

   Before it expires, upload a new one beside it, then switch Homing to it. From a month before, Homing warns in its log when it starts. A client secret works too, but a certificate's key never leaves your server.
4. Set the application (client) ID from the registration's overview, and the certificate, in `.env`, and mount the file in a `compose.override.yaml` next to `compose.yaml`:

   ```sh
   MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000
   MICROSOFT_TENANT=common
   MICROSOFT_CERTIFICATE=/run/homing/microsoft.pem
   ```

   ```yaml
   services:
     homing:
       volumes:
         - ./microsoft.pem:/run/homing/microsoft.pem:ro
   ```

   Then `docker compose up -d`. Homing won't start with a Microsoft setting it can't use, and says which.

Without these settings, a space's Connections tells whoever looks after Homing how to set it up, and everyone else that nothing can be connected yet.

### For an organization

An organization decides in its own Entra ID who may connect, under Enterprise applications, where Homing appears once someone there has signed in to it.

- **Admin consent.** Many organizations let people allow only apps from verified publishers, so their admin approves Homing first, for everyone there. An admin connects their own mailbox and ticks "Consent on behalf of your organization" on Microsoft's page, or, under Enterprise applications, opens Homing and chooses Permissions, then "Grant admin consent".
- **Assignment required.** To let only some people connect, open Homing under Enterprise applications, set "Assignment required?" to Yes in its Properties, and add those people or their groups under Users and groups. Microsoft turns everyone else away on its own page.

Revoking an account in Homing deletes Homing's sign-in for it. Someone who also wants to withdraw their consent on Microsoft's side does it at [My Apps](https://myapps.microsoft.com) for a work account, or at [account.live.com/consent/Manage](https://account.live.com/consent/Manage) for a personal one. An organization that deletes or disables Homing under its Enterprise applications, or withdraws its consent, stops it for everyone there: each of their connections needs attention the next time Homing uses it. If Microsoft instead refuses Homing itself, as with a certificate or secret it doesn't know, nobody's connection is marked: the log says which setting to check.

## Updating

```sh
git pull
docker compose up -d --build
```

Migrations run before the server starts. Back up the database and `.env` together, since a restored database needs the same secret.

Claude.ai keeps the list of Homing's tools it got when someone connected it. After an update that changes the tools, such as one that adds the approval card, people disconnect Homing in Claude.ai's connector settings and connect it again.

## When someone can't sign in

With email, "Can't sign in?" on the sign-in page sends a one-time link to the person's verified address. Without email, you give them one. It works once, for 15 minutes, and only signs them in, so they can add a new passkey:

```sh
docker compose exec homing node src/cli.ts sign-in-link ana@example.com
```
