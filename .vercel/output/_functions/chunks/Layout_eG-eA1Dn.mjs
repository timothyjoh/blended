import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { r as renderTemplate, d as renderSlot, c as renderComponent, f as renderHead, g as defineScriptVars, a as addAttribute } from './entrypoint_BV0A0AU2.mjs';
/* empty css                  */
import { T as ThemePickerDropdown, D as DEFAULT_THEME, a as THEME_STORAGE_KEY, g as getAvailableThemes } from './ThemePickerDropdown_DWnjUNUt.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Layout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Layout;
  const availableThemes = getAvailableThemes();
  const defaultTheme = DEFAULT_THEME;
  const storageKey = THEME_STORAGE_KEY;
  const { title = "Astro Basics" } = Astro2.props;
  return renderTemplate(_a || (_a = __template(['<html lang="en"', ' data-astro-cid-sckkx6r4> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="generator"', "><title>", "</title><script>(function(){", "\n			try {\n				const stored = window.localStorage.getItem(storageKey)\n				document.documentElement.dataset.theme = stored || defaultTheme\n			} catch (error) {\n				document.documentElement.dataset.theme = defaultTheme\n			}\n		})();<\/script>", '</head> <body data-astro-cid-sckkx6r4> <header class="flex justify-end p-4" data-astro-cid-sckkx6r4> ', " </header> <main data-astro-cid-sckkx6r4> ", " </main></body></html>"])), addAttribute(defaultTheme, "data-theme"), addAttribute(Astro2.generator, "content"), title, defineScriptVars({ storageKey, defaultTheme }), renderHead(), renderComponent($$result, "ThemePickerDropdown", ThemePickerDropdown, { "client:load": true, "themes": availableThemes, "defaultTheme": defaultTheme, "storageKey": storageKey, "client:component-hydration": "load", "client:component-path": "@/components/ThemePickerDropdown", "client:component-export": "default", "data-astro-cid-sckkx6r4": true }), renderSlot($$result, $$slots["default"]));
}, "C:/Users/butters/wrk/blended/src/layouts/Layout.astro", void 0);

export { $$Layout as $ };
