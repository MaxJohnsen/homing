// A stand-in for a model provider's Chat Completions API, which is outside Homing. It answers as
// OpenRouter does, with the tokens and what the call cost, unless a test says otherwise, and
// refuses a key it doesn't know the way OpenAI does, repeating the key. It keeps what it was
// asked, so a test can see what was sent, and that nothing was.

import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { modelFromEnvironment, modelOf, type Model } from '../src/model.ts';

/** A request as the stand-in got it. */
export interface Asked {
  body: any;
  authorization?: string;
}

/** How the stand-in answers a request: a status and JSON, or raw text, after a while if it says. */
export interface Reply {
  status?: number;
  json?: unknown;
  raw?: string;
  delayMs?: number;
}

/** A short answer, 40 tokens in and 100 out, at $0.001, as OpenRouter reports it. */
export const plainReply = (text = 'Acme’s launch moved to April.'): Reply => ({
  json: { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 100, cost: 0.001 } },
});

export class ModelStandIn {
  url = '';
  /** The key it takes, which a test hands Homing. */
  readonly key = `sk-test-${randomBytes(24).toString('hex')}`;
  asked: Asked[] = [];
  /** How it answers the next request. */
  reply: (body: any) => Reply | Promise<Reply> = () => plainReply();
  private server?: Server;

  async start(): Promise<this> {
    this.server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      this.asked.push({ body, authorization: req.headers.authorization });
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return void res.writeHead(404).end();
      if (req.headers.authorization !== `Bearer ${this.key}`) {
        const given = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
        res.writeHead(401, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${given}.`, type: 'invalid_request_error', code: 'invalid_api_key' } }));
      }
      const reply = await this.reply(body);
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      if (res.destroyed) return;
      res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
      res.end(reply.raw ?? JSON.stringify(reply.json));
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  /** Homing's model, set up the way a self-hoster would, with prices for the stand-in's two models. */
  model(env: Record<string, string> = {}): Model {
    const settings = modelFromEnvironment({
      MODEL_API_URL: `${this.url}/v1`,
      MODEL_API_KEY: this.key,
      MODEL_DEFAULT: 'test/capable',
      MODEL_CHEAPER: 'test/cheaper',
      MODEL_PRICES: 'test/capable=2/10, test/cheaper=0.1/0.5',
      ...env,
    })!;
    return modelOf(settings);
  }

  async close() {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }
}
