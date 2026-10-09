import site from './site.css?inline';

/*
 * The room's own styles, put in the page when it plays and not before. Imported plainly
 * (import './site.css'), Astro would find them through embed.ts and link them into every
 * plain page as well, where they'd take over its body, its type and its tokens.
 */
const sheet = document.createElement('style');
sheet.textContent = site;
document.head.append(sheet);
