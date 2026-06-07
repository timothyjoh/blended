import { c as createComponent } from './astro-component_CX9TJ6cb.mjs';
import 'piccolore';
import { d as renderComponent, r as renderTemplate, m as maybeRenderHead, a as addAttribute } from './entrypoint_OVoc7678.mjs';
import { $ as $$Layout } from './Layout_DOhH8xvY.mjs';
import { a as getCollection } from './_astro_content_D5pY3VKE.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const allPosts = await getCollection("blog", ({ data }) => {
    return !data.draft;
  });
  const blogPosts = allPosts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime()).map((post) => ({
    title: post.data.title,
    description: post.data.description,
    date: post.data.date.toISOString().split("T")[0],
    slug: post.id.replace(/\.(md|mdx)$/, ""),
    tags: post.data.tags,
    readTime: `${Math.ceil((post.body?.length ?? 0) / 1e3)} min read`,
    // Rough estimate
    author: post.data.author
  }));
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-base-200"> <!-- Header --> <div class="bg-base-300 border-b border-base-content"> <div class="max-w-4xl mx-auto px-6 py-12"> <h1 class="font-title text-4xl font-bold text-base-content mb-4">
Demonstration Blog
</h1> <p class="font-sans text-xl text-base-content leading-relaxed">
Thoughts on creativity, productivity, and the art of living well.
</p> </div> </div> <!-- Blog Posts --> <div class="max-w-4xl mx-auto px-6 py-12"> <div class="space-y-12"> ${blogPosts.map((post) => renderTemplate`<article class="bg-base-100 rounded-lg shadow-sm border border-base-content overflow-hidden hover:shadow-md transition-shadow duration-300"> <div class="p-8"> <div class="flex items-center gap-4 mb-4 text-sm text-base-content font-sans"> <time${addAttribute(post.date, "datetime")}> ${new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  })} </time> <span>•</span> <span>${post.readTime}</span> </div> <h2 class="font-serif text-2xl font-bold text-base-content mb-3 leading-tight"> <a${addAttribute(`/blog/${post.slug}`, "href")} class="hover:text-base-content transition-colors"> ${post.title} </a> </h2> <p class="font-serif text-base-content leading-relaxed mb-4"> ${post.description} </p> <div class="flex items-center justify-between"> <div class="flex flex-wrap gap-2"> ${post.tags.map((tag) => renderTemplate`<span class="bg-base-200 text-base-content px-3 py-1 rounded-full text-xs font-sans">
#${tag} </span>`)} </div> <a${addAttribute(`/blog/${post.slug}`, "href")} class="font-sans text-info hover:text-info/50 font-medium text-sm transition-colors">
Read more →
</a> </div> </div> </article>`)} </div>  ${blogPosts.length === 0 && renderTemplate`<div class="text-center py-12"> <p class="font-sans text-gray-500">No blog posts yet. Check back soon!</p> </div>`} </div> </div> ` })}`;
}, "/mnt/c/Users/butters/wrk/blended/src/pages/blog/index.astro", void 0);

const $$file = "/mnt/c/Users/butters/wrk/blended/src/pages/blog/index.astro";
const $$url = "/blog";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
