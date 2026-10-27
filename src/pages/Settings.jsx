import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings as SettingsIcon, Wallet, DollarSign, Save, ExternalLink, Plug, ShieldAlert, RefreshCw, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useUserProfile, useWalletFunds } from '@/lib/useUserProfile';
import { isAddress, hasBrowserWallet, connectBrowserWallet, getPolygonUsdc, explorerUrl, POLYGON_CHAIN_ID } from '@/lib/wallet';
import { profileUrl, shortAddress, formatUsd } from '@/api/polymarket';

function Section({ icon: Icon, title, children, accent }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('w-4 h-4', accent || 'text-muted-foreground')} />
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { user, update, isSaving } = useUserProfile();

  const [address, setAddress] = useState('');
  const [walletBalance, setWalletBalance] = useState('');
  const [defaultFund, setDefaultFund] = useState(100);
  const [defaultAlgorithm, setDefaultAlgorithm] = useState('momentum');
  const [browserWallet, setBrowserWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAddress(user.polymarket_address || '');
    setWalletBalance(user.wallet_balance != null ? String(user.wallet_balance) : '');
    if (user.default_fund) setDefaultFund(user.default_fund);
    if (user.default_algorithm) setDefaultAlgorithm(user.default_algorithm);
  }, [user]);

  const trimmed = address.trim();
  const addressValid = isAddress(trimmed);
  const funds = useWalletFunds(addressValid ? trimmed : null);

  const browserFunds = useQuery({
    queryKey: ['browser-wallet-usdc', browserWallet?.address],
    enabled: !!browserWallet?.address,
    queryFn: () => getPolygonUsdc(browserWallet.address),
    staleTime: 60_000,
  });

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await connectBrowserWallet();
      setBrowserWallet(result);
      await update({ browser_wallet: result.address });
      toast.success(`Connected ${shortAddress(result.address)}`);
    } catch (err) {
      toast.error(err?.message || 'Wallet connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleSave = async () => {
    if (trimmed && !addressValid) {
      toast.error('Polymarket address must be a 0x address (40 hex characters)');
      return;
    }
    try {
      await update({
        polymarket_address: trimmed,
        wallet_balance: walletBalance === '' ? null : Number(walletBalance),
        default_fund: Number(defaultFund) || 100,
        default_algorithm: defaultAlgorithm,
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save settings');
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      {/* Polymarket wallet */}
      <Section icon={Wallet} title="Polymarket wallet" accent="text-primary">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Profile (proxy) address</label>
          <Input
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="0x…"
            className={cn('bg-transparent border-border font-mono text-sm', trimmed && !addressValid && 'border-destructive/60')}
          />
          <p className="text-xs text-muted-foreground">
            Polymarket keeps your trading cash in a proxy wallet. Find the address on your Polymarket profile page (polymarket.com/profile/0x…). Read-only: no keys are stored.
          </p>
        </div>
        {addressValid && (
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs space-y-1.5">
            {funds.isLoading ? (
              <p className="text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" /> Reading balances on Polygon…
              </p>
            ) : funds.error ? (
              <p className="text-destructive">Could not read balance: {funds.error.message}</p>
            ) : funds.data ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">USDC cash (USDC.e + USDC)</span>
                  <span className="font-mono text-primary font-semibold">{formatUsd(funds.data.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Open positions value</span>
                  <span className="font-mono text-foreground">{funds.data.positionsValue != null ? formatUsd(funds.data.positionsValue) : 'rate-limited, retry later'}</span>
                </div>
                <div className="flex gap-3 pt-1">
                  <a href={profileUrl(trimmed)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Polymarket profile <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href={explorerUrl(trimmed)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
                    Polygonscan <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </>
            ) : null}
          </div>
        )}
        <div className="space-y-2 pt-1">
          <label className="text-xs text-muted-foreground">Manual balance fallback (USDC)</label>
          <Input
            type="number"
            min={0}
            value={walletBalance}
            onChange={e => setWalletBalance(e.target.value)}
            placeholder="Used only when no address is set"
            className="bg-transparent border-border font-mono text-sm"
          />
        </div>
      </Section>

      {/* Browser wallet */}
      <Section icon={Plug} title="Browser wallet (read-only)">
        {browserWallet || user?.browser_wallet ? (
          <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Address</span>
              <span className="font-mono text-foreground">{shortAddress(browserWallet?.address || user?.browser_wallet)}</span>
            </div>
            {browserWallet && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Network</span>
                <span className={cn('font-mono', browserWallet.chainId === POLYGON_CHAIN_ID ? 'text-primary' : 'text-yellow-400')}>
                  {browserWallet.chainId === POLYGON_CHAIN_ID ? 'Polygon' : `chain ${browserWallet.chainId ?? '?'} (switch to Polygon)`}
                </span>
              </div>
            )}
            {browserFunds.data && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">USDC on Polygon</span>
                <span className="font-mono text-foreground">{formatUsd(browserFunds.data.total)}</span>
              </div>
            )}
            <p className="text-muted-foreground pt-1">
              This is the key you sign with. Polymarket trades from a separate proxy wallet, so the balance that matters is the one above.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Connect MetaMask or another EIP-1193 wallet to read its address and Polygon USDC balance. No signing, no approvals.</p>
        )}
        <Button size="sm" variant="outline" onClick={connect} disabled={connecting || !hasBrowserWallet()} className="h-8 border-border">
          {connecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plug className="w-3.5 h-3.5 mr-1.5" />}
          {hasBrowserWallet() ? (browserWallet ? 'Reconnect' : 'Connect browser wallet') : 'No browser wallet detected'}
        </Button>
      </Section>

      {/* Execution status */}
      <Section icon={ShieldAlert} title="Live execution" accent="text-amber-400">
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 text-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Market data: live (Gamma, CLOB and Data APIs)
          </p>
          <p className="flex items-center gap-1.5 text-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" /> Paper trading: real prices, real order books, simulated fills
          </p>
          <p className="flex items-center gap-1.5 text-amber-300">
            <ShieldAlert className="w-3.5 h-3.5" /> Order placement: not connected
          </p>
          <p>
            Real orders need an EIP-712 signature from your wallet key and CLOB API credentials. That belongs in a backend signer with the credentials stored as Base44
            secrets, never in the browser. Until it exists, &quot;live&quot; bots use simulated fills and never move funds.
          </p>
        </div>
      </Section>

      {/* Defaults */}
      <Section icon={DollarSign} title="Defaults for new bots">
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Default fund allocation (USDC)</label>
          <Input type="number" min={1} value={defaultFund} onChange={e => setDefaultFund(Number(e.target.value))} className="bg-transparent border-border font-mono text-sm" />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Preferred algorithm</label>
          <Select value={defaultAlgorithm} onValueChange={setDefaultAlgorithm}>
            <SelectTrigger className="bg-transparent border-border text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="momentum">Momentum</SelectItem>
              <SelectItem value="mean_reversion">Mean Reversion</SelectItem>
              <SelectItem value="market_making">Market Making</SelectItem>
              <SelectItem value="arbitrage">Arbitrage</SelectItem>
              <SelectItem value="sentiment">Sentiment</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Button onClick={handleSave} disabled={isSaving} className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-xl">
        {isSaving ? (
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
