/// <reference types="vite/client" />

declare module '*?script' {
  const src: string;
  export default src;
}

declare module '@/content/index.ts?script' {
  const src: string;
  export default src;
}

declare module '../content/index.ts?script' {
  const src: string;
  export default src;
}

interface VietnamEvisaAutofill {
  activate: () => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __VIETNAM_EVISA_AUTOFILL__: VietnamEvisaAutofill | undefined;
}

export {};
