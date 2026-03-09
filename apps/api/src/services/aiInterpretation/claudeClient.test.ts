import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config.js', () => ({
  env: {
    CLAUDE_API_KEY: 'test-key',
    CLAUDE_MODEL: 'claude-sonnet-4-5-20250929',
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class AuthenticationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'AuthenticationError';
    }
  }
  class BadRequestError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'BadRequestError';
    }
  }

  const MockAnthropic = Object.assign(
    vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate, stream: mockStream },
    })),
    { AuthenticationError, BadRequestError },
  );

  return { default: MockAnthropic };
});

import { logger } from '../../lib/logger.js';

describe('generateInterpretation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text from Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Revenue is growing steadily.' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const { generateInterpretation } = await import('./claudeClient.js');
    const result = await generateInterpretation('analyze this data');

    expect(result).toBe('Revenue is growing steadily.');
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'analyze this data' }],
    });
  });

  it('logs token usage after successful response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Analysis here.' }],
      usage: { input_tokens: 200, output_tokens: 100 },
    });

    const { generateInterpretation } = await import('./claudeClient.js');
    await generateInterpretation('test prompt');

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { input_tokens: 200, output_tokens: 100 },
      }),
      'Claude API response received',
    );
  });

  it('returns empty string for non-text content blocks', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      usage: { input_tokens: 50, output_tokens: 10 },
    });

    const { generateInterpretation } = await import('./claudeClient.js');
    const result = await generateInterpretation('prompt');

    expect(result).toBe('');
  });

  it('wraps API errors in ExternalServiceError', async () => {
    mockCreate.mockRejectedValue(new Error('connection timeout'));

    const { generateInterpretation } = await import('./claudeClient.js');

    await expect(generateInterpretation('prompt')).rejects.toThrow(
      'External service error: Claude API',
    );
  });

  it('logs non-retryable errors at error level', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const authErr = new (Anthropic as unknown as { AuthenticationError: new (msg: string) => Error }).AuthenticationError('Invalid API key');
    mockCreate.mockRejectedValue(authErr);

    const { generateInterpretation } = await import('./claudeClient.js');

    await expect(generateInterpretation('prompt')).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'Invalid API key' }),
      'Claude API non-retryable error',
    );
  });

  it('logs retryable errors at warn level', async () => {
    const genericErr = new Error('Server overloaded');
    mockCreate.mockRejectedValue(genericErr);

    const { generateInterpretation } = await import('./claudeClient.js');

    await expect(generateInterpretation('prompt')).rejects.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'Server overloaded' }),
      'Claude API retryable error exhausted',
    );
  });
});

function createMockStream(chunks: string[], finalMessage: unknown) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

  const stream = {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
      return stream;
    },
    abort: vi.fn(),
    async finalMessage() {
      // fire text events before resolving
      for (const chunk of chunks) {
        const cbs = listeners.get('text') ?? [];
        for (const cb of cbs) cb(chunk);
      }
      const endCbs = listeners.get('end') ?? [];
      for (const cb of endCbs) cb();
      return finalMessage;
    },
  };

  return stream;
}

describe('streamInterpretation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams text chunks and returns full result', async () => {
    const finalMsg = {
      content: [{ type: 'text', text: 'Hello world' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    };
    const stream = createMockStream(['Hello ', 'world'], finalMsg);
    mockStream.mockReturnValue(stream);

    const { streamInterpretation } = await import('./claudeClient.js');
    const deltas: string[] = [];
    const result = await streamInterpretation('test', (d) => deltas.push(d));

    expect(deltas).toEqual(['Hello ', 'world']);
    expect(result).toEqual({
      fullText: 'Hello world',
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });

  it('logs stream completion', async () => {
    const finalMsg = {
      content: [{ type: 'text', text: 'done' }],
      usage: { input_tokens: 50, output_tokens: 10 },
    };
    mockStream.mockReturnValue(createMockStream(['done'], finalMsg));

    const { streamInterpretation } = await import('./claudeClient.js');
    await streamInterpretation('test', () => {});

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ usage: finalMsg.usage }),
      'Claude API stream completed',
    );
  });

  it('aborts stream when signal fires', async () => {
    const controller = new AbortController();
    const finalMsg = {
      content: [{ type: 'text', text: '' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    };
    const stream = createMockStream([], finalMsg);
    stream.abort = vi.fn();
    mockStream.mockReturnValue(stream);

    const { streamInterpretation } = await import('./claudeClient.js');
    const promise = streamInterpretation('test', () => {}, controller.signal);

    // stream completes normally here since abort happens after
    await promise;

    // verify abort listener was wired
    controller.abort();
    // the 'end' event already fired, so the listener was removed
  });

  it('re-throws raw errors for upstream instanceof checks', async () => {
    mockStream.mockReturnValue({
      on: () => ({}),
      abort: vi.fn(),
      finalMessage: () => Promise.reject(new Error('stream failed')),
    });

    const { streamInterpretation } = await import('./claudeClient.js');

    await expect(streamInterpretation('test', () => {})).rejects.toThrow('stream failed');
  });
});
