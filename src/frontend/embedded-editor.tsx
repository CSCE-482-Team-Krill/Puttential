'use client';

import { Editor } from '../editor/editor';
import { createBrowserEditorPersistence } from '../editor/browser-persistence';

const persistence = createBrowserEditorPersistence();

export default function EmbeddedEditor({
  active,
  onExit,
}: {
  active: boolean;
  onExit: () => void;
}) {
  return <Editor persistence={persistence} active={active} onExit={onExit} />;
}
