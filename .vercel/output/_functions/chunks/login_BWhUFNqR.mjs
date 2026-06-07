import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$Layout } from './Layout_eG-eA1Dn.mjs';

const $$Login = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Sign in — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-sm px-4"> ${renderComponent($$result2, "AuthGate", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/AuthGate", "client:component-export": "default" })} </div> ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/login.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/login.astro";
const $$url = "/login";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Login,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
