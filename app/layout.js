import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata = {
  title: {
    default: 'FlowPilot AI: workflow automation for small teams',
    template: '%s · FlowPilot AI',
  },
  description:
    'Automate lead intake, qualification, routing and follow-up drafting with transparent, rule-based AI assistance. A zero-cost portfolio project.',
};

export const viewport = { themeColor: '#4f46e5' };

export default function RootLayout({ children }) {
  return (
    // Browser extensions (autofill, password managers) add attributes to <html> before
    // hydration; this ignores those attribute diffs on this element only, not its children.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
