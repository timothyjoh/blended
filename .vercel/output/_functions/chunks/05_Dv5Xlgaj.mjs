import { c as createComponent } from './astro-component_CX9TJ6cb.mjs';
import 'piccolore';
import { d as renderComponent, r as renderTemplate } from './entrypoint_OVoc7678.mjs';
import { $ as $$MockupLayout } from './progress_C8VRBEN2.mjs';
import { S as StudentChatMockup } from './StudentChatMockup_Q5AGRYEV.mjs';

const $$05 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "StudentChatMockup", StudentChatMockup, { "variant": "05" })} ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/student/05.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/student/05.astro";
const $$url = "/mockups/student/05";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$05,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
