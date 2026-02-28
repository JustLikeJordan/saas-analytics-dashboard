import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { UploadDropzone } from './UploadDropzone';

// Mock XMLHttpRequest — the component uses it instead of fetch for progress tracking
class MockXHR {
  status = 200;
  responseText = '';
  withCredentials = false;
  readyState = 0;

  upload = { addEventListener: vi.fn() };
  addEventListener = vi.fn();
  open = vi.fn();
  send = vi.fn();
}

let xhrInstance: MockXHR;

beforeEach(() => {
  xhrInstance = new MockXHR();
  vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrInstance));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * userEvent.upload has a jsdom 28 incompatibility (FileList.item removed),
 * so we use fireEvent.change with a manually assigned files property.
 */
function simulateUpload(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('UploadDropzone', () => {
  it('renders default state with dropzone prompt', () => {
    render(<UploadDropzone />);

    expect(screen.getByRole('button', { name: /upload csv file/i })).toBeInTheDocument();
    // jsdom exposes ontouchstart → isTouchDevice=true → mobile copy
    expect(screen.getByText(/tap to select your csv file/i)).toBeInTheDocument();
    expect(screen.getByText(/accepted: .csv up to 10mb/i)).toBeInTheDocument();
  });

  it('has accessible file input hidden from tab order', () => {
    render(<UploadDropzone />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.csv');
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('shows error for oversized file (client-side validation)', async () => {
    render(<UploadDropzone />);

    const bigFile = new File(['x'.repeat(11 * 1024 * 1024)], 'huge.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, bigFile);

    await waitFor(() => {
      expect(screen.getByText(/file size exceeds 10mb/i)).toBeInTheDocument();
    });
  });

  it('shows error for non-CSV file type', async () => {
    render(<UploadDropzone />);

    const jsonFile = new File(['{}'], 'data.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, jsonFile);

    await waitFor(() => {
      expect(screen.getByText(/we expected a .csv file/i)).toBeInTheDocument();
    });
  });

  it('shows error for empty file', async () => {
    render(<UploadDropzone />);

    const emptyFile = new File([], 'empty.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, emptyFile);

    await waitFor(() => {
      expect(screen.getByText(/this file appears to be empty/i)).toBeInTheDocument();
    });
  });

  it('transitions to processing state on valid file', async () => {
    render(<UploadDropzone />);

    const validCsv = new File(
      ['date,amount,category\n2024-01-01,100,Food'],
      'test.csv',
      { type: 'text/csv' },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, validCsv);

    await waitFor(() => {
      expect(screen.getByText(/validating your data/i)).toBeInTheDocument();
    });

    expect(xhrInstance.open).toHaveBeenCalledWith('POST', '/api/datasets');
    expect(xhrInstance.withCredentials).toBe(true);
    expect(xhrInstance.send).toHaveBeenCalled();
  });

  it('shows server error when XHR returns 400', async () => {
    xhrInstance.addEventListener = vi.fn((event: string, handler: () => void) => {
      if (event === 'load') {
        setTimeout(() => {
          xhrInstance.status = 400;
          xhrInstance.responseText = JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'We expected a "date" column but could not find one.',
              details: {
                errors: [{ column: 'date', message: 'We expected a "date" column.' }],
              },
            },
          });
          handler();
        }, 0);
      }
    });

    render(<UploadDropzone />);

    const validCsv = new File(
      ['date,amount,category\n2024-01-01,100,Food'],
      'test.csv',
      { type: 'text/csv' },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, validCsv);

    await waitFor(() => {
      expect(screen.getByText(/we expected a "date" column but could not find one/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/validation failed/i)).toBeInTheDocument();
  });

  it('shows preview state on successful upload', async () => {
    xhrInstance.addEventListener = vi.fn((event: string, handler: () => void) => {
      if (event === 'load') {
        setTimeout(() => {
          xhrInstance.status = 200;
          xhrInstance.responseText = JSON.stringify({
            data: {
              headers: ['date', 'amount', 'category'],
              sampleRows: [{ date: '2024-01-01', amount: '100', category: 'Food' }],
              rowCount: 42,
              validRowCount: 40,
              skippedRowCount: 2,
              fileName: 'test.csv',
              warnings: [],
              columnTypes: {},
            },
          });
          handler();
        }, 0);
      }
    });

    render(<UploadDropzone />);

    const validCsv = new File(
      ['date,amount,category\n2024-01-01,100,Food'],
      'test.csv',
      { type: 'text/csv' },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, validCsv);

    await waitFor(() => {
      expect(screen.getByText(/40 rows ready/i)).toBeInTheDocument();
    });
  });

  it('opens file picker on Enter key', () => {
    render(<UploadDropzone />);

    const dropzone = screen.getByRole('button', { name: /upload csv file/i });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.keyDown(dropzone, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('opens file picker on Space key', () => {
    render(<UploadDropzone />);

    const dropzone = screen.getByRole('button', { name: /upload csv file/i });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.keyDown(dropzone, { key: ' ' });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('retains file name reference after error', async () => {
    render(<UploadDropzone />);

    const bigFile = new File(
      ['x'.repeat(11 * 1024 * 1024)],
      'quarterly-report.csv',
      { type: 'text/csv' },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, bigFile);

    await waitFor(() => {
      expect(screen.getByText(/last attempt: quarterly-report.csv/i)).toBeInTheDocument();
    });
  });

  it('shows warnings in preview state', async () => {
    xhrInstance.addEventListener = vi.fn((event: string, handler: () => void) => {
      if (event === 'load') {
        setTimeout(() => {
          xhrInstance.status = 200;
          xhrInstance.responseText = JSON.stringify({
            data: {
              headers: ['date', 'amount', 'category'],
              sampleRows: [{ date: '2024-01-01', amount: '100', category: 'Food' }],
              rowCount: 10,
              validRowCount: 8,
              skippedRowCount: 2,
              fileName: 'test.csv',
              warnings: ['2 rows had invalid dates and were skipped.'],
              columnTypes: {},
            },
          });
          handler();
        }, 0);
      }
    });

    render(<UploadDropzone />);

    const validCsv = new File(
      ['date,amount,category\n2024-01-01,100,Food'],
      'test.csv',
      { type: 'text/csv' },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    simulateUpload(input, validCsv);

    await waitFor(() => {
      expect(screen.getByText(/2 rows had invalid dates/i)).toBeInTheDocument();
    });
  });
});
