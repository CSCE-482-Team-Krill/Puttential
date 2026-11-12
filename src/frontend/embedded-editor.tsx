'use client';

import { Editor } from '../editor/editor';
import { createBrowserEditorPersistence } from '../editor/browser-persistence';
import type { MapPublisher } from '../editor/components/publish-map';
import { bootstrapGuest } from './guest-session';
import { communityApi, CommunityApiError } from './community-api';

const persistence = createBrowserEditorPersistence();
const publish: MapPublisher = {
  getGuestId: async () => (await bootstrapGuest()).id,
  async publish(submission) {
    try {
      return (await communityApi.publish(submission)).map;
    } catch (error) {
      if (
        error instanceof CommunityApiError &&
        (error.status === 401 || error.code === 'GUEST_CHANGED')
      )
        throw new Error(
          'The guest session used for this publication has expired or changed. Your previous submission may already be published. Restore the original session to retry, or choose Edit publication to start a new submission.',
        );
      throw error;
    }
  },
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
