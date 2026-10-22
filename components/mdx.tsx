import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps } from 'react';
import { basePath } from '@/lib/shared';

// Next does not rewrite plain asset URLs, so prefix local paths with basePath
function withBasePath<T>(src: T) {
  return typeof src === 'string' && src.startsWith('/') ? basePath + src : src;
}

function Video({ src, poster, ...props }: ComponentProps<'video'>) {
  return <video src={withBasePath(src)} poster={withBasePath(poster)} {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Video,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
