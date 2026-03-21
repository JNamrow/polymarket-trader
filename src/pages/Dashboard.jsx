import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StatsRow from '../components/dashboard/StatsRow';
import PnlChart from '../components/dashboard/PnlChart';
import LiveBots from '../components/dashboard/LiveBots';
import CompletedRuns from '../components/dashboard/CompletedRuns';
import NewBotModal from '../components/bot-setup/NewBotModal';
import ExperimentModal from '../components/bot-setup/ExperimentModal';
import Watchlist from '../components/watchlist/Watchlist';
import { Activity, Plus, FlaskConical, Wallet, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const queryClient = useQueryClient();

  const { data: botRuns = [], isLoading } = useQuery({
    queryKey: ['botRuns'],
    queryFn: () => base44.entities.BotRun.list('-created_date', 100),
  });

  const { data: trades = [] } = useQuery({
    queryKey: ['trades'],
    queryFn: () => base44.entities.Trade.list('-created_date', 500),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BotRun.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['botRuns'] }),
  });

  const [activeTab, setActiveTab] = useState('bots');
  const [showNewBot, setShowNewBot] = useState(false);
  const [showExperiment, setShowExperiment] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.wallet_balance !== undefined) setWalletBalance(user.wallet_balance);
    }).catch(() => {});
  }, []);
  const liveBots = botRuns.filter(r => r.status === 'running' || r.status === 'paused');
  const deployedFunds = liveBots.filter(b => !b.is_paper).reduce((sum, b) => sum + (b.fund_allocation || 0), 0);
  const availableFunds = walletBalance !== null ? Math.max(0, walletBalance - deployedFunds) : null;
  const completedRuns = botRuns.filter(r => r.status === 'completed' || r.status === 'stopped');

  const handlePause = (bot) => updateMutation.mutate({ id: bot.id, data: { status: 'paused' } });
  const handleResume = (bot) => updateMutation.mutate({ id: bot.id, data: { status: 'running' } });
  const handleStop = (bot) => updateMutation.mutate({
    id: bot.id,
    data: { status: 'stopped', end_time: new Date().toISOString() }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: 'bots', label: 'My Bots', icon: Activity },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
  ];

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  activeTab === id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
          {activeTab === 'bots' && availableFunds !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary border border-border">
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Available</span>
              <span className={`text-xs font-mono font-semibold ${availableFunds > 0 ? 'text-primary' : 'text-destructive'}`}>
                ${availableFunds.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        {activeTab === 'bots' && (
          <div className="flex gap-2">
            <Button
              onClick={() => setShowExperiment(true)}
              variant="outline"
              className="h-9 border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 font-medium text-sm rounded-lg"
            >
              <FlaskConical className="w-4 h-4 mr-1.5" />
              Experiment
            </Button>
            <Button
              onClick={() => setShowNewBot(true)}
              className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-lg"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Bot
            </Button>
          </div>
        )}
      </div>

      <NewBotModal open={showNewBot} onClose={() => setShowNewBot(false)} />
      <ExperimentModal open={showExperiment} onClose={() => setShowExperiment(false)} />

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
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
              />
            </div>
          </div>
          <CompletedRuns runs={completedRuns} trades={trades} />
        </>
      )}

      {activeTab === 'watchlist' && <Watchlist />}
    </div>
  );
}