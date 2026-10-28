import React from 'react';
import { BadgeCheck, Copy, ExternalLink, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shortAddress, profileUrl, formatUsd, CATEGORY_LABELS } from '@/api/polymarket';
import { useTraderDrawer } from './traderDrawerContext';

export const marketUrl = eventSlug => `https://polymarket.com/event/${eventSlug}`;

/** "12s", "3m", "2h", "5d", "3mo". */
export function shortAgo(ts, now = Date.now()) {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d`;
  return `${Math.round(d / 30)}mo`;
}

export function TraderAvatar({ src, address = '', size = 'md', className }) {
  const dims = size === 'sm' ? 'w-6 h-6 text-[9px]' : size === 'lg' ? 'w-12 h-12 text-sm' : 'w-8 h-8 text-[10px]';
  if (src) return <img src={src} alt="" className={cn('media rounded-lg object-cover bg-secondary flex-shrink-0', dims, className)} loading="lazy" />;
  return (
    <div className={cn('rounded-lg bg-secondary flex items-center justify-center font-mono text-muted-foreground flex-shrink-0', dims, className)}>
      {String(address).slice(2, 4).toUpperCase()}
    </div>
  );
}

/** A trader's name; clicking it opens the profile drawer. */
export function TraderLink({ address, name, profileImage, verified = false, size = 'md', showAvatar = true, className }) {
  const { open } = useTraderDrawer();
  const label = name || shortAddress(address);
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        open(address, { name, profileImage, verified });
      }}
      className={cn('inline-flex items-center gap-2 min-w-0 text-left text-foreground hover:text-primary transition-colors duration-150', className)}
      title={address}
    >
      {showAvatar && <TraderAvatar src={profileImage} address={address} size={size === 'sm' ? 'sm' : 'md'} />}
      <span className="truncate">{label}</span>
      {verified && <BadgeCheck className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />}
    </button>
  );
}

export function AddressActions({ address, className }) {
  const copy = async e => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground', className)}>
      {shortAddress(address)}
      <button type="button" onClick={copy} className="hover:text-foreground" title="Copy address">
        <Copy className="w-3 h-3" />
      </button>
      <a href={profileUrl(address)} target="_blank" rel="noreferrer" className="hover:text-foreground" title="Open on Polymarket" onClick={e => e.stopPropagation()}>
        <ExternalLink className="w-3 h-3" />
      </a>
    </span>
  );
}

const FLAG_STYLES = {
  fresh_account: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  few_markets: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  concentrated: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  long_shot: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  big_size: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};

export function FlagBadge({ flag }) {
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 font-normal whitespace-nowrap', FLAG_STYLES[flag.id] || 'border-border text-muted-foreground')} title={flag.detail}>
      {flag.label}
    </Badge>
  );
}

export function FlagList({ flags = [], max = 3, className }) {
  if (!flags.length) return null;
  const shown = flags.slice(0, max);
  const rest = flags.length - shown.length;
  return (
    <span className={cn('inline-flex items-center gap-1 flex-wrap', className)}>
      {shown.map(f => (
        <FlagBadge key={f.id} flag={f} />
      ))}
      {rest > 0 && <span className="text-[10px] text-muted-foreground">+{rest}</span>}
    </span>
  );
}

const SCORE_STYLES = {
  Elite: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300',
  Strong: 'border-primary/40 bg-primary/10 text-primary',
  Average: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  Weak: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  Unrated: 'border-border bg-secondary text-muted-foreground',
};

export function ScoreBadge({ score, label, className, title }) {
  return (
    <Badge variant="outline" className={cn('font-mono text-[11px] px-2 py-0.5 gap-1', SCORE_STYLES[label] || SCORE_STYLES.Unrated, className)} title={title}>
      {score != null ? score : '—'}
      <span className="font-sans font-normal opacity-80">{label}</span>
    </Badge>
  );
}

export function SideBadge({ side, outcome, className }) {
  const buy = side === 'BUY';
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] px-1.5 py-0 font-mono whitespace-nowrap', buy ? 'border-primary/40 bg-primary/10 text-primary' : 'border-destructive/40 bg-destructive/10 text-destructive', className)}
    >
      {buy ? 'BUY' : 'SELL'} {String(outcome || '').toUpperCase().slice(0, 12)}
    </Badge>
  );
}

export function CategoryBadge({ category, className }) {
  if (!category || category === 'other') return null;
  return (
    <Badge variant="outline" className={cn('text-[9px] px-1 py-0 border-border text-muted-foreground font-normal', className)}>
      {CATEGORY_LABELS[category] || category}
    </Badge>
  );
}

/** Signed, coloured money. */
export function Pnl({ value, compact = true, digits = 0, className }) {
  const n = Number(value || 0);
  const text = compact ? formatUsd(Math.abs(n), { compact: true }) : `$${Math.abs(n).toFixed(digits)}`;
  return <span className={cn('font-mono', n > 0 ? 'text-primary' : n < 0 ? 'text-destructive' : 'text-muted-foreground', className)}>{n >= 0 ? '+' : '−'}{text}</span>;
}

export function Chip({ active, onClick, children, small = false, className, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'pressable rounded-full font-medium border whitespace-nowrap',
        small ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        active ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn('flex items-center gap-0.5 bg-secondary rounded-md p-0.5', className)}>
      {options.map(o => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn('pressable px-2 py-0.5 rounded-sm text-[11px] font-medium whitespace-nowrap', value === o.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tile({ label, value, sub, className, title }) {
  return (
    <div className={cn('surface p-3', className)} title={title}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="text-base font-mono font-semibold text-foreground mt-0.5 leading-tight">{value}</div>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function Spinner({ className }) {
  return (
    <div className={cn('py-12 flex items-center justify-center', className)}>
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

/** Placeholder rows while a list loads for the first time. */
export function SkeletonRows({ rows = 6, className }) {
  return (
    <div className={cn('divide-y divide-border/60', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-3 w-8 rounded-sm" />
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-3 w-28 rounded-sm" />
          <Skeleton className="h-3 flex-1 rounded-sm" />
          <Skeleton className="h-3 w-12 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, hint }) {
  return (
    <div className="py-10 flex flex-col items-center gap-2 text-center px-4">
      <AlertTriangle className="w-5 h-5 text-yellow-400" />
      <p className="text-sm text-muted-foreground">{error?.message || String(error)}</p>
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="py-10 flex flex-col items-center gap-2 text-center px-4">
      {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
      <p className="text-sm text-foreground">{title}</p>
      {text && <p className="text-xs text-muted-foreground max-w-md">{text}</p>}
      {children}
    </div>
  );
}

/** Bar that shows where the big money sits (YES share) against the price the crowd pays. */
export function LeanBar({ yesShare, yesPrice, outcomes = ['Yes', 'No'], className }) {
  if (yesShare == null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const pct = Math.round(yesShare * 100);
  const price = yesPrice != null ? Math.round(yesPrice * 100) : null;
  const gap = price != null ? pct - price : null;
  return (
    <div className={cn('min-w-[140px]', className)} title={price != null ? `Whales ${pct}% ${outcomes[0]} vs ${price}¢ price` : `Whales ${pct}% ${outcomes[0]}`}>
      <div className="relative h-2 rounded-full bg-destructive/40 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-primary/70" style={{ width: `${pct}%` }} />
        {price != null && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `calc(${price}% - 1px)` }} />}
      </div>
      <div className="flex justify-between text-[10px] font-mono mt-0.5">
        <span className="text-primary">{pct}% {String(outcomes[0]).slice(0, 10)}</span>
        {gap != null && <span className={cn(gap > 0 ? 'text-primary' : gap < 0 ? 'text-destructive' : 'text-muted-foreground')}>{gap > 0 ? '+' : ''}{gap} vs price</span>}
      </div>
    </div>
  );
}
