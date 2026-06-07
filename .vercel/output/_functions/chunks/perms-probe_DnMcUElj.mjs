import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$Layout } from './Layout_eG-eA1Dn.mjs';

const $$PermsProbe = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Perms Probe — Dev Harness", "data-astro-cid-yzgai3b6": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div id="container" data-astro-cid-yzgai3b6> <h1 data-astro-cid-yzgai3b6>Permissions Probe — Dev Harness</h1> ${renderTemplate`<p data-testid="dev-disabled" data-astro-cid-yzgai3b6>Dev harness disabled in production.</p>` } </div> ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/dev/perms-probe.astro", void 0);
const $$file = "C:/Users/butters/wrk/blended/src/pages/dev/perms-probe.astro";
const $$url = "/dev/perms-probe";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$PermsProbe,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
