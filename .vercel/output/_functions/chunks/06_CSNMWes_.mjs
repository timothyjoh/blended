import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$MockupLayout } from './progress_CV5MPcCN.mjs';
import { S as StudentChatMockup } from './StudentChatMockup_B9WV4039.mjs';

const $$06 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "StudentChatMockup", StudentChatMockup, { "variant": "06" })} ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/mockups/student/06.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/mockups/student/06.astro";
const $$url = "/mockups/student/06";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$06,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
