/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_DEV_LOGIN_ENABLED?: string
}

declare module '@fontsource/*';
declare module '@fontsource-variable/*';
declare module '*.md?raw' {
  const content: string;
  export default content;
}
