import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { r as renderTemplate, d as renderSlot, c as renderComponent, e as Fragment, f as renderHead, g as defineScriptVars, a as addAttribute } from './entrypoint_BV0A0AU2.mjs';
import { g as getEntry, r as renderEntry } from './_astro_content_CUgEq7Qc.mjs';
import { r as renderScript } from './script_C4bdxVXR.mjs';
/* empty css                  */
import { T as ThemePickerDropdown, D as DEFAULT_THEME, a as THEME_STORAGE_KEY, g as getAvailableThemes } from './ThemePickerDropdown_DWnjUNUt.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$BlogLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$BlogLayout;
  const { title, description, date, tags, author = "Your Name" } = Astro2.props;
  const availableThemes = getAvailableThemes();
  const defaultTheme = DEFAULT_THEME;
  const storageKey = THEME_STORAGE_KEY;
  return renderTemplate(_a || (_a = __template(['<html lang="en"', '> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><meta name="generator"', "><title>", "</title>", "<script>(function(){", "\n      try {\n        const stored = window.localStorage.getItem(storageKey)\n        document.documentElement.dataset.theme = stored || defaultTheme\n      } catch (error) {\n        document.documentElement.dataset.theme = defaultTheme\n      }\n    })();<\/script>", '</head> <body class="bg-base-200"> <!-- Navigation --> <nav class="bg-base-100 border-b border-base-300 sticky top-0 z-10"> <div class="max-w-7xl mx-auto px-6 py-4"> <div class="flex justify-between items-center"> <a href="/blog" class="font-serif text-xl font-bold transition-colors">\nDemonstration Blog\n</a> <div class="flex items-center gap-4"> <div class="flex gap-6"> <a href="/" class="font-sans text-sm transition-colors">Home</a> <a href="/blog" class="font-sans text-sm transition-colors">Blog</a> </div> ', ' </div> </div> </div> </nav> <div class="max-w-7xl mx-auto px-6 py-8"> <div class="grid grid-cols-1 lg:grid-cols-12 gap-8"> <!-- Left Aside Area --> <aside class="lg:col-span-3 order-2 lg:order-1"> <div class="top-24 space-y-6"> <!-- Post Meta --> <div class="bg-base-100 rounded-lg p-4 shadow-sm border border-base-300"> <h3 class="font-title text-sm font-semibold mb-3">Post Details</h3> ', ' <div class="text-xs mb-2 font-sans"> <span class="font-medium">Author:</span><br> ', " </div> ", ' </div> <!-- Table of Contents Placeholder --> <div class="bg-base-100 rounded-lg p-4 shadow-sm border border-base-300"> <h3 class="font-title text-sm font-semibold mb-3">Contents</h3> <div id="toc" class="text-xs font-sans space-y-1"> <!-- TOC will be populated by JavaScript --> </div> </div> <!-- Reading Progress - Remove from sidebar --> <!-- <div class="bg-white rounded-lg p-4 shadow-sm border border-gray-200">\n              <h3 class="font-title text-sm font-semibold text-gray-900 mb-3">Reading Progress</h3>\n              <div class="w-full bg-gray-200 rounded-full h-2">\n                <div id="reading-progress" class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>\n              </div>\n            </div> --> </div> </aside> <!-- Main Content Area --> <main class="lg:col-span-6 lg:col-start-5 order-1 lg:order-2"> <article class="p-8"> <!-- Article Header --> <header class="mb-8 pb-6 border-b border-base-300"> <h1 class="font-title text-3xl lg:text-4xl font-bold mb-4 leading-tight"> ', " </h1> ", ' <div class="flex items-center gap-4 mt-4 text-sm font-sans"> <span>', "</span> ", ' </div> </header> <!-- Article Content --> <div class="prose prose-lg max-w-none"> ', ' </div> </article> </main> <!-- Right Area (empty for now, could be used for related posts, ads, etc.) --> <div class="lg:col-span-3 order-3 hidden lg:block"> <!-- Reserved for future use --> </div> </div> </div> <!-- Floating Reading Progress Footer --> <footer class="fixed bottom-0 left-0 right-0 bg-base-100/90 backdrop-blur-sm border-t border-base-300 px-6 py-3 z-20"> <div class="max-w-7xl mx-auto flex items-center justify-between"> <span class="text-sm font-sans">Reading Progress</span> <div class="flex-1 mx-4 bg-base-300 rounded-full h-2"> <div id="reading-progress" class="bg-primary h-2 rounded-full transition-all duration-300" style="width: 0%"></div> </div> <span class="text-sm font-sans" id="progress-text">0%</span> </div> </footer> <!-- Scripts --> ', " </body> </html>"])), addAttribute(defaultTheme, "data-theme"), addAttribute(Astro2.generator, "content"), title, description && renderTemplate`<meta name="description"${addAttribute(description, "content")}>`, defineScriptVars({ storageKey, defaultTheme }), renderHead(), renderComponent($$result, "ThemePickerDropdown", ThemePickerDropdown, { "client:load": true, "themes": availableThemes, "defaultTheme": defaultTheme, "storageKey": storageKey, "client:component-hydration": "load", "client:component-path": "@/components/ThemePickerDropdown", "client:component-export": "default" }), date && renderTemplate`<div class="text-xs mb-2 font-sans"> <span class="font-medium">Published:</span><br> ${new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  })} </div>`, author, tags && tags.length > 0 && renderTemplate`<div class="text-xs font-sans"> <span class="font-medium">Tags:</span><br> <div class="flex flex-wrap gap-1 mt-1"> ${tags.map((tag) => renderTemplate`<span class="bg-base-200 px-2 py-1 rounded text-xs">
#${tag} </span>`)} </div> </div>`, title, description && renderTemplate`<p class="font-sans text-lg leading-relaxed"> ${description} </p>`, author, date && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <span>•</span> <time${addAttribute(date, "datetime")}> ${new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  })} </time> ` })}`, renderSlot($$result, $$slots["default"]), renderScript($$result, "C:/Users/butters/wrk/blended/src/layouts/BlogLayout.astro?astro&type=script&index=0&lang.ts"));
}, "C:/Users/butters/wrk/blended/src/layouts/BlogLayout.astro", void 0);

const $$slug = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$slug;
  const { slug } = Astro2.params;
  if (!slug) {
    return new Response(null, { status: 404 });
  }
  const entry = await getEntry("blog", slug);
  if (!entry) {
    return new Response(null, { status: 404 });
  }
  const { Content } = await renderEntry(entry);
  return renderTemplate`${renderComponent($$result, "BlogLayout", $$BlogLayout, { "title": entry.data.title, "description": entry.data.description, "date": entry.data.date.toISOString(), "author": entry.data.author, "tags": entry.data.tags }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "Content", Content, {})} ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/blog/[slug].astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/blog/[slug].astro";
const $$url = "/blog/[slug]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$slug,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
