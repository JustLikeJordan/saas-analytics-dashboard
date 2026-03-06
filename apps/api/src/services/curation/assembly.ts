import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError } from '../../lib/appError.js';
import type { ScoredInsight, AssembledContext, TransparencyMetadata } from './types.js';
import { StatType } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_VERSION = 'v1';
const usd = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function loadTemplate(version: string): string {
  const templatePath = resolve(__dirname, 'config', 'prompt-templates', `${version}.md`);
  try {
    return readFileSync(templatePath, 'utf-8');
  } catch (err) {
    throw new AppError(
      `Prompt template missing: ${version}.md`,
      'CONFIG_ERROR',
      500,
      err,
    );
  }
}

const templateCache = new Map<string, string>();

function getTemplate(version: string): string {
  let tpl = templateCache.get(version);
  if (!tpl) {
    tpl = loadTemplate(version);
    templateCache.set(version, tpl);
  }
  return tpl;
}

function formatStat(insight: ScoredInsight): string {
  const { stat, score } = insight;
  const category = stat.category ?? 'Overall';

  switch (stat.statType) {
    case StatType.Total:
      return `- [${category}] Total: $${usd.format(stat.value)} (${stat.details.count} transactions, relevance: ${score.toFixed(2)})`;
    case StatType.Average:
      return `- [${category}] Average: $${stat.value.toFixed(2)}, median: $${stat.details.median.toFixed(2)} (relevance: ${score.toFixed(2)})`;
    case StatType.Trend: {
      const dir = stat.details.growthPercent >= 0 ? 'up' : 'down';
      return `- [${category}] Trend: ${dir} ${Math.abs(stat.details.growthPercent).toFixed(1)}% over ${stat.details.dataPoints} periods ($${stat.details.firstValue.toFixed(0)} -> $${stat.details.lastValue.toFixed(0)}, relevance: ${score.toFixed(2)})`;
    }
    case StatType.Anomaly: {
      const dir = stat.details.direction;
      return `- [${category}] Anomaly: $${stat.value.toFixed(2)} is ${dir} normal (z-score: ${stat.details.zScore.toFixed(2)}, expected range: $${stat.details.iqrBounds.lower.toFixed(0)}-$${stat.details.iqrBounds.upper.toFixed(0)}, relevance: ${score.toFixed(2)})`;
    }
    case StatType.CategoryBreakdown:
      return `- [${category}] Breakdown: ${stat.details.percentage.toFixed(1)}% of total ($${usd.format(stat.details.absoluteTotal)}, ${stat.details.transactionCount} transactions, range: $${stat.details.min.toFixed(0)}-$${stat.details.max.toFixed(0)}, relevance: ${score.toFixed(2)})`;
  }
}

export function assemblePrompt(
  insights: ScoredInsight[],
  promptVersion = DEFAULT_VERSION,
): AssembledContext {
  const template = getTemplate(promptVersion);

  if (insights.length === 0) {
    const emptyPrompt = template
      .replace('{{statSummaries}}', 'No statistical insights available. The dataset may be empty or too small for meaningful analysis.')
      .replace('{{statTypeList}}', 'none')
      .replace('{{categoryCount}}', '0')
      .replace('{{insightCount}}', '0');

    return {
      prompt: emptyPrompt,
      metadata: {
        statTypes: [],
        categoryCount: 0,
        insightCount: 0,
        scoringWeights: { novelty: 0, actionability: 0, specificity: 0 },
        promptVersion,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const statSummaries = insights.map(formatStat).join('\n');
  const statTypes = [...new Set(insights.map((i) => i.stat.statType))];
  const categories = new Set(insights.map((i) => i.stat.category).filter(Boolean));
  // all insights share the same weight config — scoring.ts applies uniform weights
  const { breakdown } = insights[0]!;

  const prompt = template
    .replace('{{statSummaries}}', statSummaries)
    .replace('{{statTypeList}}', statTypes.join(', '))
    .replace('{{categoryCount}}', String(categories.size))
    .replace('{{insightCount}}', String(insights.length));

  const metadata: TransparencyMetadata = {
    statTypes,
    categoryCount: categories.size,
    insightCount: insights.length,
    scoringWeights: breakdown,
    promptVersion,
    generatedAt: new Date().toISOString(),
  };

  return { prompt, metadata };
}
