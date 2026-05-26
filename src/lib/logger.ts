export const VietnamVisaLog = {
  prefix: '[Vietnam e-Visa]',

  debug(...args: unknown[]) {
    console.debug(this.prefix, ...args);
  },

  info(...args: unknown[]) {
    console.info(this.prefix, ...args);
  },

  warn(...args: unknown[]) {
    console.warn(this.prefix, ...args);
  },

  error(...args: unknown[]) {
    console.error(this.prefix, ...args);
  },

  step(name: string, detail?: unknown) {
    this.debug(`step: ${name}`, detail ?? '');
  },

  stepError(name: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    this.error(`step failed: ${name}`, message, stack);
  },
};
