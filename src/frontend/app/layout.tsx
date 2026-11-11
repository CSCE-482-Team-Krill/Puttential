import type { Metadata } from 'next';
import '../../editor/editor.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Puttential',
  description:
    'Puttential: a daily physics puzzle. Place force blocks and find your own way to the goal.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
