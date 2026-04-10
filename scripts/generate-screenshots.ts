/**
 * Hero screenshot generator — captures the dashboard with seed data + AI summary.
 *
 * Uses Playwright's library API (not the test runner) to launch Chromium,
 * navigate to the local dashboard, wait for content to settle, and capture
 * both light and dark mode screenshots.
 *
 * Run: pnpm screenshots
 *   or: pnpm -C apps/api exec tsx ../../scripts/generate-screenshots.ts
 *
 * Requires: docker compose up (or local dev stack) running on localhost:3000
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Page } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1280, height: 1200 };

// Recharts default animation is 500ms — pad generously
const ANIMATION_SETTLE_MS = 1200;

async function waitForDashboard(page: Page) {
  // AI summary card rendered with content
  await page.waitForSelector(
    'div[role="region"][aria-label="AI business summary"]',
    { timeout: 30_000 },
  );

  // At least one chart SVG present
  await page.waitForSelector('figure svg', { timeout: 15_000 });

  // Let Recharts animations finish + any fade-ins settle
  await page.waitForTimeout(ANIMATION_SETTLE_MS);
}

async function capture(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  name: string,
  darkMode: boolean,
) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  if (darkMode) {
    // next-themes reads localStorage on hydration and applies the `dark` class
    // to <html>. emulateMedia alone won't trigger it.
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  }

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await waitForDashboard(page);

  const outPath = resolve(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: outPath });
  console.log(`Saved: ${outPath}`);

  await context.close();
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Capturing dashboard screenshots from ${BASE_URL}/dashboard ...`);

  const browser = await chromium.launch();
  await capture(browser, 'hero-light', false);
  await capture(browser, 'hero-dark', true);
  await browser.close();

  console.log('Done — screenshots saved to docs/screenshots/');
}

main().catch((err) => {
  console.error('Screenshot generation failed:', err);
  process.exit(1);
});
