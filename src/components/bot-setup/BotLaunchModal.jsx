import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, DollarSign, Rocket, Wallet, FlaskConical, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import AlgorithmSelector from './AlgorithmCard';
import CategoryFilter from './CategoryFilter';
import SuggestedDuration from './SuggestedDuration';
import CustomParams from './CustomParams';
import RiskControls from './RiskControls';
import { DEFAULT_RISK } from '../../../base44/shared/engine/sizing.js';
import { ENGINE_VERSION } from '../../../base44/shared/engine/tick.js';
import { formatUsd } from '@/api/polymarket';

const KELLY_OPTIONS = [
  { label: '¼ Kelly', value: 0.25 },
  { label: '½ Kelly', value: 0.5 },
  { label: '¾ Kelly', value: 0.75 },
  { label: 'Full Kelly', value: 1.0 },
];

const ORDER_TYPES = [
  { value: 'GTC', desc: 'Rests on book until cancelled' },
  { value: 'GTD', desc: 'Rests until a set date' },
  { value: 'FOK', desc: 'Fill full size or cancel' },
  { value: 'FAK', desc: 'Fill available, cancel rest' },
];

/**
 * One launch form for both paper experiments and live bots.
 * Live bots track real markets but, until a signer is connected, fills are simulated.
 */
