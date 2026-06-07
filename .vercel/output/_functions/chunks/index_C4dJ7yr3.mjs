import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$Layout } from './Layout_eG-eA1Dn.mjs';

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Dashboard — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-2xl px-4"> ${renderComponent($$result2, "RouteGuard", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/RouteGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <h1 data-testid="dashboard-root" class="text-2xl font-semibold">Dashboard</h1> ${renderComponent($$result3, "NewSession", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/NewSession", "client:component-export": "default" })} ${renderComponent($$result3, "SessionList", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/SessionList", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/dashboard/index.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/dashboard/index.astro";
const $$url = "/dashboard";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
