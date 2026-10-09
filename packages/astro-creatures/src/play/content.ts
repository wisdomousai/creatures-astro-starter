import type { BoxContent } from '../box-content';

/**
 * The site's words, when the room is played on it (embed.ts): its lists from /box.json, and
 * each page's body from the page itself, its article at the same address.
 */
export let content: BoxContent | null = null;

export async function loadContent() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/box.json`);
    if (r.ok && r.headers.get('content-type')?.includes('json')) content = await r.json();
  } catch {
    content = null;
  }
  return content;
}

/** The page the room was opened on: it's already here, in the document under it (as it came,
 * before the room names the tab its own way). */
const opened = trim(location.pathname);
const here = document.cloneNode(true) as Document;

function trim(path: string) {
  return path.replace(/\/+$/, '') || '/';
}

const pages = new Map<string, Promise<Document | null>>();

/** A page of the site, or null if it can't be read. Each is read once. */
function pageAt(path: string) {
  path = trim(path);
  let page = pages.get(path);
  if (!page) {
    page = read(path);
    pages.set(path, page);
  }
  return page;
}

async function read(path: string) {
  if (path === opened) return here;
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  } catch {
    return null;
  }
}

/** What's in `el`, made this document's. */
const inside = (el: Element | null | undefined) =>
  el ? [...el.childNodes].map((n) => document.importNode(n, true)) : null;

/** A page's body, as the site has it (its article's prose), or null if it can't be
 * read. */
export async function bodyOf(path: string): Promise<Node[] | null> {
  return inside((await pageAt(path))?.querySelector('article[data-pagefind-body] .prose'));
}

/** All of a page as the site shows it (its main: the header, the rail, the body). */
export async function mainOf(path: string): Promise<Node[] | null> {
  return inside((await pageAt(path))?.querySelector('main#main'));
}

/** A page's head as the site has it (to be read, not taken). */
export async function headOf(path: string): Promise<HTMLHeadElement | null> {
  return (await pageAt(path))?.head ?? null;
}
