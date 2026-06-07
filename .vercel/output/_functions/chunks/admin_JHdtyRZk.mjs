import { c as createComponent } from './astro-component_RcTtfYal.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_rCWNP7kK.mjs';
import { $ as $$Layout } from './Layout_BXOdMuNB.mjs';

const $$Admin = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Admin — Blended" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mx-auto mt-12 w-full max-w-4xl px-4"> ${renderComponent($$result2, "AdminRouteGuard", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/AdminRouteGuard", "client:component-export": "default" }, { "default": ($$result3) => renderTemplate` <h1 data-testid="admin-root" class="text-2xl font-semibold">Admin</h1> <p class="mt-2 text-sm text-muted-foreground">
Live, system-wide session console — read-only internal observability.
</p> ${renderComponent($$result3, "AdminSessionList", null, { "client:only": "react", "client:component-hydration": "only", "client:component-path": "@/components/AdminSessionList", "client:component-export": "default" })} ` })} </div> ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/admin.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/admin.astro";
const $$url = "/admin";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Admin,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
