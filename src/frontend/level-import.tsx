'use client';
import { decodeLevel, validateDocument } from '../game';
import type { Bounds, Level } from '../game';
import { useRef, useState } from 'react';

export function LevelImport({ onLoad }: { onLoad: (level: Level, bounds: Bounds) => void }) {
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="local-level-import">
      <button className="how-button" onClick={() => input.current?.click()}>
        Open local course
      </button>
      <input
        hidden
        ref={input}
        aria-label="Open local course"
        type="file"
        accept=".json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          try {
            if (file.size > 2_000_000) throw new Error('Course file is too large');
            const doc = validateDocument(JSON.parse(await file.text()));
            onLoad(decodeLevel(doc.level), doc.editor.arena.bounds);
            setError('');
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not open course');
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
