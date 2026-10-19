import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Software Development Breakdown';
export const docsRoute = '/';
export const docsContentRoute = '/llms.mdx';
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const gitConfig = {
  user: 'ChiHaoLu',
  repo: 'Software-Development-Breakdown',
  branch: 'main',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: basePath + getContentUrl(segments, page.locale) };
}
