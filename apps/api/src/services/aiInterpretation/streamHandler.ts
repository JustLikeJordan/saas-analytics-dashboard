import type { Request, Response } from 'express';
import type { SseTextEvent, SseDoneEvent, SseErrorEvent, SsePartialEvent } from 'shared/types';

import { AI_TIMEOUT_MS } from 'shared/constants';
import { logger } from '../../lib/logger.js';
import { aiSummariesQueries } from '../../db/queries/index.js';
import { runCurationPipeline, assemblePrompt, transparencyMetadataSchema } from '../curation/index.js';
import { streamInterpretation } from './claudeClient.js';

function writeSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  return !msg.includes('authentication') && !msg.includes('bad request') && !msg.includes('validation');
}

export async function streamToSSE(
  req: Request,
  res: Response,
  orgId: number,
  datasetId: number,
): Promise<boolean> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const abortController = new AbortController();
  let accumulatedText = '';
  let timedOut = false;
  let clientDisconnected = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, AI_TIMEOUT_MS);

  req.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
    clearTimeout(timeout);
  });

  try {
    const insights = await runCurationPipeline(orgId, datasetId);
    const { prompt, metadata } = assemblePrompt(insights);
    const validatedMetadata = transparencyMetadataSchema.parse(metadata);

    logger.info(
      { orgId, datasetId, promptVersion: metadata.promptVersion },
      'starting AI summary stream',
    );

    const result = await streamInterpretation(
      prompt,
      (delta) => {
        if (clientDisconnected) return false;
        accumulatedText += delta;
        writeSseEvent(res, 'text', { text: delta } satisfies SseTextEvent);
      },
      abortController.signal,
    );

    clearTimeout(timeout);

    if (clientDisconnected) return false;

    writeSseEvent(res, 'done', { usage: result.usage } satisfies SseDoneEvent);
    res.end();

    await aiSummariesQueries.storeSummary(
      orgId,
      datasetId,
      result.fullText,
      validatedMetadata,
      metadata.promptVersion,
    );

    logger.info({ orgId, datasetId }, 'AI summary streamed and cached');
    return true;
  } catch (err) {
    clearTimeout(timeout);

    if (clientDisconnected) {
      logger.info({ orgId, datasetId }, 'client disconnected during AI stream');
      return false;
    }

    if (timedOut && accumulatedText) {
      logger.warn({ orgId, datasetId, partialLength: accumulatedText.length }, 'AI stream timed out — sending partial');
      writeSseEvent(res, 'partial', { text: accumulatedText } satisfies SsePartialEvent);
      writeSseEvent(res, 'done', { usage: null } satisfies SseDoneEvent);
      res.end();
      return false;
    }

    logger.error({ orgId, datasetId, err: (err as Error).message }, 'AI stream error');
    writeSseEvent(res, 'error', {
      code: 'STREAM_ERROR',
      message: 'AI generation failed',
      retryable: isRetryable(err),
    } satisfies SseErrorEvent);
    res.end();
    return false;
  }
}
