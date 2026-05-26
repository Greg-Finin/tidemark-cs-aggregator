/**
 * Fake demo auth.
 *
 * A deployed version gates access via Tailscale (the only path to the task is
 * through the tailnet, and the CSM identity is pulled from identity headers).
 * For this portfolio demo there is no SSO and no Tailscale — instead, /login
 * sets a cookie with the demo CSM's name, and middleware bounces any other
 * request without that cookie back to /login.
 */
export const AUTH_COOKIE = "tm.csm";

export const DEFAULT_DEMO_CSM =
  process.env.DEMO_CSM?.trim() || "Greg Finin";
