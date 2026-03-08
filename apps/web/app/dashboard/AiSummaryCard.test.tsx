import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AiSummaryCard } from './AiSummaryCard';

const mockUseAiStream = vi.fn();

vi.mock('@/lib/hooks/useAiStream', () => ({
  useAiStream: (...args: unknown[]) => mockUseAiStream(...args),
}));

afterEach(cleanup);

describe('AiSummaryCard', () => {
  it('renders nothing when idle and no cached content', () => {
    mockUseAiStream.mockReturnValue({
      status: 'idle',
      text: '',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    const { container } = render(<AiSummaryCard datasetId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders cached content immediately without streaming', () => {
    mockUseAiStream.mockReturnValue({
      status: 'idle',
      text: '',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={null} cachedContent="Pre-generated summary" />);
    expect(screen.getByText('Pre-generated summary')).toBeTruthy();
    // should call useAiStream with null to prevent streaming
    expect(mockUseAiStream).toHaveBeenCalledWith(null);
  });

  it('shows skeleton with analyzing label when connecting', () => {
    mockUseAiStream.mockReturnValue({
      status: 'connecting',
      text: '',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={42} />);
    expect(screen.getByText('Analyzing your data...')).toBeTruthy();
  });

  it('shows streaming text with cursor', () => {
    mockUseAiStream.mockReturnValue({
      status: 'streaming',
      text: 'Revenue is growing',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={42} />);
    expect(screen.getByText('Revenue is growing')).toBeTruthy();
    // cursor character
    expect(screen.getByText('▋')).toBeTruthy();
  });

  it('shows completed text with post-completion footer', () => {
    mockUseAiStream.mockReturnValue({
      status: 'done',
      text: 'Full analysis complete.',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={42} />);
    expect(screen.getByText('Full analysis complete.')).toBeTruthy();
    expect(screen.getByText('Powered by AI')).toBeTruthy();
    // cursor should NOT be present
    expect(screen.queryByText('▋')).toBeNull();
  });

  it('shows error state with retry button', () => {
    const mockStart = vi.fn();
    mockUseAiStream.mockReturnValue({
      status: 'error',
      text: '',
      error: 'AI generation failed',
      start: mockStart,
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={42} />);
    expect(screen.getByText('AI generation failed')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('has correct accessibility attributes during streaming', () => {
    mockUseAiStream.mockReturnValue({
      status: 'streaming',
      text: 'Partial text',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={42} />);

    const region = screen.getByRole('region', { name: 'AI business summary' });
    expect(region).toBeTruthy();

    const liveRegion = region.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
    expect(liveRegion!.getAttribute('aria-busy')).toBe('true');
  });

  it('sets aria-busy false when done', () => {
    mockUseAiStream.mockReturnValue({
      status: 'done',
      text: 'Done text',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    render(<AiSummaryCard datasetId={42} />);

    const region = screen.getByRole('region', { name: 'AI business summary' });
    const liveRegion = region.querySelector('[aria-live="polite"]');
    expect(liveRegion!.getAttribute('aria-busy')).toBe('false');
  });

  it('renders streaming cursor with reduced-motion class', () => {
    mockUseAiStream.mockReturnValue({
      status: 'streaming',
      text: 'text',
      error: null,
      start: vi.fn(),
      cancel: vi.fn(),
    });

    const { container } = render(<AiSummaryCard datasetId={42} />);
    const cursor = container.querySelector('[aria-hidden="true"]');
    expect(cursor).toBeTruthy();
    expect(cursor!.className).toContain('motion-reduce:animate-none');
  });
});
