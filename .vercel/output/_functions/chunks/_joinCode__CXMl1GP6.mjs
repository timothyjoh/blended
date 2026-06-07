import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$Layout } from './Layout_eG-eA1Dn.mjs';

const $$joinCode = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$joinCode;
  const { joinCode = "" } = Astro2.params;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Join session — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-2xl px-4"> ${renderComponent($$result2, "RouteGuard", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/RouteGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` ${renderComponent($$result3, "JoinSession", null, { "client:only": "react", "joinCode": joinCode, "client:component-hydration": "only", "client:component-path": "@/components/JoinSession", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/join/[joinCode].astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/join/[joinCode].astro";
const $$url = "/join/[joinCode]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$joinCode,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
