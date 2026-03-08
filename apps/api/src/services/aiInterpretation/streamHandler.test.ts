import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import type { StreamResult } from './claudeClient.js';

vi.mock('../../config.js', () => ({
  env: {
    CLAUDE_API_KEY: 'test-key',
    CLAUDE_MODEL: 'claude-sonnet-4-5-20250929',
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRunCurationPipeline = vi.fn();
const mockAssemblePrompt = vi.fn();
vi.mock('../curation/index.js', () => ({
  runCurationPipeline: (...args: unknown[]) => mockRunCurationPipeline(...args),
  assemblePrompt: (...args: unknown[]) => mockAssemblePrompt(...args),
  transparencyMetadataSchema: { parse: (v: unknown) => v },
}));

const mockStreamInterpretation = vi.fn();
vi.mock('./claudeClient.js', () => ({
  streamInterpretation: (...args: unknown[]) => mockStreamInterpretation(...args),
}));

const mockStoreSummary = vi.fn();
vi.mock('../../db/queries/index.js', () => ({
  aiSummariesQueries: {
    storeSummary: (...args: unknown[]) => mockStoreSummary(...args),
  },
}));

function createMockRes() {
  const chunks: string[] = [];
  const headers = new Map<string, string>();
  return {
    chunks,
    headers,
    res: {
      setHeader: vi.fn((k: string, v: string) => headers.set(k, v)),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => chunks.push(chunk)),
      end: vi.fn(),
    } as unknown as Response,
  };
}

function createMockReq() {
  const listeners = new Map<string, (() => void)[]>();
  return {
    on: vi.fn((event: string, cb: () => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
    }),
    triggerClose: () => {
      for (const cb of listeners.get('close') ?? []) cb();
    },
  } as unknown as Request & { triggerClose: () => void };
}

const defaultMetadata = {
  statTypes: ['total'],
  categoryCount: 1,
  insightCount: 1,
  scoringWeights: { novelty: 0.4, actionability: 0.4, specificity: 0.2 },
  promptVersion: 'v1',
  generatedAt: '2026-01-01T00:00:00Z',
};

describe('streamToSSE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockRunCurationPipeline.mockResolvedValue([]);
    mockAssemblePrompt.mockReturnValue({
      prompt: 'test prompt',
      metadata: defaultMetadata,
    });
    mockStoreSummary.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets SSE headers and flushes', async () => {
    const streamResult: StreamResult = {
      fullText: 'Analysis done.',
      usage: { inputTokens: 100, outputTokens: 50 },
    };
    mockStreamInterpretation.mockImplementation(
      async (_prompt: string, onText: (d: string) => void) => {
        onText('Analysis done.');
        return streamResult;
      },
    );

    const { res } = createMockRes();
    const req = createMockReq();

    const { streamToSSE } = await import('./streamHandler.js');
    await streamToSSE(req, res, 1, 1);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it('streams text events and sends done', async () => {
    mockStreamInterpretation.mockImplementation(
      async (_prompt: string, onText: (d: string) => void) => {
        onText('Hello ');
        onText('world');
        return {
          fullText: 'Hello world',
          usage: { inputTokens: 100, outputTokens: 20 },
        };
      },
    );

    const { res, chunks } = createMockRes();
    const req = createMockReq();

    const { streamToSSE } = await import('./streamHandler.js');
    await streamToSSE(req, res, 1, 1);

    expect(chunks).toContain('event: text\ndata: {"text":"Hello "}\n\n');
    expect(chunks).toContain('event: text\ndata: {"text":"world"}\n\n');

    const doneChunk = chunks.find((c) => c.startsWith('event: done'));
    expect(doneChunk).toBeDefined();
    expect(res.end).toHaveBeenCalled();
  });

  it('caches the full response after streaming', async () => {
    mockStreamInterpretation.mockImplementation(
      async (_prompt: string, onText: (d: string) => void) => {
        onText('cached text');
        return {
          fullText: 'cached text',
          usage: { inputTokens: 100, outputTokens: 20 },
        };
      },
    );

    const { res } = createMockRes();
    const req = createMockReq();

    const { streamToSSE } = await import('./streamHandler.js');
    await streamToSSE(req, res, 1, 42);

    expect(mockStoreSummary).toHaveBeenCalledWith(1, 42, 'cached text', defaultMetadata, 'v1');
  });

  it('sends error event on stream failure', async () => {
    mockStreamInterpretation.mockRejectedValue(new Error('API blew up'));

    const { res, chunks } = createMockRes();
    const req = createMockReq();

    const { streamToSSE } = await import('./streamHandler.js');
    await streamToSSE(req, res, 1, 1);

    const errorChunk = chunks.find((c) => c.startsWith('event: error'));
    expect(errorChunk).toBeDefined();
    expect(errorChunk).toContain('STREAM_ERROR');
    expect(res.end).toHaveBeenCalled();
  });

  it('sends partial event on timeout when text was already streamed', async () => {
    mockStreamInterpretation.mockImplementation(
      async (_prompt: string, onText: (d: string) => void, signal?: AbortSignal) => {
        onText('Some partial ');
        onText('content here');
        // hang forever — timeout will abort
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    );

    const { res, chunks } = createMockRes();
    const req = createMockReq();

    const { streamToSSE } = await import('./streamHandler.js');
    const promise = streamToSSE(req, res, 1, 1);

    await vi.advanceTimersByTimeAsync(15_000);
    await promise;

    const partialChunk = chunks.find((c) => c.startsWith('event: partial'));
    expect(partialChunk).toBeDefined();
    expect(partialChunk).toContain('Some partial content here');

    const doneChunk = chunks.find((c) => c.startsWith('event: done'));
    expect(doneChunk).toBeDefined();
    expect(doneChunk).toContain('"usage":null');
    expect(res.end).toHaveBeenCalled();
  });

  it('handles client disconnect gracefully', async () => {
    let rejectStream: ((err: Error) => void) | undefined;
    mockStreamInterpretation.mockImplementation(
      async (_prompt: string, _cb: (d: string) => void, signal?: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          rejectStream = reject;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    );

    const { res } = createMockRes();
    const req = createMockReq() as Request & { triggerClose: () => void };

    const { streamToSSE } = await import('./streamHandler.js');
    const promise = streamToSSE(req, res, 1, 1);

    // wait for mock to set up, then simulate client disconnect
    await vi.advanceTimersByTimeAsync(100);
    req.triggerClose();

    await promise;

    // should NOT send error event on disconnect
    expect(res.write).not.toHaveBeenCalledWith(expect.stringContaining('event: error'));
  });
});
