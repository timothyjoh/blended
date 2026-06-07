import { c as createComponent } from './astro-component_CX9TJ6cb.mjs';
import 'piccolore';
import { d as renderComponent, r as renderTemplate, m as maybeRenderHead } from './entrypoint_OVoc7678.mjs';
import { $ as $$Layout } from './Layout_DOhH8xvY.mjs';

const $$Todo = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Todo;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "data-astro-cid-ktctifap": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div id="container" data-astro-cid-ktctifap> <h1 class="" data-astro-cid-ktctifap>InstantDB Todos Demo</h1> ${renderComponent($$result2, "TodoApp", null, { "client:only": true, "client:component-hydration": "only", "data-astro-cid-ktctifap": true, "client:component-path": "/mnt/c/Users/butters/wrk/blended/src/components/TodoApp", "client:component-export": "default" })} </div> ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/todo.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/todo.astro";
const $$url = "/todo";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Todo,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
