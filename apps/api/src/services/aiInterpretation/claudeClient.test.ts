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
      messages: { create: mockCreate },
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
