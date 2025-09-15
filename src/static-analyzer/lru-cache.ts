export class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private capacity: number;

  constructor(maxSize: number) {
    this.capacity = this.normalizeCapacity(maxSize);
  }

  public get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    const value = this.cache.get(key)!;
    // Refresh the key ordering to mark it as recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  public has(key: K): boolean {
    return this.cache.has(key);
  }

  public set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    if (this.capacity === 0) {
      return;
    }

    this.cache.set(key, value);
    this.evictIfNeeded();
  }

  public delete(key: K): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public setMaxSize(maxSize: number): void {
    this.capacity = this.normalizeCapacity(maxSize);
    if (this.capacity === 0) {
      this.cache.clear();
      return;
    }

    this.evictIfNeeded();
  }

  public get size(): number {
    return this.cache.size;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.capacity) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.cache.delete(oldestKey);
    }
  }

  private normalizeCapacity(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }

    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : 0;
  }
}
