import { domainOf, getPosts, getProjects, hasCaseStudy, page, projectHref } from './lib';
import { formatDate, site } from './site';

/**
 * What the room (src/play) puts on its pages, served as /box.json: the site's own words for
 * its lists and cards. A page's body the room reads from the page itself (its article), so
 * the two are the same page at the same address.
 */
export interface BoxContent {
  title: string;
  email: string;
  blog: { title: string };
  posts: {
    slug: string;
    title: string;
    description: string;
    number: number;
    date: string;
    minutes: number;
  }[];
  projects: {
    title: string;
    items: {
      slug: string;
      title: string;
      summary: string;
      /** Its own page on the site, or the live project. */
      href: string;
      /** It has a page of its own (else its card links out). */
      page: boolean;
      where: string;
    }[];
  };
  about: { title: string; description: string };
  contact: { title: string };
}

export async function boxContent(): Promise<BoxContent> {
  const [posts, projects, about, contact] = await Promise.all([
    getPosts(),
    getProjects(),
    page('about'),
    page('contact'),
  ]);
  const named = (href: string, fallback: string) =>
    site.nav.find((n) => n.href === href)?.label ?? fallback;
  return {
    title: site.title,
    email: site.email,
    blog: { title: named('/blog', 'Blog') },
    posts: posts.map((p) => ({
      slug: p.id,
      title: p.data.title,
      description: p.data.description,
      number: p.number,
      date: formatDate(p.data.date),
      minutes: p.minutes,
    })),
    projects: {
      title: named('/projects', 'Projects'),
      items: projects.map((item) => {
        const href = projectHref(item);
        const page = hasCaseStudy(item);
        return {
          slug: item.id,
          title: item.data.title,
          summary: item.data.summary,
          href,
          page,
          where: page ? 'Read more' : domainOf(href),
        };
      }),
    },
    about: { title: about.data.title, description: about.data.description },
    contact: { title: contact.data.title },
  };
}
