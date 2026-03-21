import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Settings as SettingsIcon, Key, DollarSign, Bell, Save, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [defaultFund, setDefaultFund] = useState(100);
  const [defaultAlgorithm, setDefaultAlgorithm] = useState('momentum');
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [saving, setSaving] = useState(false);

  const [walletBalance, setWalletBalance] = useState(1000);

  useEffect(() => {
    base44.auth.me().then(user => {
      if (user?.polymarket_api_key) setApiKey(user.polymarket_api_key);
      if (user?.default_fund) setDefaultFund(user.default_fund);
      if (user?.default_algorithm) setDefaultAlgorithm(user.default_algorithm);
      if (user?.notify_on_complete !== undefined) setNotifyOnComplete(user.notify_on_complete);
      if (user?.wallet_balance !== undefined) setWalletBalance(user.wallet_balance);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({
      polymarket_api_key: apiKey,
      default_fund: defaultFund,
      default_algorithm: defaultAlgorithm,
      notify_on_complete: notifyOnComplete,
      wallet_balance: walletBalance,
    });
    setSaving(false);
    toast.success('Settings saved');
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      {/* API Key */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Polymarket CLOB API Credentials</h2>
        </div>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key"
            className="bg-transparent border-border font-mono text-sm pr-10"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Your API key is stored securely and used to execute trades on your behalf.</p>
      </div>

      {/* Defaults */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Defaults</h2>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Total Wallet Balance (USDC)</label>
          <Input
            type="number"
            min={0}
            value={walletBalance}
            onChange={(e) => setWalletBalance(Number(e.target.value))}
            className="bg-transparent border-border font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">Your total USDC balance — used to calculate available funds on the dashboard.</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Default Fund Allocation (USDC)</label>
          <Input
            type="number"
            min={1}
            value={defaultFund}
            onChange={(e) => setDefaultFund(Number(e.target.value))}
            className="bg-transparent border-border font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Preferred Algorithm</label>
          <Select value={defaultAlgorithm} onValueChange={setDefaultAlgorithm}>
            <SelectTrigger className="bg-transparent border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="momentum">Momentum</SelectItem>
              <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
              <SelectItem value="arbitrage">Arbitrage</SelectItem>
              <SelectItem value="sentiment">Sentiment</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
              <Bell className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Bot Completion Notifications</p>
              <p className="text-xs text-muted-foreground">Get notified when a bot run finishes</p>
            </div>
          </div>
          <Switch checked={notifyOnComplete} onCheckedChange={setNotifyOnComplete} />
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-xl"
      >
        {saving ? (
          <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          <>
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </>
        )}
      </Button>
    </div>
  );
}