'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

const mql = typeof window !== 'undefined' ? window.matchMedia(QUERY) : null;

function subscribe(callback: () => void) {
  mql?.addEventListener('change', callback);
  return () => mql?.removeEventListener('change', callback);
}

function getSnapshot() {
  return mql?.matches ?? false;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
