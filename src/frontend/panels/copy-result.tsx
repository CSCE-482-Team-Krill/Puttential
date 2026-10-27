'use client';
import { useState } from 'react';
export function CopyResult({ compose }: { compose: () => Promise<string> | string }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="copy-result">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const value = await compose();
            setText(value);
            try {
              await navigator.clipboard.writeText(value);
              setStatus('Result copied.');
            } catch {
              setStatus('Copy unavailable. Select and copy the text below.');
            }
          } catch {
            setStatus('Result unavailable. Retry to refresh its status.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Preparing result…' : 'Copy result'}
      </button>
      <p role="status">{status}</p>
      {text && (
        <label className="copy-fallback">
          Result text
          <textarea readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}
