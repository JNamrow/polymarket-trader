/**
 * The app's data client.
 *
 * Signed-in users talk to Base44 (entities, auth, integrations, functions).
 * Anyone else gets demo mode: the same interface backed by the browser's own
 * storage (see localClient.js). AuthContext decides which one at startup,
 * before any page renders, so every `base44.*` call below just works.
 */
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createLocalClient } from './localClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const remoteClient = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl,
});

let active = remoteClient;
let demo = false;

export function enableDemoMode() {
  if (demo) return;
  demo = true;
  active = createLocalClient();
}

export function isDemoMode() {
  return demo;
}

/** The owner's sign-in page (nothing in the demo links to it). */
export function signIn() {
  window.location.assign('/login');
}

export const base44 = new Proxy(
  {},
  {
    get: (_target, prop) => active[prop],
  }
);
