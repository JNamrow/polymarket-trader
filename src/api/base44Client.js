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

/** Send the visitor to Base44's login, even from demo mode. */
export function signIn() {
  remoteClient.auth.redirectToLogin(window.location.href);
}

export const base44 = new Proxy(
  {},
  {
    get: (_target, prop) => active[prop],
  }
);
