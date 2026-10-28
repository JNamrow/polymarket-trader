import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, Settings as SettingsIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatUsd } from '@/api/polymarket';
import { ALERT_KIND_LABELS } from '@/lib/useWhaleAlerts';
import { TraderLink, shortAgo, marketUrl } from './shared';

const KIND_STYLES = {
  followed: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
  insider: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  contrarian: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  whale: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};

function AlertRow({ a }) {
  return (
    <div className={cn('px-3 py-2 text-xs', a.initial && !a.stored && 'opacity-70')}>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 font-normal', KIND_STYLES[a.kind])}>
          {ALERT_KIND_LABELS[a.kind]}
        </Badge>
        <span className="font-mono text-[10px] text-muted-foreground ml-auto">{shortAgo(a.timestamp)}</span>
      </div>
      <p className="mt-1 text-foreground/90">
        <TraderLink address={a.wallet} name={a.name} showAvatar={false} className="font-medium" />{' '}
        <span className="text-muted-foreground">{a.text.replace(`${a.name} `, '').replace(/ · .*$/, '')}</span>
      </p>
      <a href={marketUrl(a.eventSlug)} target="_blank" rel="noreferrer" className="block text-[11px] text-muted-foreground truncate hover:text-foreground hover:underline" title={a.title}>
        {a.title}
      </a>
    </div>
  );
}

export default function AlertsMenu({ alerts, unread, markRead, prefs, stored = [], storedUnavailable = false }) {
  return (
    <Popover
      onOpenChange={open => {
        if (open) markRead();
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="relative h-8 px-2.5 flex items-center gap-1.5 rounded-lg border border-border bg-card text-xs text-muted-foreground hover:text-foreground" title="Alerts">
          <Bell className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Alerts</span>
          {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-mono flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] max-w-[92vw] p-0 bg-card border-border">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium text-foreground">Alerts while this tab is open</span>
          <Link to="/settings" className="text-muted-foreground hover:text-foreground" title="Alert settings">
            <SettingsIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
        <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/60">
          Followed wallets{prefs?.followed === false ? ' (off)' : ''} · insiders{prefs?.insiders === false ? ' (off)' : ''} · contrarian ≥ {formatUsd(prefs?.minUsd || 0, { compact: true })}
          {prefs?.contrarian === false ? ' (off)' : ''} · whale ≥ {formatUsd((prefs?.minUsd || 0) * 4, { compact: true })}
        </p>
        <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
          {alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nothing yet. Alerts appear as fills come in.</p>
          ) : (
            <div className="divide-y divide-border/60">
              {alerts.slice(0, 60).map(a => (
                <AlertRow key={a.id} a={a} />
              ))}
            </div>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-y border-border/60 bg-muted/30">
            Stored by the server scanner {storedUnavailable ? '· not deployed' : stored.length ? `· ${stored.length}` : '· none yet'}
          </div>
          {stored.length > 0 && (
            <div className="divide-y divide-border/60">
              {stored.slice(0, 40).map(a => (
                <AlertRow key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
