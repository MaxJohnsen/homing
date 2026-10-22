<img src="docs/design/logo.svg" alt="" width="72">

# Homing

AI assistants are good at helping with a single task. They are bad at knowing your work: which project you're in, how things are done there, what was decided last week. That understanding ends up scattered across folders, chats and tools, and every assistant starts from scratch.

Homing is an open-source home for that working context, designed to work with whichever assistant you use.

## Why

If you use AI assistants for real work, some of this will be familiar:

- Each client or project has its own folder of instructions, and they slowly drift apart.
- A colleague's assistant knows things yours doesn't, and there is no safe way to share.
- What your assistant learned last month is either gone or quietly out of date.
- You want help across everything you do, without one client's information ending up in front of another.

## How it works

Your work is organized into spaces: a client, a project, a team, a family. A space holds four things:

- **Guidance:** the rules and skills agents follow there.
- **Knowledge:** what is known, kept current from emails, meetings and documents.
- **Records:** tasks and events, wherever they actually live.
- **Routines:** work that should happen on its own.

Every space has a shared side for its members and a private side for each of them. Agents learn on your private side automatically. Nothing reaches other people unless that sharing is authorized, and only people can change the rules agents follow.

> Homing learns automatically, shares deliberately, and changes behavior consciously.

Agents connect over MCP, so Homing is designed to work from Claude, ChatGPT, Copilot or Claude Code. It runs on your own server, and it is useful without an AI model of its own. Connecting one lets it learn in the background.

## An example

You're a consultant working with three clients. On Monday you ask your assistant to plan the week. It combines the deadlines in each client's task system with your calendar, personal commitments included, and drafts a plan only you can see.

Later, a client moves a launch date. Homing learns about it on your private side and asks whether the project should know. You say yes, and your colleague's assistant now works from the new date too. Your personal plans and your other clients stay private.

## Status

Homing is being designed and built in the open, in three increments:

1. [**The core**](https://github.com/MaxJohnsen/homing/milestone/1), released as [0.1.0](https://github.com/MaxJohnsen/homing/releases/tag/v0.1.0): spaces, guidance, knowledge and simple tasks, used from your assistant over MCP and explored in the web app. No AI model needed. Tested with Claude; ChatGPT is tried next.
2. [**Learning**](https://github.com/MaxJohnsen/homing/milestone/2), being built now: Homing learns from your email on its own, routes what it learns to the right space and keeps knowledge up to date, with a model of your choice.
3. [**Records**](https://github.com/MaxJohnsen/homing/milestone/3): tasks and events in the systems where they live, such as Asana, and planning across them.

## Read more

- [Concept](docs/concept.md): how Homing works, in plain language. Start here.
- [Specification](docs/spec.md): the guarantees and the detailed behavior.
- [Architecture](docs/architecture.md): how it is built.
- [Design](docs/design.md): how its screens look and behave.
- [Running Homing](docs/deployment.md): how to run your own.
- [Prior art](docs/prior-art.md): what already exists, and what we learned from it.

## License

Copyright © 2026 Max Aasbø. Licensed under [AGPL-3.0](LICENSE). Please read [CONTRIBUTING](CONTRIBUTING.md) before opening a pull request.
