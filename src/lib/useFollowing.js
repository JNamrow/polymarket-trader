/**
 * Wallets the signed-in user follows, plus their alert preferences. Both are
 * stored on the Base44 User record (auth.updateMe):
 *
 *   watched_wallets  [{ address, label, name, added_at }]
 *   whale_alerts     { minUsd, followed, insiders, contrarian }  (see ALERT_DEFAULTS)
 */
import { useCallback, useMemo } from 'react';
import { useUserProfile } from '@/lib/useUserProfile';
import { ALERT_DEFAULTS } from '@/engine/wallets.js';

const normalize = list =>
  (Array.isArray(list) ? list : [])
    .filter(w => w && typeof w.address === 'string')
    .map(w => ({ ...w, address: w.address.toLowerCase(), label: w.label || '', name: w.name || '' }));

export function useFollowing() {
  const { user, update, isSaving } = useUserProfile();
  const list = useMemo(() => normalize(user?.watched_wallets), [user]);
  const set = useMemo(() => new Set(list.map(w => w.address)), [list]);
  const prefs = useMemo(() => ({ ...ALERT_DEFAULTS, ...(user?.whale_alerts || {}) }), [user]);

  const follow = useCallback(
    async ({ address, label = '', name = '' }) => {
      const key = String(address || '').toLowerCase();
      if (set.has(key)) return;
      await update({ watched_wallets: [...list, { address: key, label, name, added_at: new Date().toISOString() }] });
    },
    [list, set, update]
  );

  const unfollow = useCallback(
    async address => {
      const key = String(address || '').toLowerCase();
      await update({ watched_wallets: list.filter(w => w.address !== key) });
    },
    [list, update]
  );

  const toggle = useCallback(
    async wallet => {
      const key = String(wallet?.address || '').toLowerCase();
      return set.has(key) ? unfollow(key) : follow(wallet);
    },
    [set, follow, unfollow]
  );

  const relabel = useCallback(
    async (address, label) => {
      const key = String(address || '').toLowerCase();
      await update({ watched_wallets: list.map(w => (w.address === key ? { ...w, label } : w)) });
    },
    [list, update]
  );

  const savePrefs = useCallback(patch => update({ whale_alerts: { ...prefs, ...patch } }), [prefs, update]);

  return {
    list,
    set,
    isFollowing: address => set.has(String(address || '').toLowerCase()),
    follow,
    unfollow,
    toggle,
    relabel,
    prefs,
    savePrefs,
    isSaving,
    ready: !!user,
  };
}
