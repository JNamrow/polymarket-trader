/**
 * Browser-only stand-in for the Base44 client, used in demo mode.
 *
 * No account, no server, nothing leaves the browser. Portfolios, trades and
 * settings live in localStorage under one key. The sandbox expires
 * DEMO_TTL_MS after it was created, so every visitor starts from a clean,
 * freshly seeded state within a couple of hours. Live Polymarket data is
 * still fetched directly from Polymarket's public APIs.
 *
 * Only the parts of the SDK the app uses are implemented.
 */
const KEY = 'polybot-demo-v1';
export const DEMO_TTL_MS = 2 * 60 * 60 * 1000;

const emptyState = () => ({
  createdAt: Date.now(),
  BotRun: [],
  Trade: [],
  WhaleSignal: [],
  user: {
    id: 'demo',
    email: 'demo@polybot.local',
    full_name: 'Demo visitor',
    role: 'user',
    default_fund: 250,
    default_algorithm: 'momentum',
    watched_wallets: [],
  },
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.createdAt && Date.now() - raw.createdAt < DEMO_TTL_MS) {
      return { ...emptyState(), ...raw, createdAt: raw.createdAt };
    }
  } catch {
    /* no storage or corrupt data: start clean */
  }
  return emptyState();
}

let state = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or quota: the session still works in memory */
  }
}

/** When the sandbox was created, when it resets, and whether it holds anything yet. */
export function demoInfo() {
  return { createdAt: state.createdAt, expiresAt: state.createdAt + DEMO_TTL_MS, isEmpty: state.BotRun.length === 0 };
}

/** Wipe the sandbox. The caller usually reloads the page afterwards. */
export function resetDemo() {
  state = emptyState();
  persist();
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const copy = value => JSON.parse(JSON.stringify(value));
const later = value => new Promise(resolve => setTimeout(() => resolve(value), 10));

function sortRows(rows, sort) {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (desc ? -1 : 1));
}

const matches = (row, query) => Object.entries(query || {}).every(([k, v]) => row[k] === v);

function entity(name) {
  const rows = () => state[name] || (state[name] = []);
  const api = {
    list: (sort, limit = 100, skip = 0) => later(copy(sortRows(rows(), sort).slice(skip, skip + limit))),
    filter: (query, sort, limit = 100, skip = 0) => later(copy(sortRows(rows().filter(r => matches(r, query)), sort).slice(skip, skip + limit))),
    get: id => later(copy(rows().find(r => r.id === id) || null)),
    create: data => {
      const now = new Date().toISOString();
      const row = { id: uid(), created_date: now, updated_date: now, created_by: state.user.email, ...copy(data) };
      rows().push(row);
      persist();
      return later(copy(row));
    },
    bulkCreate: async list => {
      const out = [];
      for (const data of list) out.push(await api.create(data));
      return out;
    },
    update: (id, data) => {
      const row = rows().find(r => r.id === id);
      if (!row) return Promise.reject(new Error(`${name} ${id} not found`));
      Object.assign(row, copy(data), { updated_date: new Date().toISOString() });
      persist();
      return later(copy(row));
    },
    delete: id => {
      state[name] = rows().filter(r => r.id !== id);
      persist();
      return later({ ok: true });
    },
  };
  return api;
}

const notInDemo = what => () => Promise.reject(new Error(`${what} is off in the demo. Sign in for the full version.`));

export function createLocalClient() {
  return {
    entities: { BotRun: entity('BotRun'), Trade: entity('Trade'), WhaleSignal: entity('WhaleSignal') },
    auth: {
      me: () => later(copy(state.user)),
      updateMe: data => {
        state.user = { ...state.user, ...copy(data) };
        persist();
        return later(copy(state.user));
      },
      isAuthenticated: () => later(true),
      logout: () => {},
      redirectToLogin: () => {},
    },
    integrations: { Core: { InvokeLLM: notInDemo('The AI brief') } },
    functions: { invoke: notInDemo('Server functions') },
  };
}
