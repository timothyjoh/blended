import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$MockupLayout } from './progress_CV5MPcCN.mjs';
import { T as TeacherMockup06 } from './teacher-b_BG87N4im.mjs';

const $$06 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup06", TeacherMockup06, {})} ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/mockups/teacher/06.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/mockups/teacher/06.astro";
const $$url = "/mockups/teacher/06";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$06,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
