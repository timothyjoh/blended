import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$Layout } from './Layout_eG-eA1Dn.mjs';

const $$id = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$id;
  const { id = "" } = Astro2.params;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Session — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-2xl px-4"> ${renderComponent($$result2, "SessionRouteGuard", null, { "client:only": "react", "sessionId": id, "client:component-hydration": "only", "client:component-path": "@/components/SessionRouteGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "SessionLifecycle", null, { "client:only": "react", "sessionId": id, "client:component-hydration": "only", "client:component-path": "@/components/SessionLifecycle", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/dashboard/sessions/[id].astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/dashboard/sessions/[id].astro";
const $$url = "/dashboard/sessions/[id]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$id,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
