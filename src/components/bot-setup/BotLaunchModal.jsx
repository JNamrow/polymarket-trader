/**
 * Portfolio wizard — the heart of the app:
 *   1. Amount   how much to put to work (paper or live allocation)
 *   2. Follow   a trader to copy, or a strategy to run
 *   3. Review   name, duration, risk limits → launch
 * The record it creates is a BotRun; the engine takes it from there.
 */
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Rocket, Wallet, FlaskConical, AlertTriangle, Users, Cpu, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AlgorithmSelector from './AlgorithmCard';
import CategoryFilter from './CategoryFilter';
import SuggestedDuration from './SuggestedDuration';
import CustomParams from './CustomParams';
import RiskControls from './RiskControls';
import PilotPicker from './PilotPicker';
import { DEFAULT_RISK } from '@/engine/sizing.js';
import { ENGINE_VERSION } from '@/engine/tick.js';
import { formatUsd } from '@/api/polymarket';
import { ALGORITHM_LABELS } from '@/components/dashboard/LiveBots';

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

const STEPS = [
  { id: 1, label: 'Amount' },
  { id: 2, label: 'Follow' },
  { id: 3, label: 'Review' },
];

const COPY_RISK = { maxPositions: 25, maxPositionPct: 25 };

function Field({ label, children, hint }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function BotLaunchModal({ open, onClose, mode = 'paper', availableFunds = null, defaults = {}, onLaunched, preset = null }) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [isPaper, setIsPaper] = useState(mode === 'paper');
  const [fund, setFund] = useState(100);
  const [kind, setKind] = useState('copy'); // 'copy' | 'strategy'
  const [pilots, setPilots] = useState([]);
  const [copyMode, setCopyMode] = useState('mirror');
  const [algorithm, setAlgorithm] = useState('momentum');
  const [categories, setCategories] = useState(['all']);
  const [customParams, setCustomParams] = useState({ entry: 0.3, exit: 0.7, maxPositions: 5 });
  const [botName, setBotName] = useState('');
  const [kellyFraction, setKellyFraction] = useState(0.25);
  const [orderType, setOrderType] = useState('GTC');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [duration, setDuration] = useState(8);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [untilStopped, setUntilStopped] = useState(true);
  const [ownExits, setOwnExits] = useState(false);
  const [copyRisk, setCopyRisk] = useState(COPY_RISK);
  const [risk, setRisk] = useState({
    maxPositions: DEFAULT_RISK.maxPositions,
    stopLossPct: DEFAULT_RISK.stopLossPct,
    takeProfitPct: DEFAULT_RISK.takeProfitPct,
    maxPositionPct: DEFAULT_RISK.maxPositionPct,
  });

  // Fresh state every time the wizard opens; a preset (from "Copy this trader") pre-fills the pilot.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setIsPaper(mode === 'paper');
    setFund(defaults.fund > 0 ? Number(defaults.fund) : 100);
    setAlgorithm(defaults.algorithm || 'momentum');
    setCategories(['all']);
    setBotName('');
    setKellyFraction(0.25);
    setOrderType('GTC');
    setShowAdvanced(false);
    setDuration(8);
    setUseCustomDuration(false);
    setUntilStopped(true);
    setOwnExits(false);
    setCopyRisk(COPY_RISK);
    setCopyMode('mirror');
    setRisk({ maxPositions: DEFAULT_RISK.maxPositions, stopLossPct: DEFAULT_RISK.stopLossPct, takeProfitPct: DEFAULT_RISK.takeProfitPct, maxPositionPct: DEFAULT_RISK.maxPositionPct });
    if (preset?.pilot) {
      setKind('copy');
      setPilots([{ address: preset.pilot.address.toLowerCase(), name: preset.pilot.name || '', profileImage: preset.pilot.profileImage || '' }]);
    } else {
      setKind('copy');
      setPilots([]);
    }
  }, [open, mode, defaults.fund, defaults.algorithm, preset]);

  const createMutation = useMutation({
    mutationFn: data => base44.entities.BotRun.create(data),
    onSuccess: bot => {
      queryClient.invalidateQueries({ queryKey: ['botRuns'] });
      toast.success(isPaper ? 'Paper portfolio started — first tick running' : 'Portfolio launched — first tick running');
      onClose();
      onLaunched?.(bot);
    },
    onError: err => toast.error(err?.response?.data?.message || err?.message || 'Could not create the portfolio'),
  });

  const isCopy = kind === 'copy';
  const pilotNames = pilots.map(p => p.name || `${p.address.slice(0, 6)}…${p.address.slice(-4)}`);

  const validate = s => {
    if (s === 1) {
      if (!(fund > 0)) return 'Enter an amount';
      if (!isPaper && availableFunds != null && fund > availableFunds) return `Only ${formatUsd(availableFunds)} available`;
    }
    if (s === 2) {
      if (isCopy && pilots.length === 0) return 'Pick at least one trader to copy';
      if (!isCopy && algorithm === 'custom' && customParams.exit <= customParams.entry) return 'Exit threshold must be above the entry threshold';
    }
    return null;
  };

  const next = () => {
    const err = validate(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep(s => Math.min(3, s + 1));
  };

  const handleLaunch = () => {
    for (const s of [1, 2]) {
      const err = validate(s);
      if (err) {
        toast.error(err);
        setStep(s);
        return;
      }
    }
    const now = new Date().toISOString();
    const base = {
      fund_allocation: fund,
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
      pnl_history: [{ time: now, pnl: 0, value: fund }],
      order_type: orderType,
      fill_mode: isPaper ? 'paper' : 'simulated',
      engine_version: ENGINE_VERSION,
      ticks: 0,
    };

    if (isCopy) {
      const name = botName.trim() || `copy-${(pilotNames[0] || 'trader').replace(/\s+/g, '-').toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
      createMutation.mutate({
        ...base,
        name,
        algorithm: 'copy',
        categories: ['all'],
        duration_hours: untilStopped ? 0 : duration,
        copy_wallets: pilots.map(p => ({ address: p.address, name: p.name || '', profileImage: p.profileImage || '' })),
        copy_mode: copyMode,
        copy_state: {},
        kelly_fraction: 1,
        neg_risk: false,
        max_positions: Number(copyRisk.maxPositions) || COPY_RISK.maxPositions,
        max_position_pct: Number(copyRisk.maxPositionPct) || COPY_RISK.maxPositionPct,
        stop_loss_pct: ownExits ? Number(risk.stopLossPct) || DEFAULT_RISK.stopLossPct : 0,
        take_profit_pct: ownExits ? Number(risk.takeProfitPct) || DEFAULT_RISK.takeProfitPct : 0,
        activity_log: [
          {
            t: now,
            type: 'sys',
            msg: `Portfolio created (${isPaper ? 'paper' : 'simulated fills'}) — copying ${pilotNames.join(', ')} (${copyMode === 'mirror' ? 'mirror their book now' : 'new moves only'})`,
          },
        ],
      });
      return;
    }

    const name = botName.trim() || `${isPaper ? 'exp-' : ''}${algorithm}-${Date.now().toString(36)}`;
    const maxPositions = algorithm === 'custom' ? Number(customParams.maxPositions) || risk.maxPositions : Number(risk.maxPositions) || DEFAULT_RISK.maxPositions;
    createMutation.mutate({
      ...base,
      name,
      algorithm,
      categories,
      duration_hours: duration,
      custom_params: algorithm === 'custom' ? { ...customParams, maxPositions } : undefined,
      activity_log: [{ t: now, type: 'sys', msg: `Bot created (${isPaper ? 'paper' : 'simulated fills'}) — waiting for the first engine tick` }],
      kelly_fraction: kellyFraction,
      neg_risk: algorithm === 'arbitrage',
      max_positions: maxPositions,
      stop_loss_pct: Number(risk.stopLossPct) || DEFAULT_RISK.stopLossPct,
      take_profit_pct: Number(risk.takeProfitPct) || DEFAULT_RISK.takeProfitPct,
      max_position_pct: Number(risk.maxPositionPct) || DEFAULT_RISK.maxPositionPct,
    });
  };

  const accent = isPaper ? 'violet' : 'primary';
  const summary = isCopy
    ? `${formatUsd(fund, { compact: true })}${isPaper ? ' paper' : ''} · copying ${pilotNames.join(', ') || '—'} · ${copyMode === 'mirror' ? 'mirror now' : 'new moves only'} · ${untilStopped ? 'until stopped' : `${duration}h`}`
    : `${formatUsd(fund, { compact: true })}${isPaper ? ' paper' : ''} · ${ALGORITHM_LABELS[algorithm] || algorithm} · ${categories.join(', ')} · ${duration}h`;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto overscroll-contain bg-card border-border p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isPaper ? 'bg-violet-500/10' : 'bg-primary/10')}>
              {isPaper ? <FlaskConical className="w-4 h-4 text-violet-400" /> : <Rocket className="w-4 h-4 text-primary" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground">{isPaper ? 'New paper portfolio' : 'Start a portfolio'}</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Choose an amount, pick a trader to copy or a strategy to run, and set it running.</p>
            </div>
            <ol className="ml-auto hidden sm:flex items-center gap-1 text-[11px]">
              {STEPS.map((s, i) => (
                <li key={s.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => s.id < step && setStep(s.id)}
                    className={cn('flex items-center gap-1.5 px-2 py-1 rounded-md', step === s.id ? 'bg-secondary text-foreground' : s.id < step ? 'text-primary' : 'text-muted-foreground')}
                  >
                    <span className={cn('w-4 h-4 rounded-full border text-[10px] flex items-center justify-center font-mono', step === s.id ? 'border-foreground' : s.id < step ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                      {s.id < step ? <Check className="w-2.5 h-2.5" /> : s.id}
                    </span>
                    {s.label}
                  </button>
                  {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </li>
              ))}
            </ol>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          {step === 1 && (
            <>
              <Field label="Money">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['paper', 'Paper', 'Simulated money on real prices. Nothing leaves your wallet.', FlaskConical],
                    ['live', 'Live allocation', 'Tracks your real balance. Fills stay simulated until a signer is connected.', Wallet],
                  ].map(([id, title, text, Icon]) => {
                    const active = isPaper === (id === 'paper');
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setIsPaper(id === 'paper')}
                        className={cn('text-left p-3 rounded-xl border transition-[color,background-color,border-color,box-shadow] duration-150 ease-out', active ? (id === 'paper' ? 'border-violet-500/50 bg-violet-500/5' : 'border-primary/50 bg-primary/5') : 'border-border bg-background hover:bg-secondary/40')}
                      >
                        <p className={cn('text-sm font-medium flex items-center gap-1.5', active ? (id === 'paper' ? 'text-violet-300' : 'text-primary') : 'text-foreground')}>
                          <Icon className="w-3.5 h-3.5" /> {title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {!isPaper && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200/90">
                    Live order placement is not connected yet. This portfolio follows real market data with simulated fills and never moves funds. See Settings → Live execution.
                  </p>
                </div>
              )}

              <Field label={isPaper ? 'Amount (simulated USDC)' : 'Amount to allocate (USDC)'}>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input type="number" min={1} value={fund} onChange={e => setFund(Number(e.target.value))} className="pl-8 bg-background border-border font-mono text-lg h-12" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDC{isPaper ? ' (sim)' : ''}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[50, 100, 250, 500, 1000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFund(amt)}
                      className={cn(
                        'pressable px-3 py-1 rounded-md text-xs font-mono border',
                        fund === amt ? (isPaper ? 'border-violet-500/50 bg-violet-500/10 text-violet-400' : 'border-primary/50 bg-primary/10 text-primary') : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      )}
                    >
                      ${amt}
                    </button>
                  ))}
                  {!isPaper && availableFunds != null && (
                    <button type="button" onClick={() => setFund(Math.floor(availableFunds))} className="px-3 py-1 rounded-md text-xs font-mono border border-border bg-background text-muted-foreground hover:text-foreground">
                      max {formatUsd(availableFunds, { compact: true })}
                    </button>
                  )}
                </div>
              </Field>

              {!isPaper && (
                <div className="bg-secondary/50 border border-border rounded-xl p-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5" /> Available balance
                  </span>
                  <span className="font-mono text-foreground">{availableFunds != null ? formatUsd(availableFunds) : 'add your wallet address in Settings'}</span>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['copy', 'Copy a trader', 'Mirror the positions of a wallet you choose, scaled to your amount.', Users],
                  ['strategy', 'Run a strategy', 'One of six rule-based strategies on live markets.', Cpu],
                ].map(([id, title, text, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKind(id)}
                    className={cn('text-left p-4 rounded-xl border transition-[color,background-color,border-color,box-shadow] duration-150 ease-out', kind === id ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-background hover:bg-secondary/40')}
                  >
                    <p className={cn('text-sm font-medium flex items-center gap-2', kind === id ? 'text-primary' : 'text-foreground')}>
                      <Icon className="w-4 h-4" /> {title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{text}</p>
                  </button>
                ))}
              </div>

              {isCopy ? (
                <PilotPicker selected={pilots} onChange={setPilots} fund={fund} isPaper={isPaper} copyMode={copyMode} onCopyMode={setCopyMode} />
              ) : (
                <>
                  <AlgorithmSelector selected={algorithm} onSelect={setAlgorithm} />
                  {algorithm === 'custom' && <CustomParams params={customParams} onChange={setCustomParams} />}
                  <CategoryFilter selected={categories} onToggle={setCategories} />
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className={cn('rounded-xl border p-3 text-xs', isPaper ? 'border-violet-500/30 bg-violet-500/5 text-violet-200' : 'border-primary/30 bg-primary/5 text-foreground')}>{summary}</div>

              <Field label="Name (optional)">
                <Input value={botName} onChange={e => setBotName(e.target.value)} placeholder={isCopy ? `copy-${(pilotNames[0] || 'trader').toLowerCase()}` : 'e.g. momentum-alpha'} className="bg-background border-border font-mono text-sm" />
              </Field>

              {isCopy ? (
                <>
                  <Field label="Duration">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                      <div>
                        <p className="text-sm text-foreground">Run until I stop it</p>
                        <p className="text-xs text-muted-foreground">Copy portfolios usually run open-ended. Turn off to set a time limit.</p>
                      </div>
                      <Switch checked={untilStopped} onCheckedChange={setUntilStopped} />
                    </div>
                    {!untilStopped && (
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-24 h-9 bg-background border-border font-mono text-sm" />
                        <span className="text-xs text-muted-foreground">hours, then close everything</span>
                      </div>
                    )}
                  </Field>

                  <Field label="Limits" hint="Each pilot gets an equal share of the amount. A position is sized to the pilot's share of their own book, capped by these limits. Fills under $2 are skipped.">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-background border border-border rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Max positions</p>
                        <Input type="number" min={1} max={100} value={copyRisk.maxPositions} onChange={e => setCopyRisk(r => ({ ...r, maxPositions: Number(e.target.value) }))} className="h-8 bg-transparent border-border font-mono text-sm" />
                      </div>
                      <div className="bg-background border border-border rounded-lg p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Max per position (%)</p>
                        <Input type="number" min={1} max={100} value={copyRisk.maxPositionPct} onChange={e => setCopyRisk(r => ({ ...r, maxPositionPct: Number(e.target.value) }))} className="h-8 bg-transparent border-border font-mono text-sm" />
                      </div>
                    </div>
                  </Field>

                  <Field label="Exits">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
                      <div>
                        <p className="text-sm text-foreground">Add my own stop-loss and take-profit</p>
                        <p className="text-xs text-muted-foreground">Off: positions close when the pilot sells. On: your limits can close them earlier.</p>
                      </div>
                      <Switch checked={ownExits} onCheckedChange={setOwnExits} />
                    </div>
                    {ownExits && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-background border border-border rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Stop loss (%)</p>
                          <Input type="number" min={1} max={90} value={risk.stopLossPct} onChange={e => setRisk(r => ({ ...r, stopLossPct: Number(e.target.value) }))} className="h-8 bg-transparent border-border font-mono text-sm" />
                        </div>
                        <div className="bg-background border border-border rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Take profit (%)</p>
                          <Input type="number" min={1} max={300} value={risk.takeProfitPct} onChange={e => setRisk(r => ({ ...r, takeProfitPct: Number(e.target.value) }))} className="h-8 bg-transparent border-border font-mono text-sm" />
                        </div>
                      </div>
                    )}
                  </Field>
                </>
              ) : (
                <>
                  <SuggestedDuration fund={fund} algorithm={algorithm} categories={categories} value={duration} onChange={setDuration} useCustom={useCustomDuration} setUseCustom={setUseCustomDuration} />
                  <RiskControls value={risk} onChange={setRisk} />
                  <button type="button" onClick={() => setShowAdvanced(v => !v)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <ChevronRight className={cn('w-3 h-3 transition-transform', showAdvanced && 'rotate-90')} /> Advanced: Kelly fraction and order type
                  </button>
                  {showAdvanced && (
                    <>
                      <Field
                        label="Kelly fraction"
                        hint={kellyFraction <= 0.25 ? 'Recommended: lowest variance, about 75% of max growth' : kellyFraction <= 0.5 ? 'Moderate risk: higher growth, more drawdown' : 'Aggressive: significant drawdown risk'}
                      >
                        <div className="grid grid-cols-4 gap-2">
                          {KELLY_OPTIONS.map(({ label, value }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setKellyFraction(value)}
                              className={cn('pressable px-2 py-2 rounded-lg text-xs font-mono border', kellyFraction === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground')}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Order type" hint="Stored for live execution. Paper fills are taker fills (buy at ask, sell at bid), except market making which joins the bid.">
                        <div className="grid grid-cols-4 gap-2">
                          {ORDER_TYPES.map(({ value, desc }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setOrderType(value)}
                              title={desc}
                              className={cn('pressable px-2 py-2 rounded-lg text-xs font-mono border', orderType === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:text-foreground')}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </Field>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center gap-2">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)} className="h-11 border-border">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button type="button" onClick={next} className={cn('ml-auto h-11 px-6 font-semibold text-sm rounded-xl', accent === 'violet' ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-primary hover:bg-primary/90 text-primary-foreground')}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleLaunch}
              disabled={createMutation.isPending}
              className={cn('ml-auto h-11 px-6 font-semibold text-sm rounded-xl', accent === 'violet' ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-primary hover:bg-primary/90 text-primary-foreground')}
            >
              {createMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isPaper ? <FlaskConical className="w-4 h-4 mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                  {isCopy ? `Start copying — ${formatUsd(fund, { compact: true })}` : `Launch — ${formatUsd(fund, { compact: true })}`}
                  {isPaper ? ' (paper)' : ''}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
