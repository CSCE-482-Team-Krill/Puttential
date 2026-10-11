import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Puttential · Level editor',
  description: 'Create and playtest Puttential courses locally.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
