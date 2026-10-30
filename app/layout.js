import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import { themeInitScript } from '@/components/theme/init-script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata = {
  title: {
    default: 'FlowPilot AI: workflow automation for small teams',
    template: '%s · FlowPilot AI',
  },
  description:
    'Automate lead intake, qualification, routing and follow-up drafting with transparent, rule-based AI assistance. A zero-cost portfolio project.',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070a17' },
    { media: '(prefers-color-scheme: light)', color: '#f5f6fb' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // data-theme is set before paint by the inline script, and browser extensions may add
    // attributes too; this ignores attribute diffs on <html> only, not its children.
    <html lang="en" data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
