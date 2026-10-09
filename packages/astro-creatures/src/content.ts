// The site's content collections, for its src/content.config.ts:
//
//   export { collections } from '@wisdomousai/astro-creatures/content';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Files starting with _ are left out (the templates).
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/[^_]*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      // Set when the original lives elsewhere, so search engines credit that copy.
      canonical: z.url().optional(),
    }),
});

// One file per project. A project with a `url` and no body links straight to it; write a
// body and it gets a page of its own.
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/[^_]*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string(),
      url: z.url().optional(),
      order: z.number().default(100), // lower comes first
      role: z.string().optional(),
      period: z.string().optional(),
      stack: z.array(z.string()).default([]),
      cover: image().optional(),
      draft: z.boolean().default(false),
    }),
});

// The about and contact pages, by file name: a title, a description (for search results)
// and the page's body.
const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { blog, projects, pages };
