/**
 * Sync Event System
 *
 * This module provides a simple event system to notify components
 * when data has been synced to the cloud. This prevents excessive
 * database reads by only refreshing data when it actually changes.
 */

// Custom event name for sync notifications
export const SYNC_EVENT_NAME = 'ct-data-synced';

// Cache keys for localStorage-based data caching
export const CACHE_KEYS = {
  HISTORY: 'ct_history_cache',
  HISTORY_TIMESTAMP: 'ct_history_cache_timestamp',
  ANALYTICS: 'analytics_cache', // Already exists in analyticsService
} as const;

/**
 * Dispatch a sync event to notify all listening components
 * that data has been synced to the cloud.
 */
export function dispatchSyncEvent(): void {
  const event = new CustomEvent(SYNC_EVENT_NAME, {
    detail: { timestamp: Date.now() }
  });
  window.dispatchEvent(event);
  console.log('📡 Sync event dispatched');
}

/**
 * Subscribe to sync events.
 * Returns a cleanup function to unsubscribe.
 */
export function subscribeSyncEvent(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(SYNC_EVENT_NAME, handler);
  return () => window.removeEventListener(SYNC_EVENT_NAME, handler);
}

/**
 * Check if cached data is still valid (not stale).
 * Data is considered stale if it's older than the last sync.
 */
export function isCacheValid(cacheTimestamp: number | null): boolean {
  if (!cacheTimestamp) return false;

  // Check if there's been a sync after this cache was created
  const lastSyncTimestamp = getLastSyncTimestamp();
  if (lastSyncTimestamp && lastSyncTimestamp > cacheTimestamp) {
    return false; // Cache is stale, sync happened after caching
  }

  return true;
}

/**
 * Get the timestamp of the last sync operation.
 */
export function getLastSyncTimestamp(): number | null {
  const timestamp = localStorage.getItem('ct_last_sync_timestamp');
  return timestamp ? parseInt(timestamp, 10) : null;
}

/**
 * Set the timestamp of the last sync operation.
 * Called after successful sync in Dashboard/Admin.
 */
export function setLastSyncTimestamp(): void {
  localStorage.setItem('ct_last_sync_timestamp', Date.now().toString());
}
