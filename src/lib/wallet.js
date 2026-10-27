/**
 * Read-only wallet helpers for Polygon (the chain Polymarket settles on).
 *
 * Nothing in this file signs a transaction or asks for a private key. It can:
 *   • ask a browser wallet (MetaMask, Rabby, …) for its public address
 *   • read USDC balances through public JSON-RPC nodes
 *
 * Polymarket keeps each user's trading cash in a *proxy wallet* (the address
 * shown on your Polymarket profile), not in the browser wallet itself. Save
 * that proxy address in Settings to see your real trading balance.
 */

export const POLYGON_CHAIN_ID = 137;
export const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // bridged USDC.e — what Polymarket uses
export const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDC_DECIMALS = 6;

const RPC_URLS = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://1rpc.io/matic',
  'https://polygon.drpc.org',
];

export function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || '').trim());
}

async function rpcCall(method, params) {
  let lastError;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || 'RPC error');
      return json.result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Polygon RPC endpoints failed');
}

/** ERC-20 balanceOf(address) → token units as a JS number. */
export async function getErc20Balance(token, address, decimals = USDC_DECIMALS) {
  const padded = address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const data = `0x70a08231${padded}`; // balanceOf(address)
  const hex = await rpcCall('eth_call', [{ to: token, data }, 'latest']);
  const raw = BigInt(hex || '0x0');
  return Number(raw) / 10 ** decimals;
}

/** Both USDC flavours on Polygon for one address. */
export async function getPolygonUsdc(address) {
  if (!isAddress(address)) throw new Error('Not a valid 0x address');
  const [usdce, usdc] = await Promise.all([
    getErc20Balance(USDC_E, address),
    getErc20Balance(USDC_NATIVE, address),
  ]);
  return { usdce, usdc, total: usdce + usdc };
}

export function hasBrowserWallet() {
  return typeof window !== 'undefined' && !!window.ethereum;
}

/** Ask the injected wallet for its active account. Read-only: no signing. */
export async function connectBrowserWallet() {
  if (!hasBrowserWallet()) throw new Error('No browser wallet found. Install MetaMask or a compatible wallet.');
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' }).catch(() => null);
  const address = accounts?.[0];
  if (!address) throw new Error('Wallet returned no account');
  return { address, chainId: chainIdHex ? parseInt(chainIdHex, 16) : null };
}

export function explorerUrl(address) {
  return `https://polygonscan.com/address/${address}`;
}
