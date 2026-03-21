import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StatsRow from '../components/dashboard/StatsRow';
import PnlChart from '../components/dashboard/PnlChart';
import LiveBots from '../components/dashboard/LiveBots';
import CompletedRuns from '../components/dashboard/CompletedRuns';
import NewBotModal from '../components/bot-setup/NewBotModal';
import { Activity, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  const [showNewBot, setShowNewBot] = useState(false);
  const liveBots = botRuns.filter(r => r.status === 'running' || r.status === 'paused');
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

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        </div>
        <Button
          onClick={() => setShowNewBot(true)}
          className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-lg"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Bot
        </Button>
      </div>

      <NewBotModal open={showNewBot} onClose={() => setShowNewBot(false)} />

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
    </div>
  );
}