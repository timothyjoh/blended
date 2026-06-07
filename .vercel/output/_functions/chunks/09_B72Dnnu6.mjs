import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$MockupLayout } from './progress_CV5MPcCN.mjs';
import { c as TeacherMockup09 } from './teacher-b_BG87N4im.mjs';

const $$09 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup09", TeacherMockup09, {})} ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/mockups/teacher/09.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/mockups/teacher/09.astro";
const $$url = "/mockups/teacher/09";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$09,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
