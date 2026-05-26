/**
 * Cookie keys for per-user UI preferences.
 *
 * In a deployed version these are tied to the Tailscale-authed CSM identity
 * so each person lands on their own book of business by default. In the demo
 * they're just a plain cookie scoped to the browser session.
 */
export const CSM_COOKIE = "tm.csm.filter";
