import { FIREBASE_CONFIG, FIREBASE_COLLECTION, FIREBASE_DOC_ID } from './firebase-config.js';
import { normalizeState } from './kas-logic.js';

const FIREBASE_SDK_VERSION = '10.14.1';

/**
 * Checks whether Firebase Web config has been filled in.
 */
export function isFirebaseConfigured(config = FIREBASE_CONFIG) {
  return Boolean(
    config &&
      typeof config === 'object' &&
      typeof config.apiKey === 'string' &&
      config.apiKey.trim() &&
      typeof config.projectId === 'string' &&
      config.projectId.trim()
  );
}

/**
 * Connects to Firebase Firestore for real-time cross-device state synchronization.
 * Returns no-op handlers if FIREBASE_CONFIG is not configured yet.
 */
export async function createCloudSync({ onRemoteState, onStatusChange }) {
  if (!isFirebaseConfigured()) {
    onStatusChange?.('local');
    return {
      enabled: false,
      hasRemoteDoc: () => false,
      pushState: async () => false,
    };
  }

  onStatusChange?.('connecting');

  try {
    const [appMod, fsMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]);

    const app = appMod.getApps().length
      ? appMod.getApp()
      : appMod.initializeApp(FIREBASE_CONFIG);

    const db = fsMod.getFirestore(app);
    const docRef = fsMod.doc(db, FIREBASE_COLLECTION, FIREBASE_DOC_ID);
    let remoteExists = false;

    fsMod.onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          remoteExists = false;
          onStatusChange?.('uninitialized');
          return;
        }
        remoteExists = true;
        onStatusChange?.('synced');
        if (snapshot.metadata.hasPendingWrites) {
          return;
        }
        const normalized = normalizeState(snapshot.data());
        onRemoteState?.(normalized);
      },
      () => {
        onStatusChange?.('offline');
      }
    );

    return {
      enabled: true,
      hasRemoteDoc: () => remoteExists,
      pushState: async (nextState) => {
        try {
          onStatusChange?.('saving');
          await fsMod.setDoc(docRef, {
            ...nextState,
            updatedAt: fsMod.serverTimestamp(),
          });
          remoteExists = true;
          onStatusChange?.('synced');
          return true;
        } catch {
          onStatusChange?.('offline');
          return false;
        }
      },
    };
  } catch {
    onStatusChange?.('offline');
    return {
      enabled: false,
      hasRemoteDoc: () => false,
      pushState: async () => false,
    };
  }
}
