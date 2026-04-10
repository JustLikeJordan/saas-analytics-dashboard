const streams = new Set<AbortController>();

export function register(controller: AbortController): void {
  streams.add(controller);
}

export function deregister(controller: AbortController): void {
  streams.delete(controller);
}

export function abortAll(): number {
  const count = streams.size;
  for (const controller of streams) controller.abort();
  streams.clear();
  return count;
}

export function activeCount(): number {
  return streams.size;
}
