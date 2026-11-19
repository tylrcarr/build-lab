// One-time move of saved data from the app's old storage prefix ("court-builder.") to "build-lab.". Runs before
// anything reads storage (first import in main.jsx). A key that already exists under the new name is left alone,
// and keys only older versions used are dropped.
const OLD = 'court-builder.', NEW = 'build-lab.';
const DEAD = ['bonus-tokens.v1', 'bonus-tokens.v2', 'synergy-slots.v1', 'extra-badge-slots.v1', 'vibes.v1', 'optimize.v1'];
export function migrateStorage(store = globalThis.localStorage) {
  if (!store) return 0;
  let moved = 0;
  try {
    const keys = [];
    for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(OLD)) keys.push(k); }
    for (const k of keys) {
      const rest = k.slice(OLD.length);
      if (!DEAD.includes(rest) && store.getItem(NEW + rest) === null) { store.setItem(NEW + rest, store.getItem(k)); moved++; }
      store.removeItem(k);
    }
    // The Lab's Quick tab is gone (Build Search presets replaced it): drop its saved picks.
    for (const k of ['quick.v1', 'quick.v2']) store.removeItem(NEW + k);
  } catch { /* storage blocked or full: keep the old keys */ }
  return moved;
}
migrateStorage();
