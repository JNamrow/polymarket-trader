/**
 * The app's data client.
 *
 * Three backends share one interface (entities, auth, integrations, functions):
 *   • Base44 — the owner's full app (signed in).
 *   • Shared Supabase sandbox — the public demo when VITE_SUPABASE_URL and
 *     VITE_SUPABASE_ANON_KEY are set (see sandboxClient.js).
 *   • Browser-local sandbox — the public demo without Supabase (localClient.js).
 *
 * A build with VITE_APP_MODE=demo never talks to Base44 at all. Otherwise
 * AuthContext decides at startup: a signed-in owner gets Base44, anyone else
 * gets demo mode.
 */
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createLocalClient } from './localClient';
import { createSandboxClient } from './sandboxClient';

const env = import.meta.env;
export const DEMO_ONLY = env.VITE_APP_MODE === 'demo';
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

let demo = false;
let shared = false;

function createSandbox() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    shared = true;
    return createSandboxClient({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY });
  }
  return createLocalClient();
}

export const remoteClient = DEMO_ONLY
  ? null
  : createClient({
      appId: appParams.appId,
      token: appParams.token,
      functionsVersion: appParams.functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl: appParams.appBaseUrl,
    });

let active = remoteClient;
if (DEMO_ONLY) {
  demo = true;
  active = createSandbox();
}

export function enableDemoMode() {
  if (demo) return;
  demo = true;
  active = createSandbox();
}

export const isDemoMode = () => demo;

/** True when the demo data lives in the shared Supabase sandbox (server ticks, scheduled resets). */
export const isSharedSandbox = () => shared;

/** The owner's sign-in page. Nothing in the demo links to it, and demo-only builds have none. */
export function signIn() {
  if (DEMO_ONLY) return;
  window.location.assign('/login');
}

export const base44 = new Proxy(
  {},
  {
    get: (_target, prop) => active[prop],
  }
);
