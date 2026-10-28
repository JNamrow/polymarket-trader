import React, { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import StatsRow from '../components/dashboard/StatsRow';
import PnlChart from '../components/dashboard/PnlChart';
import LiveBots from '../components/dashboard/LiveBots';
import CompletedRuns from '../components/dashboard/CompletedRuns';
import EngineStatus from '../components/dashboard/EngineStatus';
import BotLaunchModal from '../components/bot-setup/BotLaunchModal';
import MarketsExplorer from '../components/markets/MarketsExplorer';
import WhalesTab from '../components/whales/WhalesTab';
import { TraderDrawerProvider } from '../components/whales/TraderDrawer';
import { LaunchContext } from '@/lib/launchContext';
import { Activity, Rocket, FlaskConical, Wallet, Fish, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBotEngine } from '@/lib/engine/useBotEngine';
import { useUserProfile, useWalletFunds } from '@/lib/useUserProfile';
import { formatUsd } from '@/api/polymarket';

const TABS = [
  { id: 'bots', label: 'My Bots', icon: Activity },
  { id: 'markets', label: 'Markets', icon: BarChart3 },
  { id: 'whales', label: 'Whales', icon: Fish },
];

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: botRuns = [], isLoading } = useQuery({
    queryKey: ['botRuns'],
    queryFn: () => base44.entities.BotRun.list('-created_date', 100),
    refetchInterval: 30_000,
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades'],
    queryFn: () => base44.entities.Trade.list('-created_date', 1000),
    refetchInterval: 30_000,
  });

  const { user } = useUserProfile();
  const walletFunds = useWalletFunds(user?.polymarket_address);
  const engine = useBotEngine({ bots: botRuns, trades });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BotRun.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['botRuns'] }),
  });

  const [activeTab, setActiveTab] = useState('bots');
  const [launch, setLaunch] = useState(null); // { mode: 'paper' | 'live', pilot? } | null
  const openLaunch = useCallback(({ mode = 'live', pilot = null } = {}) => setLaunch({ mode, pilot }), []);

  const liveBots = botRuns.filter(r => r.status === 'running' || r.status === 'paused');
  const completedRuns = botRuns.filter(r => r.status === 'completed' || r.status === 'stopped');
  const runningCount = botRuns.filter(r => r.status === 'running').length;
  const deployedLive = liveBots.filter(b => !b.is_paper).reduce((sum, b) => sum + (b.fund_allocation || 0), 0);

  const walletCash = walletFunds.data?.cash ?? (user?.wallet_balance != null && user.wallet_balance !== '' ? Number(user.wallet_balance) : null);
  const availableFunds = walletCash != null ? Math.max(0, walletCash - deployedLive) : null;
  const fundsSource = walletFunds.data ? 'live USDC balance of your Polymarket wallet' : walletCash != null ? 'manual balance from Settings' : null;

  const handlePause = bot => updateMutation.mutate({ id: bot.id, data: { status: 'paused' } });
  const handleResume = bot => updateMutation.mutate({ id: bot.id, data: { status: 'running' } });
  const handleStop = async bot => {
    try {
      const result = await engine.stopBot(bot);
      toast.success(`${bot.name} stopped — ${result.closes} position${result.closes === 1 ? '' : 's'} closed`);
    } catch (err) {
      toast.error(err?.message || 'Could not stop the bot');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <LaunchContext.Provider value={{ openLaunch }}>
    <TraderDrawerProvider>
      <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  activeTab === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          {activeTab === 'bots' && availableFunds !== null && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border"
              title={`Available = ${fundsSource} minus funds allocated to live bots`}
            >
              <Wallet className="w-3 h-3 text-muted-foreground" />
              <span className="hidden sm:inline text-xs text-muted-foreground">Available</span>
              <span className={cn('text-xs font-mono font-semibold', availableFunds > 0 ? 'text-primary' : 'text-destructive')}>
                {formatUsd(availableFunds)}
              </span>
            </div>
          )}
          {activeTab === 'bots' && <EngineStatus engine={engine} runningCount={runningCount} />}
        </div>
        {activeTab === 'bots' && (
          <div className="flex gap-2 flex-shrink-0">
            <Button
              onClick={() => setLaunch({ mode: 'paper' })}
              variant="outline"
              size="sm"
              className="h-8 border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 font-medium rounded-lg px-2.5"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="hidden sm:inline ml-1.5">Experiment</span>
            </Button>
            <Button
              onClick={() => setLaunch({ mode: 'live' })}
              size="sm"
              className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg px-2.5"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span className="hidden sm:inline ml-1.5">Start portfolio</span>
            </Button>
          </div>
        )}
      </div>

      <BotLaunchModal
        open={launch !== null}
        mode={launch?.mode || 'paper'}
        preset={launch}
        onClose={() => setLaunch(null)}
        availableFunds={availableFunds}
        defaults={{ fund: user?.default_fund, algorithm: user?.default_algorithm }}
        onLaunched={bot => engine.tickNow([bot])}
      />

      {activeTab === 'bots' && (
        <>
          <StatsRow botRuns={botRuns} />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5">
            <div className="lg:col-span-3">
              <PnlChart botRuns={botRuns} />
            </div>
            <div className="lg:col-span-2">
              <LiveBots
                bots={liveBots}
                trades={trades}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
                onTick={bot => engine.tickNow([bot])}
                engineBusy={engine.running}
              />
            </div>
          </div>
          <CompletedRuns runs={completedRuns} trades={trades} />
        </>
      )}

      {activeTab === 'markets' && <MarketsExplorer />}
      {activeTab === 'whales' && <WhalesTab />}
      </div>
    </TraderDrawerProvider>
    </LaunchContext.Provider>
  );
}
