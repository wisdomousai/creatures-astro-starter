# @wisdomousai/astro-creatures

An Astro integration that turns a folder of Markdown into a small site (a blog, projects, an
about page, a contact page) with toy robots living in it. You bring the words; it brings
the pages, and one of two ways of showing them.

- **clean**: the site as it is, with a frame round the window. Every so often a robot turns
  up on the frame, walks along it, has a look at what you're reading and goes home.
  [See it](https://wisdomousai.github.io/creatures-astro-starter/clean/)
- **room**: the same pages, played inside a little room, on a monitor standing on the floor.
  A tuner across the top changes the station, each section has a painted room of its own,
  and the front page is a lobby where robots hold up signs for the sections.
  [See it](https://wisdomousai.github.io/creatures-astro-starter/room/)

The quickest way in is the starter, which is this with lorem ipsum in it:

```sh
npm create astro@latest -- --template wisdomousai/creatures-astro-starter/starter
```

## Adding it to a site

```sh
npm install @wisdomousai/astro-creatures
```

```js
// astro.config.mjs
import creatures from '@wisdomousai/astro-creatures';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',
  integrations: [creatures({ shell: 'clean', title: 'My site', email: 'me@example.com' })],
});
```

```ts
// src/content.config.ts
export { collections } from '@wisdomousai/astro-creatures/content';
```

Then the words, in `src/content/`:

|                                      |                                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/about.md`, `pages/contact.md` | `title`, `description` (for search results) and a body. Your email goes under the contact page by itself.                                                                              |
| `blog/*.md(x)`                       | `title`, `description`, `date`; optionally `updated`, `tags`, `cover`, `canonical`, `draft`.                                                                                           |
| `projects/*.md(x)`                   | `title`, `summary`; optionally `url`, `order`, `role`, `period`, `stack`, `cover`, `draft`. A project with a body gets a page of its own; one with only a `url` is a card linking out. |

It brings mdx, the sitemap and code highlighting with it, so leave those out of your
integrations (if you have them already, it uses yours). It makes the site's routes itself:
`/`, `/blog`, `/projects`, `/about`, `/contact`, `/rss.xml` and `/404`, plus `/box.json` in
the room. Put `og.png` and `favicon.svg` in `public/`.

## How the robots get onto the page

**In the clean shell** there's a fixed canvas over the whole window, and a layer of hit areas
above it so the robots can be poked without the canvas swallowing every click. The `Crew`
from [`@wisdomousai/creatures`](https://github.com/wisdomousai/creatures) draws them with
three.js and works out where the frame is from two CSS variables, `--frame-inset` and `--bot`,
so they stand exactly on the line the frame is drawn with. They load once the browser has
nothing better to do, so the page never waits for a robot.

**The room** is three layers. At the back is the box, drawn by the creatures package: its
walls, floor, ceiling and the painted room. In the middle are the pages, ordinary DOM, so
links, text selection and screen readers work as on any page. They're cut to the shape of
the monitor's glass. At the front is a three.js canvas with the robots and the monitor. The
monitor's glass is drawn into the depth buffer only, with no colour, so it hides whoever
walks behind it and leaves a hole the pages show through.

The room is played over the clean pages, at the same addresses. Search engines and
visitors without JavaScript get the plain page, and so does anyone who picks "Page" on the
tuner or adds `?serious`. The words on the monitor aren't copied anywhere: the lists come from
`/box.json`, made at build time from the collections, and each page's body is read from the
plain page at the same address.

None of what the robots do is a recorded animation. Each joint is on a spring, and each one
decides, frame by frame, where its joints would like to be. That's why a poke never plays
out the same way twice.

## The robots' files

In the clean shell their models come from jsDelivr, pinned to the version of
`@wisdomousai/creatures` installed. The room serves them from your own site at
`/creatures/`: it paints each room's picture onto a canvas, and a browser won't let a page
read back a canvas with another site's picture on it. The integration hands them out of
`node_modules` in dev and copies them into `dist/creatures/` when you build, about 47 MB.
The monitor's and phone's models come along at `/devices/`.

## Options

Every option has a default, so `creatures()` alone gives a working lorem-ipsum site.

| Option                                    | Default                                                                                              |                                                                                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell`                                   | `'clean'`                                                                                            | `'clean'` or `'room'`.                                                                                                                                                                                                                   |
| `title`, `description`, `author`, `email` | lorem ipsum                                                                                          | The site's name and line, for the header, the footer and search results.                                                                                                                                                                 |
| `links`                                   | `{}`                                                                                                 | `{ github: '…' }` adds a link in the footer.                                                                                                                                                                                             |
| `nav`                                     | Blog, Projects, About, Contact                                                                       | `{ label, href }[]`; `/contact` becomes the header's button.                                                                                                                                                                             |
| `crew.roster`                             | `['bolt', 'dog', 'cat', 'corgi', 'hedgehog', 'owl']`                                                 | Who comes by (`npx @wisdomousai/creatures list`); `[]` and nobody does.                                                                                                                                                                  |
| `crew.first`                              | `'bolt'`                                                                                             | Who comes soon after the page loads.                                                                                                                                                                                                     |
| `crew.max`                                | `2`                                                                                                  | How many at once.                                                                                                                                                                                                                        |
| `crew.every`                              | `[10, 25]`                                                                                           | Seconds between arrivals.                                                                                                                                                                                                                |
| `crew.respectReducedMotion`               | `true`                                                                                               | Clean shell: nobody comes for visitors who ask for less motion.                                                                                                                                                                          |
| `crew.models`                             | jsDelivr; `'/creatures/'` in the room                                                                | Where their files are.                                                                                                                                                                                                                   |
| `stations`                                | Home (lobby), Blog in the jungle, Projects in the lab, About in the office, Contact in the plain box | The room's tuner, in order: `{ key, label, href, room, dress }`. `room` is `'jungle'`, `'office'`, `'lab'` or `null`; `dress` is the furniture and hangings it brings (`'home'`, `'work'`, `'about'`, `'contact'`, `'creatures/birds'`). |
| `lobby`                                   | the owl, the squirrel, Bolt and the gardener                                                         | The room's front page: `{ name, to, at, narrow, hover?, on? }[]`. `to` is a station's key or `'clean'`; `at`/`narrow` are where along the floor, of the room's width (wide, phone). Only robots that can hold a sign can be concierges.  |
| `labels`                                  | `{ clean: 'Page', room: 'Room' }`                                                                    | What the two faces are called where you can switch between them.                                                                                                                                                                         |

MIT.
