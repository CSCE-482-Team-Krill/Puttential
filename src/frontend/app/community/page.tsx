import type { Metadata } from 'next';
import Home from '../home-client';

export const metadata: Metadata = {
  title: 'Community | Puttential',
};

export default function CommunityPage() {
  return <Home initialView="community" />;
}
