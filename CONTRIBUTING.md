# Contributing

Homing is still being designed, so the most useful contribution right now is a question or a challenge to the concept. Open an issue.

## Development

You need Node.js 24 or later and Docker.

```sh
docker compose up -d db   # PostgreSQL on port 5442
npm install
npm run check             # type checking
npm test                  # recreates the test database and runs the tests
npm run dev:web           # the screens, with sample data, at http://localhost:5173
```

To try the app against a whole Homing, `npm run sample -- big` builds one with about 100 spaces, 10,000 pages, 100,000 sources and 30 changes waiting, in a database of its own, and serves it at http://localhost:4200. `npm run sample -- empty` is one where someone has just joined. Both need `npm run build:web` first, and print how to sign in.

Test runs side by side, such as in two worktrees, each need a database of their own: `HOMING_TEST_DB=homing_test_b npm test`. Samples take `HOMING_SAMPLE_DB` and `HOMING_SAMPLE_PORT` the same way.

### Running it

[Running Homing](docs/deployment.md) explains settings, HTTPS and updates. For a local try:

```sh
echo "HOMING_SECRET=$(openssl rand -base64 32)" >> .env   # once
docker compose up -d --build
docker compose logs homing   # shows the link for creating the first account
```

### Trying it with Claude Code

Start a space for a client with New space in the sidebar, then connect Claude Code:

```sh
claude mcp add --transport http homing http://localhost:4100/mcp
```

The first time Claude Code connects, it opens Homing in your browser: sign in and allow it. You can also ask Claude Code to create the space. Then ask it to remember something for that client, and ask about it in a new session. Ask it to add a rule for the client: it gives you a link to Homing, where you see the exact rule and approve it. Ask it to write a report for the client, and the rule comes with the context. Your account page lists Claude Code, and disconnecting it there stops it at once.

Until the web app can, a small command-line tool imports skills, and `node src/cli.ts` lists its commands. It acts as whoever you name, without sign-in, so treat it like the database password. An agent that can run commands on the same machine, such as Claude Code, can use it too, and can change skills with it, so don't rely on "only people change guidance" there.

To add a skill, run the command line from your checkout instead, so it can read the skill's folder on your computer. It connects to the database from Docker Compose.

```sh
node src/cli.ts import-skill <your id> <space id> ~/skills/status-report
```

## Releasing

Versions follow [Semantic Versioning](https://semver.org). Until 1.0, a minor version may include breaking changes, and its notes say so.

A release starts as a draft:

```sh
gh release create v0.1.0 --draft --generate-notes
```

GitHub lists the merged pull requests. Add a few sentences on top about what's new and anything to do when upgrading, then publish. Publishing builds the Docker image for amd64 and arm64 and pushes it to `ghcr.io/maxjohnsen/homing` as `0.1.0`, `0.1` and `latest`. Published releases can't be changed.

## License

Homing is licensed under AGPL-3.0. To keep the option of offering it under other terms later, for example a commercial license for organizations that can't use AGPL, contributors will be asked to sign a short contributor agreement before their first pull request is merged. You keep the copyright to your work. The agreement only gives the project the right to relicense it.

The agreement will be published here before any outside code is accepted.
