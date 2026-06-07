import { c as createComponent } from './astro-component_CX9TJ6cb.mjs';
import 'piccolore';
import { d as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_OVoc7678.mjs';
import { $ as $$Layout } from './Layout_DOhH8xvY.mjs';

const $$Login = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Sign in — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-sm px-4"> ${renderComponent($$result2, "AuthGate", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/AuthGate", "client:component-export": "default" })} </div> ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/login.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/login.astro";
const $$url = "/login";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Login,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
