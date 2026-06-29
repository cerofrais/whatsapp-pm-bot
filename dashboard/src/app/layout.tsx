import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp PM Bot',
  description: 'Client task tracker',
};

const NAV_LINKS = [
  { href: '/',        label: 'Tasks' },
  { href: '/clients', label: 'Clients' },
  { href: '/groups',  label: 'Groups' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
            <span className="text-sm font-semibold text-gray-800">WA PM Bot</span>
            <div className="flex gap-1">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl p-6 lg:p-8">{children}</main>
      </body>
    </html>
  );
}
