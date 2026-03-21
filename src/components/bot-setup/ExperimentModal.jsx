import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, DollarSign, Rocket } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import AlgorithmSelector from './AlgorithmCard';
import CategoryFilter from './CategoryFilter';
import SuggestedDuration from './SuggestedDuration';
import CustomParams from './CustomParams';

export default function ExperimentModal({ open, onClose }) {
  const queryClient = useQueryClient();

  const [fund, setFund] = useState(100);
  const [algorithm, setAlgorithm] = useState('momentum');
  const [categories, setCategories] = useState(['all']);
  const [duration, setDuration] = useState(8);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [customParams, setCustomParams] = useState({ entry: 0.3, exit: 0.7, maxPositions: 5 });
  const [botName, setBotName] = useState('');

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BotRun.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['botRuns'] });
      toast.success('Experiment started (paper trading)');
      onClose();
      resetForm();
    },
  });

  const resetForm = () => {
    setFund(100); setAlgorithm('momentum'); setCategories(['all']);
    setDuration(8); setUseCustomDuration(false); setBotName('');
  };

  const handleLaunch = () => {
    if (fund <= 0) { toast.error('Please enter a simulated fund amount'); return; }
    const name = botName.trim() || `exp-${algorithm}-${Date.now().toString(36)}`;
    const initialPnl = Math.round((Math.random() * fund * 0.08 - fund * 0.02) * 100) / 100;
    const pnlHistory = Array.from({ length: 6 }, (_, i) => ({
      time: `${i}h`,
      pnl: Math.round((Math.random() * fund * 0.05 - fund * 0.01) * 100) / 100,
    }));

    createMutation.mutate({
      name,
      algorithm,
      categories,
      fund_allocation: fund,
      duration_hours: duration,
      status: 'running',
      is_paper: true,
      current_value: fund + initialPnl,
      pnl: initialPnl,
      pnl_percent: (initialPnl / fund) * 100,
      positions_bought: Math.floor(Math.random() * 3) + 1,
      positions_sold: 0,
      start_time: new Date().toISOString(),
      custom_params: algorithm === 'custom' ? customParams : undefined,
      pnl_history: pnlHistory,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">New Experiment</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Paper trading — no real funds used</p>
            </div>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Paper
            </span>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {/* Paper notice */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
            <FlaskConical className="w-4 h-4 text-violet-400 flex-shrink-0" />
            <p className="text-xs text-violet-300">
              This experiment simulates trades without using real funds. Use it to test strategies before going live.
            </p>
          </div>

          {/* Bot Name */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Experiment Name (optional)</label>
            <Input
              value={botName}
              onChange={(e) => setBotName(e.target.value)}
              placeholder="e.g. momentum-test-1"
              className="bg-background border-border font-mono text-sm"
            />
          </div>

          {/* Simulated Fund */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Simulated Fund Amount</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min={1}
                value={fund}
                onChange={(e) => setFund(Number(e.target.value))}
                className="pl-8 bg-background border-border font-mono text-lg h-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC (sim)</span>
            </div>
            <div className="flex gap-2">
              {[50, 100, 250, 500].map(amt => (
                <button
                  key={amt}
                  onClick={() => setFund(amt)}
                  className={`px-3 py-1 rounded-md text-xs font-mono border transition-all ${
                    fund === amt
                      ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          <AlgorithmSelector selected={algorithm} onSelect={setAlgorithm} />
          {algorithm === 'custom' && <CustomParams params={customParams} onChange={setCustomParams} />}
          <CategoryFilter selected={categories} onToggle={setCategories} />
          <SuggestedDuration
            fund={fund} algorithm={algorithm} categories={categories}
            value={duration} onChange={setDuration}
            useCustom={useCustomDuration} setUseCustom={setUseCustomDuration}
          />
        </div>

        <div className="px-6 pb-6">
          <Button
            onClick={handleLaunch}
            disabled={createMutation.isPending}
            className="w-full h-11 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm rounded-xl"
          >
            {createMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <FlaskConical className="w-4 h-4 mr-2" />
                Run Experiment — ${fund.toFixed(0)} USDC (simulated)
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}