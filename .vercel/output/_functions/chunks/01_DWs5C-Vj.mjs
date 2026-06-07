import { c as createComponent } from './astro-component_RcTtfYal.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_rCWNP7kK.mjs';
import { $ as $$MockupLayout } from './progress_CjnhqaAD.mjs';
import { S as StudentChatMockup } from './StudentChatMockup_DRFCH2TA.mjs';

const $$01 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "StudentChatMockup", StudentChatMockup, { "variant": "01" })} ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/student/01.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/student/01.astro";
const $$url = "/mockups/student/01";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$01,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
