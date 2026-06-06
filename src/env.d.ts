/// <reference types="astro/client" />

declare module '@fontsource/*';
declare module '@fontsource-variable/*';
declare module '*.md?raw' {
  const content: string;
  export default content;
}
