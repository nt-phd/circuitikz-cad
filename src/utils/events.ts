import type { AppEvent } from '../types';

type Listener = (event: AppEvent) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(type: string, fn: Listener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(event: AppEvent): void {
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const fn of typeListeners) fn(event);
    }
    // Always also fire document-changed for any mutation
    if (event.type !== 'document-changed') {
      const docListeners = this.listeners.get('document-changed');
      if (docListeners) {
        const docEvent: AppEvent = { type: 'document-changed' };
        for (const fn of docListeners) fn(docEvent);
      }
    }
  }
}
