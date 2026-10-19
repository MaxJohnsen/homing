# The Homing concept

Homing gives people and their agents the right **working context**: what to know, how to behave and where things live. It does this across every place they work, and it lets them improve that context together.

> **Homing learns automatically, shares deliberately, and changes behavior consciously.**

It is generic. It works for a freelancer, a family, a company or a network of partners. Homing doesn't need to be the one place all knowledge lives. It makes knowledge that different people and organizations own work together.

| Concept | The question it answers |
|---|---|
| Space | Where does it belong? |
| Membership | Who can access it? |
| Guidance | How should an agent behave? |
| Knowledge | What do we know? |
| Records | What are we working on? |
| Connections | How do we reach external systems? |
| Routines | What should happen automatically? |
| MCP | How do agents talk to Homing? |

---

## Spaces

| Term | Meaning |
|---|---|
| **Space** | Where things live. Every space has a **shared side**, which all its members see, and a **private side** for each member, which only that member sees. |
| **Parent** | Where a space belongs. A space has at most one parent. A space without a parent is a **root**, and anyone can create one. |
| **Membership** | Who can work in a space. Membership flows down to child spaces, except into spaces marked **closed**. |
| **Link** | Two spaces are related. A link grants no access and imports nothing. |
| **Archived** | A finished space. It leaves everyday context and its routines pause, but it stays searchable and can be reopened. Archiving never deletes anything. |
| **Personal space** | Every person has one. Its guidance follows you everywhere. Spaces you create under it are only yours, and Homing never asks about sharing there. Inviting someone makes such a space collaborative. |

You have a private side in every space you can access, including spaces you can access only through a parent.

## What lives in a space

**Guidance** tells agents how to behave.
- A **rule** is either a *requirement* (must be followed) or a *preference* (can be overridden by a more specific one).
- A **skill** describes how to do a task.
- Guidance applies to its space and every space below it, unless it is marked *only here*.
- Guidance can include other guidance instead of copying it. Including it never gives anyone access to it.

**Knowledge** is what is known. **Sources** (emails, meetings, documents) are compiled into **pages**, one per subject worth understanding, and every space has an **overview**. Each space's guidance names the types of pages it prefers, but agents may create other types when something deserves a page of its own. Any page can also gather other pages into a **collection**, such as "2027 planning", without moving them.

**Records** are things that get worked on, such as tasks and events.
- Each record has one home: Homing itself or an external system such as Asana.
- Homing shows them together.
- You can add private notes to any record without changing the original.

**Routines** are work that should happen, for example "every Friday, draft the status report". A routine belongs to a person or a space, and it never inherits.

## How it behaves

1. **Working vs publishing.** Agents work freely across everything you can access. Anything others will see counts as publishing: a shared side, an Asana task, an email. Homing only publishes information to people who are allowed to see it. It publishes automatically when sharing is already authorized. Otherwise it asks. Permission can be given in advance, for example by binding a place, such as a mailbox folder or a channel, to a space. What it learns stays private by default, and it only interrupts you when a deliberate sharing decision is needed.
2. **Knowledge maintains itself.** Agents keep pages current, record where every fact came from, and keep conflicting information marked as uncertain instead of guessing. Homing continuously reorganizes and tidies knowledge, while its meaning always stays grounded in the original evidence. What used to be true is kept as history.
3. **Only humans change guidance.** Agents propose changes. Guidance improves through use: your corrections, contradictions with new knowledge, and repeated failures each lead to a proposal.
4. **Conflicts.** The more specific preference wins. Requirements always apply. If two requirements can't both be met, the affected action stops, and you are told which rules conflict so they can be fixed.
5. **Spaces point to places, people hold keys.** A space says where its things live, for example "our tasks are in Acme's Asana". Each person reaches those places through their own **connections**, and agents act as that person. A space can have its own connections for shared automation.
6. **Homing adapts to how you already work.** Files, repositories and apps stay where they are and remain authoritative. Homing is the context layer around them.

## How you use it

- **Your context** in a space is the guidance that applies to you there plus the knowledge you can access, retrieved when it is needed.
- **Homing is fully usable through MCP alone**, from Claude, ChatGPT, Copilot or Claude Code. Client integrations, such as a Claude Code plugin, add automatic context loading and knowledge capture.
- **A web app** covers managing spaces and connections, editing guidance, browsing, and approvals.
- **Every advanced capability is optional and independent.** Homing is useful in its simplest form: spaces, guidance, knowledge and simple tasks used through MCP, with no AI model of its own. Connections, background learning, client integrations and routines each add value, in any combination.

---

*The detailed behavior and guarantees are in the [specification](spec.md).*
