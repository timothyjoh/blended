import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$Layout } from './Layout_eG-eA1Dn.mjs';

const $$Admin = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Admin — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-4xl px-4"> ${renderComponent($$result2, "AdminRouteGuard", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/AdminRouteGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <h1 data-testid="admin-root" class="text-2xl font-semibold">Admin</h1> <p class="mt-2 text-sm text-muted-foreground">
Live, system-wide session console — read-only internal observability.
</p> ${renderComponent($$result3, "AdminSessionList", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/AdminSessionList", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/admin.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/admin.astro";
const $$url = "/admin";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Admin,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
