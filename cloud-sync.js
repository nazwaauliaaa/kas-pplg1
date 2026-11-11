import { normalizeState } from './kas-logic.js';
import { createCloudSync as createFirebaseSync, isFirebaseConfigured } from './firebase-sync.js';

const POLL_INTERVAL_MS = 5000;

async function fetchApiState() {
  const res = await fetch('./api/kas', {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('application/json')) {
    return null;
  }

  return res.json();
}

/**
 * Connects to Netlify Database API (/api/kas) if available, otherwise falls back
 * to Firebase Firestore (if configured) or local-only storage.
 */
export async function createSharedSync({ onRemoteState, onStatusChange }) {
  onStatusChange?.('connecting');

  try {
    const initial = await fetchApiState();
    if (initial && typeof initial === 'object' && 'exists' in initial) {
      let remoteExists = Boolean(initial.exists);
      let lastUpdatedAt = initial.updatedAt || null;
      let isPushing = false;

      if (remoteExists && initial.state) {
        onStatusChange?.('synced');
        onRemoteState?.(normalizeState(initial.state));
      } else {
        onStatusChange?.('uninitialized');
      }

      const refresh = async () => {
        if (isPushing || document.visibilityState === 'hidden') return;
        try {
          const latest = await fetchApiState();
          if (!latest) return;
          if (!latest.exists) {
            remoteExists = false;
            onStatusChange?.('uninitialized');
            return;
          }
          remoteExists = true;
          onStatusChange?.('synced');
          if (latest.updatedAt && latest.updatedAt === lastUpdatedAt) {
            return;
          }
          lastUpdatedAt = latest.updatedAt || null;
          if (latest.state) {
            onRemoteState?.(normalizeState(latest.state));
          }
        } catch {
          onStatusChange?.('offline');
        }
      };

      const pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          refresh();
        }
      });

      return {
        enabled: true,
        mode: 'netlify-db',
        hasRemoteDoc: () => remoteExists,
        stop: () => clearInterval(pollTimer),
        pushState: async (nextState, password) => {
          isPushing = true;
          try {
            onStatusChange?.('saving');
            const res = await fetch('./api/kas', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password, state: nextState }),
            });
            if (!res.ok) {
              onStatusChange?.(res.status === 401 ? 'auth-error' : 'offline');
              return false;
            }
            const result = await res.json();
            remoteExists = true;
            lastUpdatedAt = result.updatedAt || lastUpdatedAt;
            onStatusChange?.('synced');
            return true;
          } catch {
            onStatusChange?.('offline');
            return false;
          } finally {
            isPushing = false;
          }
        },
      };
    }
  } catch {
    // /api/kas unavailable (e.g., GitHub Pages or static dev server); try Firebase fallback.
  }

  if (isFirebaseConfigured()) {
    return createFirebaseSync({ onRemoteState, onStatusChange });
  }

  onStatusChange?.('local');
  return {
    enabled: false,
    mode: 'local',
    hasRemoteDoc: () => false,
    pushState: async () => false,
  };
}
