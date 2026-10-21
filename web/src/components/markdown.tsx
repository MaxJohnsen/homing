import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from 'cn';
import { focusRing } from '@/components/screen';
import { Link } from '@/lib/router';

const pageRef = /^page:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Links between pages, as assistants write them, open the page; anything unsafe, such as a script, goes. */
function urlOf(url: string): string {
  const page = pageRef.exec(url);
  return page ? `/pages/${page[1].toLowerCase()}` : defaultUrlTransform(url);
}

const link = cn('rounded-sm text-primary-ink underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary', focusRing);

// The type scale has room for one heading size inside a page, so every heading in an item takes it.
const heading = 'text-lg leading-snug font-semibold tracking-[-0.01em] mt-2';

const components: Components = {
  h1: ({ node: _, ...props }) => <p role="heading" aria-level={2} className={heading} {...props} />,
  h2: ({ node: _, ...props }) => <p role="heading" aria-level={2} className={heading} {...props} />,
  h3: ({ node: _, ...props }) => <p role="heading" aria-level={3} className={heading} {...props} />,
  h4: ({ node: _, ...props }) => <p role="heading" aria-level={4} className={heading} {...props} />,
  h5: ({ node: _, ...props }) => <p role="heading" aria-level={5} className={heading} {...props} />,
  h6: ({ node: _, ...props }) => <p role="heading" aria-level={6} className={heading} {...props} />,
  a: ({ node: _, href = '', children }) =>
    href.startsWith('/') ? (
      <Link href={href} className={link}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={link}>{children}</a>
    ),
  // Pictures would load from wherever an assistant pointed, telling that site who reads the page. They show as links instead.
  img: ({ node: _, src, alt }) =>
    typeof src === 'string' && src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow" className={link}>{alt || 'A picture'}</a>
    ) : null,
  ul: ({ node: _, ...props }) => <ul className="flex list-disc flex-col gap-1 pl-6" {...props} />,
  ol: ({ node: _, ...props }) => <ol className="flex list-decimal flex-col gap-1 pl-6" {...props} />,
  blockquote: ({ node: _, ...props }) => <blockquote className="rounded-lg bg-muted px-4 py-2" {...props} />,
  code: ({ node: _, className, ...props }) => <code className={cn('rounded bg-muted px-1 py-0.5 text-[0.9em]', className)} {...props} />,
  pre: ({ node: _, ...props }) => <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm [&_code]:bg-transparent [&_code]:p-0" {...props} />,
  table: ({ node: _, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm [&_td]:py-1.5 [&_td]:pr-4 [&_th]:py-1.5 [&_th]:pr-4 [&_th]:font-semibold [&_tr]:align-top" {...props} />
    </div>
  ),
  hr: () => <div className="h-4" />,
};

/** An item's text, which is Markdown, at reading size. HTML written into it never runs. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('flex max-w-[65ch] min-w-0 flex-col gap-3 text-base leading-[1.65] break-words [&_strong]:font-semibold', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlOf} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
