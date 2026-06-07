import { c as createComponent } from './astro-component_RcTtfYal.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_rCWNP7kK.mjs';
import { $ as $$Layout } from './Layout_BXOdMuNB.mjs';

const $$EventSpine = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Event Spine — Dev Harness", "data-astro-cid-uqrpqbxh": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div id="container" data-astro-cid-uqrpqbxh> <h1 data-astro-cid-uqrpqbxh>Event Spine — Dev Harness</h1> ${renderTemplate`<p data-testid="dev-disabled" data-astro-cid-uqrpqbxh>Dev harness disabled in production.</p>` } </div> ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/dev/event-spine.astro", void 0);
const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/dev/event-spine.astro";
const $$url = "/dev/event-spine";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$EventSpine,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
