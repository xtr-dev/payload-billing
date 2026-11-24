// Under Next.js, `process.env.NEXT_PUBLIC_*` is replaced with its value at `next build`, so an
// image built once and run under another URL would keep sending Mollie webhooks and test-checkout
// redirects to the build-time URL. That is why the runtime variables are checked first.

let warnedAboutBuildTimeUrl = false

/**
 * The server URL from the environment, or undefined when none is set. Checked in order:
 * PAYLOAD_SERVER_URL, PAYLOAD_PUBLIC_SERVER_URL, SERVER_URL, NEXT_PUBLIC_SERVER_URL.
 * Logs a warning (once per process) when only NEXT_PUBLIC_SERVER_URL is set, because under
 * Next.js that value may be frozen at build time.
 */
export function getServerUrlFromEnv(
  warn: (message: string) => void = (message) => console.warn(`[payload-billing] ${message}`),
): string | undefined {
  // Each variable is read with a literal `process.env.X` member expression: Next.js only
  // inlines (and bundlers only expose) variables that are written out this way.
  const runtimeUrl =
    process.env.PAYLOAD_SERVER_URL || process.env.PAYLOAD_PUBLIC_SERVER_URL || process.env.SERVER_URL
  if (runtimeUrl) {
    return runtimeUrl
  }

  const buildTimeUrl = process.env.NEXT_PUBLIC_SERVER_URL
  if (buildTimeUrl && !warnedAboutBuildTimeUrl) {
    warnedAboutBuildTimeUrl = true
    warn(
      // Only the variable name is logged: the URL could hold credentials or a private hostname.
      'Using NEXT_PUBLIC_SERVER_URL as the server URL. Next.js fixes NEXT_PUBLIC_* ' +
        'values at build time, so a build deployed under another URL keeps using this one. Set ' +
        'PAYLOAD_SERVER_URL (read at runtime), or pass webhookUrl / baseUrl in the provider config.',
    )
  }
  return buildTimeUrl || undefined
}

/**
 * Test hook: allow the NEXT_PUBLIC_SERVER_URL warning to be logged again.
 * @internal
 */
export function resetServerUrlWarning(): void {
  warnedAboutBuildTimeUrl = false
}
