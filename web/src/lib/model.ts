/** The model this Homing uses, as people are told: the provider, and its models by name. */
export interface ModelStatement {
  provider: string;
  /** For understanding what Homing learns from, and keeping it current. */
  capable: string;
  /** For simple sorting. */
  cheaper: string;
}

/** Model processing in a space: on, or off here or in a space above it. */
export interface ModelProcessingData {
  on: boolean;
  /** When it was turned off in this space, and by whom, if they're someone you can see. */
  offAt: string | null;
  offBy: string | null;
  you: boolean;
  /** Off in a space above, named when you can open it. */
  offAbove: boolean;
  offIn: { id: string; name: string } | null;
}

/** What a call to the model was for. */
export type Purpose = 'understand' | 'upkeep' | 'sort';

export const purposes: Record<Purpose, string> = { understand: 'Understanding', upkeep: 'Upkeep', sort: 'Sorting' };

/** What Homing's model did for you this month, and the limit everyone here shares. */
export interface ModelUseData {
  model: ModelStatement | null;
  limit: number;
  /** Since when learning has been paused at the limit, if it is. */
  pausedAt: string | null;
  uses: {
    purpose: Purpose;
    model: string;
    calls: number;
    cost: number;
    underWay: number;
    /** The spaces it carried that you can open now, and how many others. */
    spaces: { id: string; name: string }[];
    elsewhere: number;
  }[];
}

/** What the model cost this month, for whoever looks after Homing: in all, and person by person. */
export interface ModelSpendingData extends ModelStatement {
  limit: number;
  pausedAt: string | null;
  /** What the monthly limit covers this month: what was spent, and the worst case of the calls under way. */
  spent: number;
  underWay: number;
  people: { name: string | null; calls: number; cost: number; you: boolean }[];
}

/** "$4.20", "$1,204.50", or "under a cent" for less. */
export function usd(value: number): string {
  if (value > 0 && value < 0.005) return 'under a cent';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Claude Sonnet 5.5, and Claude Haiku 5.5 for simple sorting", or one model when they're the same. */
export function modelsOf(model: ModelStatement): string {
  return model.capable === model.cheaper ? model.capable : `${model.capable}, and ${model.cheaper} for simple sorting`;
}
