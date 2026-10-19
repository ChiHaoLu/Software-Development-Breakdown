import type { Metadata } from 'next';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { Provider } from '@/components/provider';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import { appName } from '@/lib/shared';
import './global.css';

export const metadata: Metadata = {
  title: {
    template: `%s | ${appName}`,
    default: appName,
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>
          <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
            {children}
          </DocsLayout>
        </Provider>
      </body>
    </html>
  );
}
