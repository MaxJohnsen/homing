import { Wordmark } from '@/components/wordmark';
import { demoHosts, hostBackground } from '@/demo-hosts';

/** The real card build, shown in frames styled like the assistants it runs in. */
export function CardPreview({ sample }: { sample?: 'long' | 'request' | 'space' | 'members' | 'publish' | 'task' | 'archive' | 'convert' | 'done' | 'refused' }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <Wordmark />
        <h1 className="text-2xl font-semibold tracking-tight">Approval card</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          The card takes the host’s colors, font and corners. These frames use approximate host styles; a real conversation sends its own.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {Object.entries(demoHosts).map(([key, host]) => (
          <figure key={key} className="flex min-w-0 flex-col gap-2">
            <figcaption className="text-sm text-muted-foreground">{host.label}</figcaption>
            <div className="overflow-hidden rounded-xl border" style={{ background: hostBackground[key] }}>
              <iframe title={`Approval card in ${host.label}`} src={`/card.html?host=${key}${sample ? `&sample=${sample}` : ''}`} className={`block w-full border-0 ${sample === 'done' || sample === 'refused' ? 'h-[20rem]' : sample === 'space' || sample === 'convert' ? 'h-[60rem]' : sample ? 'h-[46rem]' : 'h-[34rem]'}`} />
            </div>
          </figure>
        ))}
      </div>
    </main>
  );
}
