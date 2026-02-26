# SaaS Analytics Dashboard

AI-powered analytics that explains business data in plain English for small business owners.

<!-- Hero screenshot goes here — generated via scripts/generate-screenshots.ts in Epic 7 -->

## Overview

<!-- TK — filled in Epic 7 (Story 7.3) -->

## Problem

Small businesses lack affordable analytics tools that don't require a data science background. Enterprise platforms cost too much and overwhelm non-technical users with dashboards full of numbers but no guidance on what they mean.

## Solution

<!-- TK — expanded in Epic 7 with real feature descriptions and user journey narrative -->

## Architecture

<!-- TK — architecture diagram (Mermaid or image) added in Epic 7 -->

```
Browser → Next.js (BFF proxy) → Express API → PostgreSQL
                                     ↓
                                  Redis (cache, rate limiting)
                                     ↓
                                  Claude API (AI summaries)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19.2, Tailwind CSS 4 |
| Backend | Express 5, Node.js 22 |
| Database | PostgreSQL 18, Drizzle ORM 0.45.x |
| Cache | Redis 7 |
| AI | Claude API with SSE streaming |
| Auth | JWT + refresh rotation, Google OAuth (jose 6.x) |
| Monorepo | pnpm workspaces, Turborepo |
| Testing | Vitest, Playwright |
| CI/CD | GitHub Actions (5-stage pipeline) |

## Screenshots

<!-- TK — hero screenshot and feature screenshots added in Epic 7 via Playwright -->

## Getting Started

```bash
# Clone and start the full stack
git clone <repo-url>
cd saas-analytics-dashboard
docker compose up
```

The app starts at `http://localhost:3000` with seed data pre-loaded.

### Development

```bash
pnpm install
pnpm dev          # Start all services via Turborepo
pnpm lint         # Lint all packages
pnpm type-check   # TypeScript check
pnpm test         # Run all tests
```

## Demo

<!-- TK — live demo link or walkthrough GIF added in Epic 7 -->
