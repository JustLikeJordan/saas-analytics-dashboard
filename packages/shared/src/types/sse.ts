export interface SseTextEvent {
  text: string;
}

export interface SseDoneEvent {
  usage: { inputTokens: number; outputTokens: number } | null;
}

export interface SseErrorEvent {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SsePartialEvent {
  text: string;
}
