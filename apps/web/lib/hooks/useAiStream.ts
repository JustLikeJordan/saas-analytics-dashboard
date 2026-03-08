'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

export interface StreamState {
  status: StreamStatus;
  text: string;
  error: string | null;
}

export type StreamAction =
  | { type: 'START' }
  | { type: 'TEXT'; delta: string }
  | { type: 'DONE' }
  | { type: 'ERROR'; message: string }
  | { type: 'CACHE_HIT'; content: string }
  | { type: 'RESET' };

const initialState: StreamState = { status: 'idle', text: '', error: null };

export function streamReducer(state: StreamState, action: StreamAction): StreamState {
  switch (action.type) {
    case 'START':
      return { status: 'connecting', text: '', error: null };
    case 'TEXT':
      return { ...state, status: 'streaming', text: state.text + action.delta };
    case 'DONE':
      return { ...state, status: 'done' };
    case 'ERROR':
      return { ...state, status: 'error', error: action.message };
    case 'CACHE_HIT':
      return { status: 'done', text: action.content, error: null };
    case 'RESET':
      return initialState;
  }
}

function parseSseLines(
  buffer: string,
  dispatch: (action: StreamAction) => void,
): string {
  const lines = buffer.split('\n');
  // last element may be an incomplete line — keep it in buffer
  const remainder = lines.pop() ?? '';

  let currentEvent = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      const raw = line.slice(6);
      try {
        const parsed = JSON.parse(raw);
        switch (currentEvent) {
          case 'text':
            dispatch({ type: 'TEXT', delta: parsed.text });
            break;
          case 'done':
            dispatch({ type: 'DONE' });
            break;
          case 'error':
            dispatch({ type: 'ERROR', message: parsed.message ?? 'Stream error' });
            break;
          case 'partial':
            dispatch({ type: 'TEXT', delta: parsed.text });
            break;
        }
      } catch {
        // malformed JSON — skip
      }
      currentEvent = '';
    }
  }

  return remainder;
}

export function useAiStream(datasetId: number | null) {
  const [state, dispatch] = useReducer(streamReducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (datasetId === null) return;

    cancel();
    dispatch({ type: 'START' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/ai-summaries/${datasetId}`, {
        signal: controller.signal,
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        dispatch({
          type: 'ERROR',
          message: (body as { error?: { message?: string } }).error?.message ?? `Request failed (${res.status})`,
        });
        return;
      }

      // cache hit — JSON response
      if (res.headers.get('content-type')?.includes('application/json')) {
        const json = await res.json();
        dispatch({ type: 'CACHE_HIT', content: json.data.content });
        return;
      }

      // SSE stream
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        buffer = parseSseLines(buffer, dispatch);
      }

      // process any remaining buffered content
      if (buffer.trim()) {
        parseSseLines(buffer + '\n', dispatch);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      dispatch({ type: 'ERROR', message: 'Connection failed' });
    }
  }, [datasetId, cancel]);

  // auto-trigger on mount
  useEffect(() => {
    if (datasetId !== null) {
      start();
    }
    return cancel;
  }, [datasetId, start, cancel]);

  return { ...state, start, cancel };
}
