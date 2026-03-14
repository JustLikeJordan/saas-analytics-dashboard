export interface TransparencyMetadata {
  statTypes: string[];
  categoryCount: number;
  insightCount: number;
  scoringWeights: {
    novelty: number;
    actionability: number;
    specificity: number;
  };
  promptVersion: string;
  generatedAt: string;
}
