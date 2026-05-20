/**
 * Shared logger for content scripts. Prefixes all messages for easy filtering.
 */
if (!globalThis.VietnamVisaLog) {
  globalThis.VietnamVisaLog = {
    prefix: '[Vietnam e-Visa]',

    debug(...args) {
      console.debug(this.prefix, ...args);
    },

    info(...args) {
      console.info(this.prefix, ...args);
    },

    warn(...args) {
      console.warn(this.prefix, ...args);
    },

    error(...args) {
      console.error(this.prefix, ...args);
    },

    step(name, detail) {
      this.debug(`step: ${name}`, detail ?? '');
    },

    stepError(name, err) {
      this.error(`step failed: ${name}`, err?.message ?? err, err?.stack ?? '');
    },
  };
}