export default function BotLaunchModal({ open, onClose, mode = 'paper', availableFunds = null, defaults = {}, onLaunched }) {
  const queryClient = useQueryClient();
  const isPaper = mode === 'paper';

  const [fund, setFund] = useState(100);
  const [algorithm, setAlgorithm] = useState('momentum');
  const [categories, setCategories] = useState(['all']);
  const [duration, setDuration] = useState(8);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [customParams, setCustomParams] = useState({ entry: 0.3, exit: 0.7, maxPositions: 5 });
  const [botName, setBotName] = useState('');
  const [kellyFraction, setKellyFraction] = useState(0.25);
  const [orderType, setOrderType] = useState('GTC');
  const [risk, setRisk] = useState({
    maxPositions: DEFAULT_RISK.maxPositions,
    stopLossPct: DEFAULT_RISK.stopLossPct,
    takeProfitPct: DEFAULT_RISK.takeProfitPct,
    maxPositionPct: DEFAULT_RISK.maxPositionPct,
  });

  // Apply the user's saved defaults whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    if (defaults.fund > 0) setFund(Number(defaults.fund));
    if (defaults.algorithm) setAlgorithm(defaults.algorithm);
  }, [open, defaults.fund, defaults.algorithm]);

  const resetForm = () => {
    setFund(defaults.fund > 0 ? Number(defaults.fund) : 100);
    setAlgorithm(defaults.algorithm || 'momentum');
    setCategories(['all']);
    setDuration(8);
    setUseCustomDuration(false);
    setBotName('');
    setKellyFraction(0.25);
    setOrderType('GTC');
    setRisk({
      maxPositions: DEFAULT_RISK.maxPositions,
      stopLossPct: DEFAULT_RISK.stopLossPct,
      takeProfitPct: DEFAULT_RISK.takeProfitPct,
      maxPositionPct: DEFAULT_RISK.maxPositionPct,
    });
  };

  const createMutation = useMutation({
    mutationFn: data => base44.entities.BotRun.create(data),
    onSuccess: bot => {
      queryClient.invalidateQueries({ queryKey: ['botRuns'] });
      toast.success(isPaper ? 'Experiment started — first tick running' : 'Bot launched — first tick running');
      onClose();
      resetForm();
      onLaunched?.(bot);
    },
    onError: err => toast.error(err?.response?.data?.message || err?.message || 'Could not create the bot'),
  });

  const handleLaunch = () => {
    if (!(fund > 0)) {
      toast.error('Enter a fund amount');
      return;
    }
    if (!isPaper && availableFunds != null && fund > availableFunds) {
      toast.error(`Only ${formatUsd(availableFunds)} available`);
      return;
    }
    if (algorithm === 'custom' && customParams.exit <= customParams.entry) {
      toast.error('Exit threshold must be above the entry threshold');
      return;
    }
    const now = new Date().toISOString();
    const name = botName.trim() || `${isPaper ? 'exp-' : ''}${algorithm}-${Date.now().toString(36)}`;
    const maxPositions = algorithm === 'custom' ? Number(customParams.maxPositions) || risk.maxPositions : Number(risk.maxPositions) || DEFAULT_RISK.maxPositions;

    createMutation.mutate({
      name,
      algorithm,
      categories,
      fund_allocation: fund,
      duration_hours: duration,
      status: 'running',
      is_paper: isPaper,
      current_value: fund,
      pnl: 0,
      pnl_percent: 0,
      realized_pnl: 0,
      unrealized_pnl: 0,
      positions_bought: 0,
      positions_sold: 0,
      open_positions: 0,
      start_time: now,
      custom_params: algorithm === 'custom' ? { ...customParams, maxPositions } : undefined,
      pnl_history: [{ time: now, pnl: 0, value: fund }],
      activity_log: [{ t: now, type: 'sys', msg: `Bot created (${isPaper ? 'paper' : 'simulated fills'}) — waiting for the first engine tick` }],
      kelly_fraction: kellyFraction,
      order_type: orderType,
      neg_risk: algorithm === 'arbitrage',
      max_positions: maxPositions,
      stop_loss_pct: Number(risk.stopLossPct) || DEFAULT_RISK.stopLossPct,
      take_profit_pct: Number(risk.takeProfitPct) || DEFAULT_RISK.takeProfitPct,
      max_position_pct: Number(risk.maxPositionPct) || DEFAULT_RISK.maxPositionPct,
      fill_mode: isPaper ? 'paper' : 'simulated',
      engine_version: ENGINE_VERSION,
      ticks: 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={isPaper ? 'w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center' : 'w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center'}>
              {isPaper ? <FlaskConical className="w-4 h-4 text-violet-400" /> : <Bot className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">{isPaper ? 'New Experiment' : 'Configure New Bot'}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isPaper ? 'Paper trading on live Polymarket prices — no real funds' : 'Tracks real markets with your allocation'}
              </p>
            </div>
            {isPaper && (
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">Paper</span>
            )}
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {isPaper ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
              <FlaskConical className="w-4 h-4 text-violet-400 flex-shrink-0" />
              <p className="text-xs text-violet-300">
                The engine scans live markets every minute, opens positions at the real ask, marks them at the real bid, and closes on your rules. Nothing is sent to Polymarket.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90">
                Live order placement is not connected yet. This bot trades real market data with simulated fills and does not move funds. Connect a CLOB signer (see
                Settings) before relying on it for real money.
              </p>
            </div>
          )}

          {/* Balance */}
          <div className="bg-secondary/50 border border-border rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={isPaper ? 'w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center' : 'w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center'}>
                <Wallet className={isPaper ? 'w-4 h-4 text-violet-400' : 'w-4 h-4 text-primary'} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isPaper ? 'Simulated bankroll' : 'Available balance'}</p>
                <p className="text-lg font-bold font-mono text-foreground">
                  {isPaper ? formatUsd(fund) : availableFunds != null ? formatUsd(availableFunds) : '—'}{' '}
                  <span className="text-xs text-muted-foreground font-normal">USDC</span>
                </p>
              </div>
            </div>
            {!isPaper && availableFunds == null && (
              <p className="text-[11px] text-muted-foreground text-right max-w-[200px]">Add your Polymarket wallet address in Settings to see your real balance.</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{isPaper ? 'Experiment' : 'Bot'} Name (optional)</label>
            <Input value={botName} onChange={e => setBotName(e.target.value)} placeholder="e.g. momentum-alpha" className="bg-background border-border font-mono text-sm" />
          </div>

          {/* Fund */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{isPaper ? 'Simulated Fund' : 'Fund Allocation'}</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min={1}
                value={fund}
                onChange={e => setFund(Number(e.target.value))}
                className="pl-8 bg-background border-border font-mono text-lg h-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC{isPaper ? ' (sim)' : ''}</span>
            </div>
            <div className="flex gap-2">
              {[50, 100, 250, 500].map(amt => (
                <button
                  key={amt}
                  onClick={() => setFund(amt)}
                  className={`px-3 py-1 rounded-md text-xs font-mono border transition-all ${
                    fund === amt
                      ? isPaper
                        ? 'border-violet-500/50 bg-violet-500/10 text-violet-400'
                        : 'border-primary/50 bg-primary/10 text-primary'
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

          <RiskControls value={risk} onChange={setRisk} />

          {/* Kelly */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kelly Fraction</label>
            <div className="grid grid-cols-4 gap-2">
              {KELLY_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setKellyFraction(value)}
                  className={`px-2 py-2 rounded-lg text-xs font-mono border transition-all ${
                    kellyFraction === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {kellyFraction <= 0.25
                ? '✓ Recommended — lowest variance, ~75% of max growth'
                : kellyFraction <= 0.5
                  ? 'Moderate risk — higher growth, more drawdown'
                  : '⚠ Aggressive — significant drawdown risk'}
            </p>
          </div>

          {/* Order type */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Order Type</label>
            <div className="grid grid-cols-4 gap-2">
              {ORDER_TYPES.map(({ value, desc }) => (
                <button
                  key={value}
                  onClick={() => setOrderType(value)}
                  title={desc}
                  className={`px-2 py-2 rounded-lg text-xs font-mono border transition-all ${
                    orderType === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Stored for live execution. Paper fills are always taker (buy at ask, sell at bid), except market making which joins the bid.</p>
          </div>

          <SuggestedDuration
            fund={fund}
            algorithm={algorithm}
            categories={categories}
            value={duration}
            onChange={setDuration}
            useCustom={useCustomDuration}
            setUseCustom={setUseCustomDuration}
          />
        </div>

        <div className="px-6 pb-6">
          <Button
            onClick={handleLaunch}
            disabled={createMutation.isPending}
            className={
              isPaper
                ? 'w-full h-11 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm rounded-xl'
                : 'w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl'
            }
          >
            {createMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isPaper ? <FlaskConical className="w-4 h-4 mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                {isPaper ? `Run Experiment — $${Number(fund || 0).toFixed(0)} USDC (simulated)` : `Launch Bot — $${Number(fund || 0).toFixed(0)} USDC`}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
