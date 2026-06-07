import { c as createComponent } from './astro-component_RcTtfYal.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_rCWNP7kK.mjs';
import { $ as $$MockupLayout } from './progress_CjnhqaAD.mjs';
import { c as TeacherMockup04 } from './TeacherAMockups_BVF8wV0h.mjs';

const $$04 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup04", TeacherMockup04, {})} ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/04.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/mockups/teacher/04.astro";
const $$url = "/mockups/teacher/04";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$04,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
