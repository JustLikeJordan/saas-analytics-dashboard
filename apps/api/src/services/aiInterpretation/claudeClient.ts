import Anthropic from '@anthropic-ai/sdk';

import { env } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { ExternalServiceError } from '../../lib/appError.js';
import { CircuitBreaker } from '../../lib/circuitBreaker.js';

const client = new Anthropic({
  apiKey: env.CLAUDE_API_KEY,
  maxRetries: 2,
  timeout: 15_000,
});

class AbortedByClient extends Error {
  constructor() { super('aborted by client'); }
}

// 3 consecutive failures → open for 30s. Anthropic SDK already retries twice
// per call, so 3 trips = 9 failed attempts over ~45s of real outage.
const breaker = new CircuitBreaker({
  name: 'claude-api',
  threshold: 3,
  cooldownMs: 30_000,
  isIgnored: (err) => err instanceof AbortedByClient,
});

export async function checkClaudeHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now();
  try {
    await client.models.list({ limit: 1 });
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Claude API health check failed');
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

export async function generateInterpretation(prompt: string): Promise<string> {
  return breaker.exec(async () => {
    try {
      const message = await client.messages.create({
        model: env.CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = message.content[0];
      const text = block?.type === 'text' ? block.text : '';

      logger.info(
        { model: env.CLAUDE_MODEL, usage: message.usage },
        'Claude API response received',
      );

      return text;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError) {
        logger.error({ err: (err as Error).message }, 'Claude API non-retryable error');
      } else {
        logger.warn({ err: (err as Error).message }, 'Claude API retryable error exhausted');
      }

      throw new ExternalServiceError('Claude API', {
        originalError: (err as Error).message,
      });
    }
  });
}

export interface StreamResult {
  fullText: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function streamInterpretation(
  prompt: string,
  onText: (delta: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  // client-initiated aborts are intentional — don't let them trip the breaker
  return breaker.exec(async () => {
    try {
      const stream = client.messages.stream({
        model: env.CLAUDE_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      if (signal) {
        const onAbort = () => stream.abort();
        signal.addEventListener('abort', onAbort, { once: true });
        stream.on('end', () => signal.removeEventListener('abort', onAbort));
      }

      stream.on('text', (delta) => onText(delta));

      const finalMessage = await stream.finalMessage();

      logger.info(
        { model: env.CLAUDE_MODEL, usage: finalMessage.usage },
        'Claude API stream completed',
      );

      const block = finalMessage.content[0];
      const fullText = block?.type === 'text' ? block.text : '';

      return {
        fullText,
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    } catch (err) {
      if (signal?.aborted) {
        logger.info({ aborted: true }, 'Claude API stream aborted by client');
        throw new AbortedByClient();
      }

      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.BadRequestError) {
        logger.error({ err: (err as Error).message }, 'Claude API stream non-retryable error');
      } else {
        logger.warn({ err: (err as Error).message }, 'Claude API stream retryable error exhausted');
      }

      throw err;
    }
  });
}
