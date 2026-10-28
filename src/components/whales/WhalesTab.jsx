/**
 * Whales tab: live whale flow, insider scan, smart money and followed wallets.
 * Modelled on prediction-market trackers such as Unusual Whales' "Unusual
 * Predictions", built only on Polymarket's public Data API.
 */
import React, { useMemo, useState } from 'react';
import { Waves, Radar, Target, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhaleFeed, useFeedSignals, useMarketCategories } from '@/lib/useTraders';
import { useFollowing } from '@/lib/useFollowing';
import { useWhaleAlerts } from '@/lib/useWhaleAlerts';
import WhaleFlow from './WhaleFlow';
import InsiderScan from './InsiderScan';
import SmartMoney from './SmartMoney';
import Following from './Following';
import AlertsMenu from './AlertsMenu';

const VIEWS = [
  { id: 'flow', label: 'Whale flow', icon: Waves },
  { id: 'smart', label: 'Smart money', icon: Target },
  { id: 'insiders', label: 'Insider scan', icon: Radar },
  { id: 'following', label: 'Following', icon: Star },
];

export default function WhalesTab() {
  const [view, setView] = useState('flow');
  const [minUsd, setMinUsd] = useState(10_000);
  const [side, setSide] = useState(null);

  const feed = useWhaleFeed({ minUsd, side, limit: 100 });
  const trades = useMemo(() => feed.data || [], [feed.data]);
  const { signalsById, pending, total } = useFeedSignals(trades);
  const conditionIds = useMemo(() => trades.map(t => t.conditionId), [trades]);
  const categories = useMarketCategories(conditionIds);
  const following = useFollowing();
  const alerts = useWhaleAlerts({ trades, signalsById, followed: following.set, prefs: following.prefs, enabled: following.ready });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn('pressable flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium', view === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {id === 'following' && following.list.length > 0 && <span className="font-mono text-[10px] text-muted-foreground">{following.list.length}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn('w-1.5 h-1.5 rounded-full', feed.isFetching ? 'bg-primary animate-pulse' : 'bg-primary/60')} />
            live · {feed.dataUpdatedAt ? `updated ${Math.max(0, Math.round((Date.now() - feed.dataUpdatedAt) / 1000))}s ago` : 'loading'}
          </span>
          <AlertsMenu alerts={alerts.alerts} unread={alerts.unread} markRead={alerts.markRead} prefs={following.prefs} stored={alerts.stored} storedUnavailable={alerts.storedUnavailable} />
        </div>
      </div>

      {view === 'flow' && (
        <WhaleFlow
          trades={trades}
          signalsById={signalsById}
          categories={categories}
          pendingStats={pending}
          totalWallets={total}
          minUsd={minUsd}
          onMinUsd={setMinUsd}
          side={side}
          onSide={setSide}
          feed={feed}
          following={following}
        />
      )}
      {view === 'insiders' && <InsiderScan trades={trades} signalsById={signalsById} pendingStats={pending} totalWallets={total} minUsd={minUsd} />}
      {view === 'smart' && <SmartMoney following={following} />}
      {view === 'following' && <Following following={following} />}
    </div>
  );
}
