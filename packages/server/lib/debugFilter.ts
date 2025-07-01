/**
 * debugFilter.ts
 *
 * In production we don't want the ad-hoc `console.log("DEBUG: …")` statements
 * that slipped into various helper files to overwhelm the logs.  We can't wrap
 * every statement individually right now, so instead we monkey-patch
 * `console.log` early in the process and drop any call whose first argument is
 * a string beginning with the literal `DEBUG:` – unless the application was
 * started with LOG_LEVEL=debug.
 *
 * This file should be imported **once**, near the very top of the primary
 * entry points (`server.ts`, `jobs/noteGenerator.ts`, etc.).  The patch is
 * completely transparent to the rest of the codebase.
 */

// Only patch when we're NOT in verbose / debug mode
if (process.env.LOG_LEVEL !== 'debug') {
  const originalLog = console.log.bind(console);

  console.log = (...args: unknown[]): void => {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('DEBUG:')) {
      // Drop the message – it's just noisy debug output.
      return;
    }

    // Forward everything else to the original console.log
    originalLog(...args as []);
  };
} 