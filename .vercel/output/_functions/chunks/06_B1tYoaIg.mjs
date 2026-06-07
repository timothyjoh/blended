import { c as createComponent } from './astro-component_CX9TJ6cb.mjs';
import 'piccolore';
import { d as renderComponent, r as renderTemplate } from './entrypoint_OVoc7678.mjs';
import { $ as $$MockupLayout } from './progress_C8VRBEN2.mjs';
import { T as TeacherMockup06 } from './teacher-b_x_bC0xr1.mjs';

const $$06 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup06", TeacherMockup06, {})} ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/06.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/06.astro";
const $$url = "/mockups/teacher/06";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$06,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
