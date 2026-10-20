import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { ApprovalCard, type Done } from '@/approval-card';
import { demoHosts, hostBackground } from '@/demo-hosts';
import type { ProposalData } from '@/lib/proposals';
import { longProposal, proposal as sample, requestProposal } from '@/sample';
import './card.css';

// Inside Claude, the card shows the proposal the assistant just made and lets the person decide
// it. It reaches Homing only through the assistant, with tools the model can't see. Outside an
// assistant, ?host= previews it with a host's approximate styles, ?sample=long a longer rule, and ?sample=request a request to a space's admins.
const params = new URLSearchParams(location.search);
const demo = demoHosts[params.get('host') ?? ''];

type Shown = { proposal?: ProposalData };

const app = new App({ name: 'Homing', version: '1' });
let connecting: Promise<void> | undefined;

function Card() {
  const [proposal, setProposal] = useState<ProposalData>();
  const [message, setMessage] = useState<string>();
  const [done, setDone] = useState<Done>();

  useEffect(() => {
    // The host can draw the card again later, so it always asks Homing how things stand now.
    app.ontoolresult = async (result) => {
      const { proposal: id, done } = (result.structuredContent ?? {}) as { proposal?: string; done?: Done };
      // A change that needed no decision, such as a new space, shows what was done. A refused one, that nothing changed.
      if (done) setDone(done);
      if (!id && !done) setMessage(result.isError ? 'Nothing changed in Homing.' : undefined);
      if (!id) return;
      const shown = await app.callServerTool({ name: 'approval', arguments: { proposal: id } }).catch(() => undefined);
      const current = (shown?.structuredContent as Shown | undefined)?.proposal;
      if (current) setProposal(current);
      else setMessage('Homing couldn’t show this change. Ask for the link to it instead.');
    };
    app.onhostcontextchanged = applyHost;
    connecting ??= app.connect().then(() => applyHost(app.getHostContext() ?? {}));
  }, []);

  return (
    <ApprovalCard
      key={proposal?.id}
      proposal={proposal}
      done={done}
      onOpen={(link) => void app.openLink({ url: link }).catch(() => {})}
      message={message}
      decide={async (approve, onlyHere, space) => {
        if (!proposal) return;
        const result = await app
          .callServerTool({ name: 'decide', arguments: { proposal: proposal.id, approve, onlyHere, shown: proposal.rule?.text, ...(space && { space }) } })
          .catch(() => undefined);
        if (!result) return 'Homing couldn’t be reached. Try again.';
        const decided = (result.structuredContent as Shown | undefined)?.proposal;
        if (decided) setProposal(decided);
        if (result.isError) return result.content.map((block) => (block.type === 'text' ? block.text : '')).join(' ');
        // So the assistant knows without asking. Hosts that don't take it lose nothing.
        app
          .updateModelContext({
            content: [{ type: 'text', text: `The user ${approve ? (proposal.action === 'space' ? 'created the space in' : 'approved') : 'rejected'} proposal:${proposal.id} in Homing's card.` }],
          })
          .catch(() => {});
      }}
    />
  );
}

function applyHost(context: McpUiHostContext) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

/** The card outside an assistant, deciding on sample data, or showing a change made without a decision. */
function Preview() {
  const [shown, setShown] = useState(params.get('sample') === 'long' ? longProposal : params.get('sample') === 'request' ? requestProposal : sample);
  const sending = Boolean(shown.request && !shown.request.sent);
  if (params.get('sample') === 'done') {
    return <ApprovalCard done={{ heading: 'Space created', name: 'Globex', detail: 'A space of its own. Only you have it so far.', link: '/' }} onOpen={() => {}} />;
  }
  if (params.get('sample') === 'refused') return <ApprovalCard message="Nothing changed in Homing." />;
  return (
    <ApprovalCard
      proposal={shown}
      decide={async (approve) =>
        void setShown(sending && approve ? { ...shown, state: 'requested', request: { ...shown.request!, sent: true } } : { ...shown, state: approve ? 'approved' : 'rejected' })
      }
    />
  );
}

if (demo) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(demo.variables)) root.style.setProperty(name, value);
  root.dataset.theme = demo.theme;
  document.body.style.background = hostBackground[params.get('host')!];
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="p-3">{demo ? <Preview /> : <Card />}</div>
  </StrictMode>,
);
