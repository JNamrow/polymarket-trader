import React, { useState } from 'react';
import { Check, Plus, Star, Trophy, Search, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isAddress } from '@/lib/wallet';
import { formatUsd, LEADERBOARD_CATEGORIES } from '@/api/polymarket';
import { useLeaderboard, useTraderStats, useTraderPositions } from '@/lib/useTraders';
import { useFollowing } from '@/lib/useFollowing';
import { DEFAULT_RISK } from '@/engine/sizing.js';
import { TraderAvatar, Pnl, Chip, Segmented, Spinner } from '@/components/whales/shared';

export const MAX_PILOTS = 3;

const SOURCES = [
  { id: 'top', label: 'Top traders' },
  { id: 'following', label: 'Following' },
  { id: 'paste', label: 'Paste address' },
];
const WINDOWS = [
  { id: '1w', label: '7d' },
  { id: '1m', label: '30d' },
  { id: 'all', label: 'All time' },
];

function CandidateRow({ wallet, selected, onToggle, sub }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(wallet)}
      className={cn('w-full flex items-center gap-3 px-3 py-2 text-left text-xs rounded-lg border transition-[color,background-color,border-color,box-shadow] duration-150 ease-out', selected ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-secondary/50')}
    >
      <TraderAvatar src={wallet.profileImage} address={wallet.address} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-foreground truncate">{wallet.name || `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
      {wallet.pnl != null && <Pnl value={wallet.pnl} className="flex-shrink-0" />}
      <span className={cn('w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{selected && <Check className="w-3 h-3" />}</span>
    </button>
  );
}

/** What your allocation looks like next to the pilot's real book. */
function PilotPreview({ pilot, budget, isPaper }) {
  const stats = useTraderStats(pilot.address);
  const positions = useTraderPositions(pilot.address);
  // Only the live book counts; settled positions awaiting redeem are not mirrored.
  const rows = (positions.data || []).filter(p => p.currentValue > 0 && !p.redeemable);
  const value = rows.reduce((s, p) => s + p.currentValue, 0);
  const scale = value > 0 ? budget / value : 0;
  const mirrorable = rows.filter(p => p.currentValue * scale >= DEFAULT_RISK.minTradeUsd).length;
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <TraderAvatar src={pilot.profileImage} address={pilot.address} size="sm" />
        <span className="text-foreground font-medium truncate">{pilot.name || pilot.address.slice(0, 10)}</span>
        {stats.data && (
          <span className="ml-auto text-muted-foreground">
            all-time <Pnl value={stats.data.tradePnl} />
          </span>
        )}
      </div>
      {positions.isLoading || stats.isLoading ? (
        <p className="text-muted-foreground">Reading their book…</p>
      ) : positions.error ? (
        <p className="text-destructive">Could not read positions: {positions.error.message}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Book: {formatUsd(value, { compact: true })} across {rows.length} position{rows.length === 1 ? '' : 's'} · {stats.data ? `${stats.data.marketsTraded} markets traded` : ''}
          </p>
          {value > 0 ? (
            <p className="text-muted-foreground">
              Your {formatUsd(budget, { compact: true })}{isPaper ? ' (paper)' : ''} mirrors <span className="text-foreground font-mono">{(scale * 100).toFixed(scale * 100 < 1 ? 3 : 1)}%</span> of it.{' '}
              <span className={mirrorable === rows.length ? 'text-primary' : 'text-amber-300'}>
                {mirrorable} of {rows.length}
              </span>{' '}
              positions clear the ${DEFAULT_RISK.minTradeUsd} minimum fill.
            </p>
          ) : (
            <p className="text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> No open positions right now. Nothing is bought until they trade.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function PilotPicker({ selected = [], onChange, fund = 0, isPaper = true, copyMode = 'mirror', onCopyMode }) {
  const [source, setSource] = useState('top');
  const [window, setWindow] = useState('1m');
  const [category, setCategory] = useState('overall');
  const [search, setSearch] = useState('');
  const [address, setAddress] = useState('');
  const board = useLeaderboard({ window, orderBy: 'PNL', category, limit: 20, enabled: source === 'top' });
  const following = useFollowing();
  const isSelected = w => selected.some(s => s.address === w.address);

  const toggle = wallet => {
    const key = wallet.address.toLowerCase();
    if (selected.some(s => s.address === key)) {
      onChange(selected.filter(s => s.address !== key));
      return;
    }
    if (selected.length >= MAX_PILOTS) {
      toast.error(`Up to ${MAX_PILOTS} wallets per portfolio`);
      return;
    }
    onChange([...selected, { address: key, name: wallet.name || wallet.label || '', profileImage: wallet.profileImage || '' }]);
  };

  const addPasted = () => {
    const key = address.trim().toLowerCase();
    if (!isAddress(key)) {
      toast.error('Enter a 0x wallet address (40 hex characters)');
      return;
    }
    toggle({ address: key, name: '' });
    setAddress('');
  };

  const q = search.trim().toLowerCase();
  const topRows = (board.data || []).filter(w => !q || `${w.name} ${w.address}`.toLowerCase().includes(q));
  const budget = selected.length ? fund / selected.length : fund;

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {selected.map(p => (
              <span key={p.address} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-md border border-primary/40 bg-primary/10 text-xs text-primary">
                <TraderAvatar src={p.profileImage} address={p.address} size="sm" className="w-5 h-5" />
                {p.name || `${p.address.slice(0, 6)}…${p.address.slice(-4)}`}
                <button type="button" onClick={() => toggle(p)} className="hover:text-foreground" title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {selected.length > 1 && <span className="text-[11px] text-muted-foreground self-center">{formatUsd(budget, { compact: true })} each</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {selected.map(p => (
              <PilotPreview key={p.address} pilot={p} budget={budget} isPaper={isPaper} />
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Start</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                ['mirror', 'Mirror their book now', 'Buy into every position they hold today, in their proportions. Then follow their moves.'],
                ['new_only', 'Copy new moves only', 'Take a snapshot now and copy only the trades they make from here on.'],
              ].map(([id, title, text]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onCopyMode?.(id)}
                  className={cn('text-left p-3 rounded-xl border transition-[color,background-color,border-color,box-shadow] duration-150 ease-out', copyMode === id ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-secondary/40')}
                >
                  <p className={cn('text-sm font-medium', copyMode === id ? 'text-primary' : 'text-foreground')}>{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Segmented options={SOURCES} value={source} onChange={setSource} />
          {source === 'top' && (
            <>
              <span className="w-px h-4 bg-border hidden sm:block" />
              {WINDOWS.map(w => (
                <Chip key={w.id} small active={window === w.id} onClick={() => setWindow(w.id)}>
                  {w.label}
                </Chip>
              ))}
              <div className="relative ml-auto">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter" className="h-7 w-32 pl-6 bg-background border-border text-xs" />
              </div>
            </>
          )}
        </div>

        {source === 'top' && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              {LEADERBOARD_CATEGORIES.map(c => (
                <Chip key={c.id} small active={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.label}
                </Chip>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card p-1 max-h-64 overflow-y-auto">
              {board.isLoading ? (
                <Spinner className="py-6" />
              ) : board.error ? (
                <p className="p-3 text-xs text-destructive">{board.error.message}</p>
              ) : topRows.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No traders match</p>
              ) : (
                topRows.map(w => (
                  <CandidateRow key={w.address} wallet={w} selected={isSelected(w)} onToggle={toggle} sub={`#${w.rank} · ${formatUsd(w.volume, { compact: true })} volume · ${WINDOWS.find(x => x.id === window)?.label} P&L`} />
                ))
              )}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Trophy className="w-3 h-3" /> Polymarket's leaderboard for the niche and window. Open a trader on the Whales tab to see their full record before you copy them.
            </p>
          </>
        )}

        {source === 'following' && (
          <div className="rounded-xl border border-border bg-card p-1 max-h-64 overflow-y-auto">
            {following.list.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground flex items-center gap-1">
                <Star className="w-3 h-3" /> You follow no wallets yet. Star traders on the Whales tab and they show up here.
              </p>
            ) : (
              following.list.map(w => <CandidateRow key={w.address} wallet={{ ...w, name: w.label || w.name }} selected={isSelected(w)} onToggle={toggle} sub={`${w.address.slice(0, 10)}…`} />)
            )}
          </div>
        )}

        {source === 'paste' && (
          <div className="flex gap-2">
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="0x… Polymarket profile address" className="bg-background border-border font-mono text-xs h-9 flex-1" />
            <Button type="button" size="sm" onClick={addPasted} className="h-9">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
