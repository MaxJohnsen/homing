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
  /** For a rule another space's guidance includes, the include that brings it. Null for one set where it applies. */
  includedIn?: InclusionData | null;
}

/** Where an included rule or skill is included: the space, unnamed if you can't open it, and for whom. */
export interface InclusionData {
  id: string;
  spaceId: string | null;
  spaceName: string | null;
  /** Included for everyone in that space, or only for you. */
  shared: boolean;
}

/**
 * Another space whose rules a space's guidance includes, even before it has any. For an admin, one
 * for everyone that they can't open shows only that it's there: no space, but who added it and when.
 */
export interface IncludeSummary {
  id: string;
  spaceId: string | null;
  spaceName: string | null;
  shared: boolean;
  /** Yours, waiting while the space includes the same for everyone. */
  waiting?: boolean;
  addedBy?: string | null;
  addedAt?: string;
}

/** Your own include of a skill, waiting while the space includes it for everyone. */
export interface WaitingSkill {
  id: string;
  name: string;
  /** Where the skill is set. */
  spaceName: string;
}

/** What you could include in a space: other spaces you can open, and the skills in them. Only yours can be included only for you. */
export interface IncludableData {
  spaces: { id: string; name: string; label: string; onlyYours: boolean }[];
  skills: { id: string; name: string; description: string; from: string; onlyYours: boolean }[];
}

/** What changing rules does. Each resolves to a message to show, or nothing when it worked. */
export interface RuleActions {
  add(input: { kind: RuleKind; text: string; shared: boolean; onlyHere: boolean }): Promise<string | undefined>;
  edit(id: string, text: string): Promise<string | undefined>;
  remove(id: string): Promise<string | undefined>;
  /** Includes another space's rules, or a skill, for everyone or only for you. */
  include(input: { space?: string; skill?: string; shared: boolean }): Promise<string | undefined>;
  /** Stops including it. */
  stopIncluding(id: string): Promise<string | undefined>;
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
  /** For a skill another space's guidance includes, the include that brings it. */
  includedIn?: InclusionData | null;
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
