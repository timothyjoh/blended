import { c as createComponent } from './astro-component_RcTtfYal.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_rCWNP7kK.mjs';
import { $ as $$MockupLayout } from './progress_CjnhqaAD.mjs';
import { T as TeacherMockup01 } from './TeacherAMockups_BVF8wV0h.mjs';

const $$01 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup01", TeacherMockup01, {})} ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/01.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/01.astro";
const $$url = "/mockups/teacher/01";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$01,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
