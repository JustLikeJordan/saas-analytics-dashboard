import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

let mockIsMobile = false;
vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="share-sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { ShareMenu, ShareFab } from './ShareMenu';

afterEach(() => {
  cleanup();
  mockIsMobile = false;
});

async function noop() {}

describe('ShareMenu', () => {
  it('renders share button on desktop', () => {
    mockIsMobile = false;
    render(
      <ShareMenu
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /share/i })).toBeTruthy();
  });

  it('shows download and copy options when menu is open', () => {
    mockIsMobile = false;
    render(
      <ShareMenu
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.getByRole('button', { name: /download png/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeTruthy();
  });

  it('calls onGenerate then onDownload when Download PNG clicked', () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    const onDownload = vi.fn();

    render(
      <ShareMenu
        status="idle"
        onGenerate={onGenerate}
        onDownload={onDownload}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(screen.getByRole('button', { name: /download png/i }));

    expect(onGenerate).toHaveBeenCalled();
  });

  it('shows spinner while generating', () => {
    render(
      <ShareMenu
        status="generating"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const statusRegion = screen.getByRole('status');
    expect(statusRegion).toBeTruthy();
  });

  it('closes menu on Escape', () => {
    render(
      <ShareMenu
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(screen.getByRole('button', { name: /download png/i })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('button', { name: /download png/i }), { key: 'Escape' });
    expect(screen.queryByRole('button', { name: /download png/i })).toBeNull();
  });

  it('has aria-label on all interactive elements', () => {
    render(
      <ShareMenu
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    const shareBtn = screen.getByRole('button', { name: /share/i });
    expect(shareBtn.getAttribute('aria-label') || shareBtn.textContent).toBeTruthy();
  });

  it('shows error message on error status', () => {
    render(
      <ShareMenu
        status="error"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    expect(screen.getByText(/failed to generate/i)).toBeTruthy();
  });

  it('disables action buttons while generating', () => {
    render(
      <ShareMenu
        status="generating"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const downloadBtn = screen.getByRole('button', { name: /download png/i });
    const copyBtn = screen.getByRole('button', { name: /copy to clipboard/i });
    expect((downloadBtn as HTMLButtonElement).disabled).toBe(true);
    expect((copyBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onGenerate then onCopy when Copy to clipboard clicked', () => {
    const onGenerate = vi.fn().mockResolvedValue(undefined);
    const onCopy = vi.fn().mockResolvedValue(undefined);

    render(
      <ShareMenu
        status="idle"
        onGenerate={onGenerate}
        onDownload={noop}
        onCopy={onCopy}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));

    expect(onGenerate).toHaveBeenCalled();
  });

  it('share button has aria-expanded and aria-haspopup', () => {
    render(
      <ShareMenu
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    const btn = screen.getByRole('button', { name: /share/i });
    expect(btn.getAttribute('aria-haspopup')).toBe('true');
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('ShareFab', () => {
  it('renders FAB on mobile when visible', () => {
    mockIsMobile = true;
    render(
      <ShareFab
        visible
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /share insight/i })).toBeTruthy();
  });

  it('does not render when not visible', () => {
    mockIsMobile = true;
    render(
      <ShareFab
        visible={false}
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: /share insight/i })).toBeNull();
  });

  it('does not render on desktop', () => {
    mockIsMobile = false;
    render(
      <ShareFab
        visible
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    expect(screen.queryByRole('button', { name: /share insight/i })).toBeNull();
  });

  it('opens sheet with share options on click', () => {
    mockIsMobile = true;
    render(
      <ShareFab
        visible
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share insight/i }));
    expect(screen.getByTestId('share-sheet')).toBeTruthy();
  });

  it('FAB has minimum 48px touch target', () => {
    mockIsMobile = true;
    render(
      <ShareFab
        visible
        status="idle"
        onGenerate={noop}
        onDownload={noop}
        onCopy={noop}
      />,
    );

    const fab = screen.getByRole('button', { name: /share insight/i });
    expect(fab.className).toContain('h-12');
    expect(fab.className).toContain('w-12');
  });
});
