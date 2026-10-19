import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const revalidate = false;

// the default `multilingual` tokenizer handles the Chinese content
export const { staticGET: GET } = createFromSource(source);
