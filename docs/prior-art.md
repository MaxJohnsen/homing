# Prior art

Homing builds on ideas that already work. This page credits them and says where Homing goes further.

## What we learned from

**[Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).** An agent compiles raw sources into a Markdown wiki and keeps it current, instead of re-deriving answers every time. Homing's knowledge pages follow this idea. Its known weakness, pages that drift after many rewrites, is why Homing ties every item to its sources and never rewrites text from its own previous version.

**[Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format).** Google's portable Markdown format for that kind of wiki, with provenance and free-text page types. Homing exports knowledge in it, version 0.2.

**[CLAUDE.md](https://code.claude.com/docs/en/memory) and [AGENTS.md](https://agents.md).** Instruction files that cascade down a folder tree. Homing's guidance inherits the same way, but resolves conflicts by rule instead of leaving them to the model.

**[Agent Skills](https://agentskills.io).** The SKILL.md format for reusable instructions. Homing stores skills in that shape and exports them as they are.

**[Model Context Protocol](https://modelcontextprotocol.io).** The standard way agents reach tools, and Homing's only required interface.

**Agent memory systems** such as [mem0](https://github.com/mem0ai/mem0), [Letta](https://github.com/letta-ai/letta), [Graphiti](https://github.com/getzep/graphiti), [Basic Memory](https://github.com/basicmachines-co/basic-memory) and [OpenViking](https://github.com/volcengine/OpenViking). Together they showed that Markdown with a rebuildable index works, that outdated facts should be superseded rather than deleted, and that privacy has to hold in every index, not just the main one.

**[Guru](https://www.getguru.com) and [GitHub Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory).** Knowledge stays trustworthy when it is verified, cited and allowed to expire.

## Where Homing goes further

We haven't found a system that combines three things:

- shared knowledge with a private layer for each person,
- deliberate, authorized sharing from private to shared,
- guidance that inherits down a deep tree of spaces.

The pieces exist separately. Homing's bet is that they belong together.
