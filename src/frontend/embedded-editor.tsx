'use client';

import { Editor } from '../editor/editor';
import { createBrowserEditorPersistence } from '../editor/browser-persistence';
import type { MapPublisher } from '../editor/components/publish-map';
import { bootstrapGuest } from './guest-session';
import { communityApi } from './community-api';

const persistence = createBrowserEditorPersistence();
const publish: MapPublisher = async (document, placement, title, description, requestId) => {
  const player = await bootstrapGuest();
  const result = await communityApi.publish({
    document,
    placement,
    title,
    description,
    requestId,
    expectedGuestId: player.id,
  });
  return result.map;
};

export default function EmbeddedEditor({
  active,
  onExit,
}: {
  active: boolean;
  onExit: () => void;
}) {
  return <Editor persistence={persistence} active={active} onExit={onExit} publish={publish} />;
}
