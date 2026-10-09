---
name: creatures-setup
description: Turns this Astro starter (a lorem-ipsum blog/projects/about/contact site shown by @wisdomousai/astro-creatures, either 'clean' with toy robots walking on the window frame or 'room', played in a 3D room with the pages on a monitor) into its owner's own site. Replaces the lorem ipsum with the owner's words, picks the shell and the crew, sets the room's stations, and gets it online. Use when someone has just made a site from this starter, or asks to set it up, switch shells, change the robots or rooms, or deploy it.
---

# Set up the creatures starter

The starter is content and a config. The pages, layouts, styles and the room come from the
`@wisdomousai/astro-creatures` integration in `astro.config.mjs`, so the job is to fill in
the owner's words and settings. Leave the pages to the package: don't copy them into
`src/pages/`, or the site stops getting the package's fixes.

## 1. Their words, never yours

Ask the owner for each piece of text. Never write copy for them: no bio, no taglines, no
project blurbs, no "passionate about". If they don't have something yet, leave the lorem
ipsum in place and list what's still missing at the end.

- `astro.config.mjs`, in `creatures({...})`: `title`, `description`, `author`, `email`,
  `links`, and `nav` (labels and order of the header's links).
- `src/content/pages/`: `about.md` and `contact.md` (`title`, `description` for search
  results, and the body). The email address is added under the contact page by itself.
- `src/content/blog/`: delete the lorem posts and add theirs. `_template.md` shows the
  fields. Files starting with `_` and anything with `draft: true` are never published.
- `src/content/projects/`: the same. A project with a body gets its own page; one with only
  a `url` is a card linking out.
- `public/og.png` (1200×630) and `public/favicon.svg`: ask for theirs, or leave them.

Then `npm run check && npm run build`, which catches a missing frontmatter field before it's
online.

## 2. The shell

`shell: 'clean'` or `'room'`. Show the owner both (the README links the demos). The starter
reads `CREATURES_SHELL` from the environment so its demo can show both; once they've chosen,
write the shell in plainly.

- **clean**: light, a normal reading site. The robots live on the window's frame.
- **room**: the pages on a monitor in a painted room per section, a tuner for navigation, a
  lobby on the front page, and Bolt holding a phone on narrow screens. The plain pages are
  still there at every address: search engines get them, and so does anyone who picks
  "Page" or adds `?serious`. A build is about 50 MB, most of it the robots.

## 3. The crew

`npx @wisdomousai/creatures list` shows everyone in the box. Show the owner a few and let
them choose, then set `crew` in the options:

- `roster`: their keys. An empty list turns the robots off.
- `first`: who comes soon after the page loads.
- `max`: how many at once (2 or 3 keeps a reading page calm). `every`: seconds between
  arrivals, `[from, to]`.
- `respectReducedMotion` (clean only): leave it `true` unless the owner insists.
- `models`: leave it. The clean shell loads them from jsDelivr, pinned to the installed
  version. The room serves them from the site itself, because it paints the rooms' pictures
  on a canvas and a browser won't read back a CDN's picture. For the clean shell from the site
  instead: `npx @wisdomousai/creatures add <keys> --to public/creatures` and
  `models: '/creatures/'`, again whenever the roster changes.

In the room keep `bolt` (he holds the phone) and the lobby's concierges.

## 4. The room's stations (room only)

The defaults are Home (the lobby), Blog in the jungle, Projects in the lab, About in the
office, Contact in the plain white box. To change them, pass `stations`, in tuner order:

```js
{ key: 'blog', label: 'Blog', href: '/blog', room: 'jungle', dress: 'creatures/birds' },
```

- `room`: `jungle`, `office`, `lab`, or `null` for the plain white box. Ask the
  owner which suits which section.
- `dress`: the furniture and hangings it brings (`home`, `work`, `about`, `contact`,
  `creatures/birds`).
- Home (`key: 'home'`, `href: '/'`) stays first; it's the lobby.

`lobby` says who holds which sign (`to` is a station's key, or `'clean'` for the plain
site) and where they stand, as fractions of the room's width (`at` on a wide screen,
`narrow` on a phone). Only robots that can hold a sign can be concierges: those with
hands (`bolt`, `gardener`, …), the squirrel and the owl. `labels` names the two faces
where you can switch between them. Try changes with `npm run dev` at 1440px and 390px wide.

## 5. Online

Set `site` in `astro.config.mjs` to their address. `npm run build` gives a static `dist/`.

- **Cloudflare Pages / Netlify / Vercel**: build command `npm run build`, output `dist`.
- **GitHub Pages at a repo path**: build with `BASE=/<repo>/` and
  `SITE=https://<user>.github.io` (`actions/upload-pages-artifact` and
  `actions/deploy-pages`).

Check with `npm run preview`. Clean: the robots appear after a few seconds on the frame's
bottom line. Room: the lobby's signs lead to each station, each room is painted, cards open
and close, the browser's back button walks back, `?serious` shows the plain pages and `?play`
the room, and below 720px Bolt holds the phone.

## 6. A robot of their own

If they'd like a new creature, `npx @wisdomousai/creatures skill` installs the
`make-a-creature` skill.

## Finally

Tell the owner what you changed, and list every place that still has lorem ipsum or
example.com in it (`grep -rn "Lorem\|lorem\|example.com" src public astro.config.mjs`).
