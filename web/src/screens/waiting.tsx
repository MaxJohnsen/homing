import { count, ScreenHeader, Section } from '@/components/screen';
import { placeOf, type WaitingData } from '@/lib/proposals';
import { WaitingRow } from '@/screens/home';

/** Everything waiting for you, grouped by the space it would change. */
export function Waiting({ waiting, now }: { waiting: WaitingData[]; now?: Date }) {
  const spaces = [...new Map(waiting.map((item) => [item.spaceId, item])).values()];
  return (
    <>
      <ScreenHeader
        title="Waiting for you"
        meta={waiting.length ? `${count(waiting.length, 'change', 'changes')} in ${count(spaces.length, 'space', 'spaces')}, oldest first.` : 'Nothing is waiting for you.'}
      />
      {spaces.map((space) => (
        <Section key={space.spaceId} title={placeOf(space).replace(/^your/, 'Your')}>
          <ul className="flex flex-col gap-2">
            {waiting.filter((item) => item.spaceId === space.spaceId).map((item) => <WaitingRow key={item.id} item={item} now={now} compact />)}
          </ul>
        </Section>
      ))}
    </>
  );
}
