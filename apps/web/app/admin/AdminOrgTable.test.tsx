import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AdminOrgTable } from './AdminOrgTable';

const sampleOrgs = [
  {
    id: 1,
    name: 'Acme Corp',
    slug: 'acme-corp',
    memberCount: 5,
    datasetCount: 3,
    subscriptionTier: 'pro',
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 2,
    name: 'Startup Inc',
    slug: 'startup-inc',
    memberCount: 1,
    datasetCount: 0,
    subscriptionTier: null,
    createdAt: '2026-03-01T00:00:00Z',
  },
];

describe('AdminOrgTable', () => {
  it('renders org rows with name, slug, counts, and tier', () => {
    render(<AdminOrgTable orgs={sampleOrgs} />);

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('acme-corp')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();

    expect(screen.getByText('Startup Inc')).toBeInTheDocument();
    expect(screen.getByText('startup-inc')).toBeInTheDocument();
  });

  it('shows Free badge for null subscription tier', () => {
    render(<AdminOrgTable orgs={sampleOrgs} />);

    const rows = screen.getAllByRole('row');
    // row 0 is header, row 1 is Acme (pro), row 2 is Startup (free)
    const startupRow = rows[2]!;
    expect(within(startupRow).getByText('Free')).toBeInTheDocument();
  });

  it('shows empty state when no orgs', () => {
    render(<AdminOrgTable orgs={[]} />);

    expect(screen.getByText('No organizations yet')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<AdminOrgTable orgs={sampleOrgs} />);

    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).toEqual(['Name', 'Slug', 'Members', 'Datasets', 'Plan', 'Created']);
  });
});
