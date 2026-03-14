import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackClientEvent } from './analytics';

describe('trackClientEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to /api/analytics with event data', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    trackClientEvent('transparency_panel.opened', { datasetId: 42 });

    expect(fetchSpy).toHaveBeenCalledWith('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'transparency_panel.opened', metadata: { datasetId: 42 } }),
      credentials: 'same-origin',
    });
  });

  it('works without metadata', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    trackClientEvent('some.event');

    expect(fetchSpy).toHaveBeenCalledWith('/api/analytics', expect.objectContaining({
      body: JSON.stringify({ eventName: 'some.event' }),
    }));
  });

  it('swallows fetch errors silently', () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    // should not throw
    expect(() => trackClientEvent('some.event')).not.toThrow();
  });
});
