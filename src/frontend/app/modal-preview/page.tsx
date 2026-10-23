import { notFound } from 'next/navigation';
import ModalPreviewClient from './modal-preview-client';

export default function ModalPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ModalPreviewClient />;
}
