import { c as createComponent } from './astro-component_CX9TJ6cb.mjs';
import 'piccolore';
import { d as renderComponent, r as renderTemplate } from './entrypoint_OVoc7678.mjs';
import { $ as $$MockupLayout } from './progress_C8VRBEN2.mjs';
import { d as TeacherMockup05 } from './TeacherAMockups_DNud-7O1.mjs';

const $$05 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup05", TeacherMockup05, {})} ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/05.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/05.astro";
const $$url = "/mockups/teacher/05";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$05,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
