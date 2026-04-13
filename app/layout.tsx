import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LexiTools Usage Monitor',
  description: 'Private dashboard for tracking Codex, Claude, and Ollama usage',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#0a0a0f] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
