import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot, DollarSign, Rocket, Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import AlgorithmSelector from '../components/bot-setup/AlgorithmCard';
import CategoryFilter from '../components/bot-setup/CategoryFilter';
import SuggestedDuration from '../components/bot-setup/SuggestedDuration';
import CustomParams from '../components/bot-setup/CustomParams';

export default function NewBot() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [fund, setFund] = useState(100);
  const [algorithm, setAlgorithm] = useState('momentum');
  const [categories, setCategories] = useState(['all']);
  const [duration, setDuration] = useState(8);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [customParams, setCustomParams] = useState({ entry: 0.3, exit: 0.7, maxPositions: 5 });
  const [botName, setBotName] = useState('');

  const simulatedBalance = 2847.52;

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BotRun.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['botRuns'] });
      toast.success('Bot launched successfully!');
      navigate('/');
    },
  });

  const handleLaunch = () => {
    if (fund <= 0) {
      toast.error('Please enter a valid fund amount');
      return;
    }
    if (fund > simulatedBalance) {
      toast.error('Insufficient balance');
      return;
    }

    const name = botName.trim() || `${algorithm}-${Date.now().toString(36)}`;

    // Generate simulated P&L history
    const pnlHistory = Array.from({ length: 12 }, (_, i) => ({
      time: `${i}h`,
      pnl: Math.round((Math.random() * fund * 0.1 - fund * 0.03) * 100) / 100,
    }));

    // Simulate initial P&L
    const initialPnl = Math.round((Math.random() * fund * 0.08 - fund * 0.02) * 100) / 100;

    createMutation.mutate({
      name,
      algorithm,
      categories,
      fund_allocation: fund,
      duration_hours: duration,
      status: 'running',
      current_value: fund + initialPnl,
      pnl: initialPnl,
      pnl_percent: (initialPnl / fund) * 100,
      positions_bought: Math.floor(Math.random() * 5) + 1,
      positions_sold: 0,
      start_time: new Date().toISOString(),
      custom_params: algorithm === 'custom' ? customParams : undefined,
      pnl_history: pnlHistory,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Configure New Bot</h1>
      </div>

      {/* Wallet Balance */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available Balance</p>
            <p className="text-lg font-bold font-mono text-foreground">${simulatedBalance.toFixed(2)} <span className="text-xs text-muted-foreground font-normal">USDC</span></p>
          </div>
        </div>
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
      </div>

      {/* Bot Name */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bot Name (optional)</label>
        <Input
          value={botName}
          onChange={(e) => setBotName(e.target.value)}
          placeholder="e.g. momentum-alpha"
          className="bg-card border-border font-mono text-sm"
        />
      </div>

      {/* Fund Allocation */}
      <div className="space-y-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fund Allocation</label>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            min={1}
            max={simulatedBalance}
            value={fund}
            onChange={(e) => setFund(Number(e.target.value))}
            className="pl-8 bg-card border-border font-mono text-lg h-12"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC</span>
        </div>
        <div className="flex gap-2">
          {[50, 100, 250, 500].map(amt => (
            <button
              key={amt}
              onClick={() => setFund(amt)}
              className={`px-3 py-1 rounded-md text-xs font-mono border transition-all ${
                fund === amt
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              ${amt}
            </button>
          ))}
        </div>
      </div>

      <AlgorithmSelector selected={algorithm} onSelect={setAlgorithm} />

      {algorithm === 'custom' && (
        <CustomParams params={customParams} onChange={setCustomParams} />
      )}

      <CategoryFilter selected={categories} onToggle={setCategories} />

      <SuggestedDuration
        fund={fund}
        algorithm={algorithm}
        categories={categories}
        value={duration}
        onChange={setDuration}
        useCustom={useCustomDuration}
        setUseCustom={setUseCustomDuration}
      />

      {/* Launch Button */}
      <Button
        onClick={handleLaunch}
        disabled={createMutation.isPending}
        className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl transition-all duration-200"
      >
        {createMutation.isPending ? (
          <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <>
            <Rocket className="w-4 h-4 mr-2" />
            Launch Bot — ${fund.toFixed(0)} USDC
          </>
        )}
      </Button>
    </div>
  );
}