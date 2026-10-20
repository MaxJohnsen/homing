import type { RuleKind } from '@/components/proposed-change';

/** A rule that applies in a space, as the space's Guidance shows it. */
export interface RuleData {
  id: string;
  /** The rule's space, or null when it's a space above that you can't open. */
  spaceId: string | null;
  /** The name of the rule's space, or null when you can't open it. */
  spaceName: string | null;
  /** Whether it's in your personal space, whose rules follow you everywhere. */
  personal: boolean;
  kind: RuleKind;
  text: string;
  shared: boolean;
  onlyHere: boolean;
}

/** What changing rules does. Each resolves to a message to show, or nothing when it worked. */
export interface RuleActions {
  add(input: { kind: RuleKind; text: string; shared: boolean; onlyHere: boolean }): Promise<string | undefined>;
  edit(id: string, text: string): Promise<string | undefined>;
  remove(id: string): Promise<string | undefined>;
}

/** A skill that applies in a space, and whether another with its name is used there instead. */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  /** Null when it's set in a space above that you can't open. */
  spaceId: string | null;
  spaceName: string | null;
  shared: boolean;
  /** Whether your assistant gets this one here. */
  used: boolean;
  /** For one that's used, the ones it replaces; for one that isn't, the one used instead. */
  others: { id: string; spaceName: string | null }[];
}

/** A skill as its own page shows it. */
export interface SkillData {
  id: string;
  name: string;
  description: string;
  /** Its space, when you can open it. */
  spaceId: string | null;
  spaceName: string | null;
  shared: boolean;
  /** SKILL.md without its frontmatter. */
  instructions: string;
  files: { path: string; body: string }[];
  /** The skills with its name from the spaces above its own, which it replaces. */
  replaces: { id: string; spaceName: string | null }[];
}
