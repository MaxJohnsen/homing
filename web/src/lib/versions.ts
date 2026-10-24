/**
 * A version's text from a little before where it first differs from the next one, so a long
 * document's versions each show the passage that changed rather than the same opening. It starts
 * at a word about 40 characters before the change, or 40 characters before it when no word starts
 * near there, such as in a long address.
 */
export function fromChange(text: string, next: string): string {
  let at = 0;
  while (at < text.length && text[at] === next[at]) at++;
  if (at < 60) return text;
  const space = text.lastIndexOf(' ', at - 40);
  const start = space > 0 && space >= at - 80 ? space + 1 : at - 40;
  return `…${text.slice(start)}`;
}
