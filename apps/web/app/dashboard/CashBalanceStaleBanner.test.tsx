import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashBalanceStaleBanner } from './CashBalanceStaleBanner';

const NOW = new Date('2026-05-01T00:00:00.000Z');

function daysAgoISO(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

describe('CashBalanceStaleBanner', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('hides when cashAsOfDate is missing', () => {
    render(<CashBalanceStaleBanner cashAsOfDate={null} now={NOW} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hides when cash is ≤30 days old (boundary exclusive)', () => {
    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(30)} now={NOW} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows when cash is 31 days old with standard urgency copy', () => {
    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(31)} now={NOW} onUpdate={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Update your cash balance')).toBeInTheDocument();
  });

  it('shows urgent copy when cash is >90 days old', () => {
    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(100)} now={NOW} onUpdate={vi.fn()} />);
    expect(screen.getByText(/Cash balance is 100 days old/)).toBeInTheDocument();
  });

  it('hides when cash is >180 days old (suppression matches runway)', () => {
    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(181)} now={NOW} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens inline input when Update is clicked, submits parsed value', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(45)} now={NOW} onUpdate={onUpdate} />);

    await user.click(screen.getByRole('button', { name: /update/i }));
    await user.type(screen.getByLabelText('Updated cash balance'), '25000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(25000);
    });
  });

  it('dismisses session-locally when X is clicked', async () => {
    const user = userEvent.setup();
    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(45)} now={NOW} onUpdate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /dismiss banner/i }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('cashBalanceStaleBanner:dismissed')).toBe('1');
  });

  it('respects existing session dismissal on mount', () => {
    window.sessionStorage.setItem('cashBalanceStaleBanner:dismissed', '1');
    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(45)} now={NOW} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('handles malformed date gracefully (hides rather than crashes)', () => {
    render(<CashBalanceStaleBanner cashAsOfDate="not-a-date" now={NOW} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('surfaces an error when onUpdate rejects', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error('API down'));

    render(<CashBalanceStaleBanner cashAsOfDate={daysAgoISO(45)} now={NOW} onUpdate={onUpdate} />);

    await user.click(screen.getByRole('button', { name: /update/i }));
    await user.type(screen.getByLabelText('Updated cash balance'), '5000');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('API down');
    });
  });
});
