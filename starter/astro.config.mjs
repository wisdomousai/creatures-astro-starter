// @ts-check
import creatures from '@wisdomousai/astro-creatures';
import { defineConfig } from 'astro/config';

// SITE and BASE come from the environment when it's built somewhere other than the root of
// a domain (the GitHub Pages workflow sets both); set `site` to your own address here.
export default defineConfig({
  site: process.env.SITE ?? 'https://example.com',
  base: process.env.BASE ?? '/',
  integrations: [
    creatures({
      // 'clean': the site as it is, with the crew on the window's frame.
      // 'room': the same pages inside a little room, on a monitor.
      shell: process.env.CREATURES_SHELL === 'room' ? 'room' : 'clean',
      title: 'Lorem Ipsum',
      description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
      author: 'Lorem Ipsum',
      email: 'hello@example.com',
      links: { github: 'https://github.com' },
      // Who comes by: `npx @wisdomousai/creatures list` says who there is.
      crew: {
        roster: ['bolt', 'dog', 'cat', 'corgi', 'hedgehog', 'owl'],
        first: 'bolt',
      },
    }),
  ],
});
