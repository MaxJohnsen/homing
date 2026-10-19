/** A space in the sidebar. A space whose parent you can't open sits at the top for you. */
export interface SpaceSummary {
  id: string;
  name: string;
  parentId: string | null;
  closed: boolean;
  /** Your personal space, at the top of your personal tree. */
  personal: boolean;
  /** In your personal tree, so only you have it. */
  private: boolean;
  /** Whether you're an admin of it. */
  admin: boolean;
}

/** Someone who can open a space, directly or through a space above it. */
export interface SpaceMember {
  id: string;
  name: string;
  admin: boolean;
  /** Whether they're a member of this space itself. */
  member: boolean;
  /** The nearest space above whose members have access, if they're one of them. */
  through: string | null;
  you: boolean;
}

/** A space as its own screen shows it. */
export interface SpaceData extends SpaceSummary {
  /** The spaces above it that you can open, from the top down. */
  path: { id: string; name: string }[];
  /** Whether people in a space above it that you can't open have access too. */
  reachedFromAbove: boolean;
  members: SpaceMember[];
}

/** Your personal space first, then the others in the order they were made. */
export function inOrder<T extends Pick<SpaceSummary, 'personal'>>(spaces: T[]): T[] {
  return [...spaces].sort((a, b) => Number(b.personal) - Number(a.personal));
}
