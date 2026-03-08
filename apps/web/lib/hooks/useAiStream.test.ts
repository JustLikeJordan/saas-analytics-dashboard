import { describe, it, expect } from 'vitest';
import { streamReducer, type StreamState, type StreamAction } from './useAiStream';

const idle: StreamState = { status: 'idle', text: '', error: null };

describe('streamReducer', () => {
  it('START transitions from idle to connecting', () => {
    const next = streamReducer(idle, { type: 'START' });
    expect(next).toEqual({ status: 'connecting', text: '', error: null });
  });

  it('TEXT transitions from connecting to streaming and appends delta', () => {
    const connecting: StreamState = { status: 'connecting', text: '', error: null };
    const next = streamReducer(connecting, { type: 'TEXT', delta: 'Hello ' });
    expect(next.status).toBe('streaming');
    expect(next.text).toBe('Hello ');
  });

  it('TEXT appends to existing text in streaming state', () => {
    const streaming: StreamState = { status: 'streaming', text: 'Hello ', error: null };
    const next = streamReducer(streaming, { type: 'TEXT', delta: 'world' });
    expect(next.text).toBe('Hello world');
  });

  it('DONE transitions to done preserving text', () => {
    const streaming: StreamState = { status: 'streaming', text: 'Full response', error: null };
    const next = streamReducer(streaming, { type: 'DONE' });
    expect(next.status).toBe('done');
    expect(next.text).toBe('Full response');
  });

  it('ERROR transitions to error with message', () => {
    const connecting: StreamState = { status: 'connecting', text: '', error: null };
    const next = streamReducer(connecting, { type: 'ERROR', message: 'Network error' });
    expect(next).toEqual({ status: 'error', text: '', error: 'Network error' });
  });

  it('CACHE_HIT transitions directly to done with content', () => {
    const next = streamReducer(idle, { type: 'CACHE_HIT', content: 'Cached text' });
    expect(next).toEqual({ status: 'done', text: 'Cached text', error: null });
  });

  it('RESET returns to idle', () => {
    const done: StreamState = { status: 'done', text: 'Some text', error: null };
    const next = streamReducer(done, { type: 'RESET' });
    expect(next).toEqual(idle);
  });

  it('ERROR from streaming preserves accumulated text', () => {
    const streaming: StreamState = { status: 'streaming', text: 'Partial', error: null };
    const next = streamReducer(streaming, { type: 'ERROR', message: 'Timeout' });
    expect(next.text).toBe('Partial');
    expect(next.error).toBe('Timeout');
  });
});
