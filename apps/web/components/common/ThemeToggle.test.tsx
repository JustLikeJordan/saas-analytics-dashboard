import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

const mockSetTheme = vi.fn();
let mockTheme = 'light';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

vi.mock('@/lib/analytics', () => ({
  trackClientEvent: vi.fn(),
}));

afterEach(() => {
  cleanup();
  mockSetTheme.mockClear();
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockTheme = 'light';
  });

  it('renders after mount (not during SSR)', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /light mode/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('cycles light → dark on click', async () => {
    mockTheme = 'light';
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('cycles dark → system on click', async () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('cycles system → light on click', async () => {
    mockTheme = 'system';
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('fires theme.changed analytics event on toggle', async () => {
    const { trackClientEvent } = await import('@/lib/analytics');
    mockTheme = 'light';
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button'));
    expect(trackClientEvent).toHaveBeenCalledWith('theme.changed', { theme: 'dark' });
  });

  it('shows correct aria-label for each theme', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /dark mode/i })).toBeInTheDocument();
  });

  it('falls back to system when theme is undefined', async () => {
    mockTheme = undefined as unknown as string;
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole('button'));
    // undefined isn't in cycleOrder, indexOf returns -1, (-1+1)%3 = 0 → 'light'
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
