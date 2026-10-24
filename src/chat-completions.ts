// The Chat Completions API that OpenRouter, OpenAI and model servers such as Ollama all speak
// (spec §11): the first adapter behind Homing's model interface in provider.ts, and the only code
// that knows how its provider is spoken to. Only model.ts makes one. The key goes in the
// Authorization header to the provider and nowhere else. Nothing the provider sends back, which
// may repeat the prompt or the key, goes into an error: only its status, and a code such as
// invalid_api_key, of lowercase letters and underscores.

import type { ModelSettings } from './model.ts';
import { ProviderFailed, ProviderRefused, type Provider } from './provider.ts';

/** The most of an answer Homing reads. A model writes far less within its limit. */
const mostBytes = 8 * 1024 * 1024;

/** An adapter for the provider at the settings' address. */
export function chatCompletions(settings: Pick<ModelSettings, 'url' | 'key'>): Provider {
  const endpoint = new URL(`${settings.url.pathname.replace(/\/$/, '')}/chat/completions`, settings.url);
  // OpenRouter says what each call cost when asked, and OpenAI takes the limit on writing by another name.
  const openRouter = settings.url.hostname === 'openrouter.ai';
  const openAi = settings.url.hostname === 'api.openai.com';
  return {
    async chat(request, signal) {
      const body = {
        model: request.model,
        messages: request.messages,
        [openAi ? 'max_completion_tokens' : 'max_tokens']: request.maxTokens,
        ...(request.schema && { response_format: { type: 'json_schema', json_schema: { name: request.schema.name, schema: request.schema.schema, strict: true } } }),
        ...(openRouter && { usage: { include: true } }),
        stream: false,
      };
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(settings.key && { authorization: `Bearer ${settings.key}` }) },
          body: JSON.stringify(body),
          // Never followed, so the key never goes anywhere else.
          redirect: 'error',
          signal,
        });
      } catch {
        throw new ProviderFailed(signal.aborted ? 'it took too long' : 'the provider couldn’t be reached');
      }
      let json: any;
      try {
        json = JSON.parse(await textOf(response));
      } catch {
        if (signal.aborted) throw new ProviderFailed('it took too long');
        json = undefined;
      }
      const reported = json?.usage?.cost;
      const cost = typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 ? reported : undefined;
      const content = json?.choices?.[0]?.message?.content;
      if (!response.ok || json === undefined || json.error || typeof content !== 'string') {
        const code = [json?.error?.code, json?.error?.type].find((value) => typeof value === 'string' && /^[a-z_]{1,40}$/.test(value));
        const reason = `the provider answered ${response.status}${code ? ` (${code})` : ''}`;
        // Only the provider's own answer to a request it won't take comes before any model ran.
        if (response.status >= 400 && response.status < 500 && json !== undefined) throw new ProviderRefused(reason, cost);
        throw new ProviderFailed(response.ok && json !== undefined && !json.error ? 'the provider’s answer had no text' : reason, cost);
      }
      return { text: content, inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens, cost };
    },
  };
}

/** The answer's text, up to the most Homing reads. */
async function textOf(response: Response): Promise<string> {
  if (!response.body) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    // Leaving the loop stops the rest from coming.
    if (size > mostBytes) throw new Error('too long');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
