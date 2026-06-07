import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { c as renderComponent, r as renderTemplate } from './entrypoint_BV0A0AU2.mjs';
import { $ as $$MockupLayout } from './progress_CV5MPcCN.mjs';
import { c as TeacherMockup04 } from './TeacherAMockups_CZ1ivCZ-.mjs';

const $$04 = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "MockupLayout", $$MockupLayout, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "TeacherMockup04", TeacherMockup04, {})} ` })}`;
}, "C:/Users/butters/wrk/blended/src/pages/mockups/teacher/04.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/mockups/teacher/04.astro";
const $$url = "/mockups/teacher/04";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$04,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
