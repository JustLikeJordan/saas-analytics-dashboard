import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('testing infrastructure', () => {
  it('renders and queries DOM elements', () => {
    render(<div>hello</div>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
