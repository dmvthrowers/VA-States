'use client';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { slotTitle, type MusicSlot } from '@/lib/music';

const ACCEPTED = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a';
const MAX_MB = 128;

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

interface UploadStatus {
  first_name: string;
  unlocked: boolean;
  deadline_label: string;
  deadline_passed: boolean;
  slots: MusicSlot[];
}

const errorText = (body: unknown, fallback: string): string => {
  const b = body as { error?: { message?: string }; message?: string } | null;
  return b?.error?.message ?? b?.message ?? fallback;
};

/** One upload slot: the track for one division. */
function SlotCard({
  slot, token, rulesAccepted, locked, onDone,
}: {
  slot: MusicSlot;
  token: string;
  rulesAccepted: boolean;
  locked: boolean;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasOwnTrack = slot.status === 'uploaded';
  const title = slotTitle(slot);
  // What buttons and messages call this track: "1A", or "1A Prelims" when a division has several.
  const short = slot.labelled ? `${slot.division} ${slot.label}` : slot.division;

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      setErrorMsg(`File exceeds ${MAX_MB} MB limit.`);
      return;
    }
    setFile(f);
    setErrorMsg('');
    setState('idle');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !rulesAccepted || locked) return;

    // Never overwrite a track silently: replacing one the player already uploaded is explicit.
    let replace = false;
    if (hasOwnTrack) {
      replace = window.confirm(
        `Replace ${slot.track?.filename ?? 'your current track'} with ${file.name} for ${short}? The old track is removed.`,
      );
      if (!replace) return;
    }

    setState('uploading');
    setProgress(0);
    setErrorMsg('');

    try {
      // 1. Ask the server for a signed upload URL (validates token/deadline/division/type/size)
      const signRes = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          division: slot.division,
          slot: slot.slot,
          filename: file.name,
          size: file.size,
          type: file.type || 'audio/mpeg',
          replace,
        }),
      });
      const signBody = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw errorText(signBody, 'Could not start upload');
      const { signedUrl, filename } = signBody as { signedUrl: string; filename: string };

      // 2. PUT the file DIRECTLY to Supabase Storage (XHR for upload progress)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject('Upload to storage failed');
        };
        xhr.onerror = () => reject('Network error');
        xhr.send(file);
      });

      // 3. Confirm with the server (verifies storage, records + emails)
      const confirmRes = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', division: slot.division, slot: slot.slot, filename }),
      });
      const confirmBody = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) throw errorText(confirmBody, 'Upload confirmation failed');

      setState('done');
      setFile(null);
      onDone();
    } catch (err) {
      setState('error');
      setErrorMsg(typeof err === 'string' ? err : 'Upload failed. Please try again.');
    }
  };

  const busy = state === 'uploading';
  const canSubmit = !!file && rulesAccepted && !locked && !busy;

  return (
    <section
      aria-labelledby={`slot-${slot.division}-${slot.slot}`}
      style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', padding: '1.5rem', marginBottom: '1.5rem' }}
    >
      <h2 id={`slot-${slot.division}-${slot.slot}`} style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '1.3rem', margin: '0 0 0.5rem' }}>
        {title}
      </h2>

      {slot.status === 'uploaded' && slot.track && (
        <p style={{ color: '#7fff7f', fontSize: '0.9rem', margin: '0 0 1rem' }}>
          ✓ Uploaded: <span style={{ fontFamily: 'monospace' }}>{slot.track.filename}</span>
          {' · '}{new Date(slot.track.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      )}
      {slot.status === 'fallback' && (
        <p style={{ color: 'var(--gold)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
          No track from you yet, so a lo-fi track is set to play. Upload your own to replace it.
        </p>
      )}
      {slot.status === 'empty' && (
        <p style={{ color: '#ff6b6b', fontSize: '0.9rem', margin: '0 0 1rem' }}>Nothing uploaded yet for {short}.</p>
      )}

      <form onSubmit={handleSubmit}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Drop the ${short} music file here or click to browse`}
          onClick={() => { if (!locked) inputRef.current?.click(); }}
          onKeyDown={(e) => { if (!locked && (e.key === 'Enter' || e.key === ' ')) inputRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && !locked) handleFile(f); }}
          style={{
            border: `2px dashed ${dragOver ? 'var(--gold)' : file ? '#2a7a4a' : 'var(--navy-border)'}`,
            background: dragOver ? 'rgba(201,168,76,0.05)' : 'transparent',
            padding: '1.5rem 1rem',
            textAlign: 'center',
            cursor: locked ? 'not-allowed' : 'pointer',
            marginBottom: '1rem',
          }}
        >
          {file ? (
            <>
              <p style={{ color: '#7fff7f', fontWeight: 700, margin: '0 0 0.25rem' }}>✓ {file.name}</p>
              <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: 0 }}>
                {(file.size / (1024 * 1024)).toFixed(1)} MB · Click to choose a different file
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--text-body)', margin: 0 }}>
              {hasOwnTrack ? 'Drop a new file to replace your track, or click to browse' : 'Drop file here or click to browse'}
            </p>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          style={{ display: 'none' }}
        />

        {errorMsg && (
          <p role="alert" style={{ color: '#ff6b6b', margin: '0 0 1rem', fontSize: '0.9rem' }}>{errorMsg}</p>
        )}
        {state === 'done' && (
          <p role="status" style={{ color: '#7fff7f', margin: '0 0 1rem', fontSize: '0.9rem', fontWeight: 700 }}>
            ✓ {short} track saved. A confirmation email is on its way.
          </p>
        )}

        {busy && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ background: 'var(--navy-deep)', height: 6, overflow: 'hidden' }}>
              <div style={{ background: 'var(--gold)', height: '100%', width: `${progress}%` }} />
            </div>
            <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Uploading… {progress}%</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            background: canSubmit ? 'var(--gold)' : 'var(--navy-border)',
            color: canSubmit ? 'var(--navy-deep)' : 'var(--text-body)',
            border: 'none',
            padding: '0.75rem 1.5rem',
            fontWeight: 800,
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            width: '100%',
          }}
        >
          {busy ? 'Uploading…' : hasOwnTrack ? `Replace ${short} track` : `Submit ${short} track`}
        </button>
      </form>
    </section>
  );
}

function UploadContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [rulesAccepted, setRulesAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setLoadError(errorText(body, 'Could not load your upload slots.')); return; }
        setLoadError('');
        setStatus(body as UploadStatus);
      } catch {
        if (!cancelled) setLoadError('Network error. Reload the page to try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [token, reloadKey]);

  if (!token) {
    return (
      <>
        <NavBar />
        <main id="main-content" style={{ maxWidth: 600, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#ff6b6b' }}>Invalid or missing upload link. Check your confirmation email.</p>
        </main>
        <Footer />
      </>
    );
  }

  const locked = !!status && (!status.unlocked || status.deadline_passed);

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 600, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', margin: '0 0 0.5rem' }}>
          Music Upload
        </h1>
        <p style={{ color: 'var(--text-body)', marginTop: 0, marginBottom: '0.5rem' }}>
          Upload one track for each slot below (a division can ask for music per round, or for extras like battle music). Accepted: MP3, WAV, M4A · Max {MAX_MB} MB
        </p>
        {status && (
          <p style={{ color: 'var(--text-body)', marginTop: 0, marginBottom: '2rem', fontSize: '0.9rem' }}>
            Deadline: <strong style={{ color: '#fff' }}>{status.deadline_label}</strong>
          </p>
        )}

        <div style={{ background: 'var(--navy)', border: '1px solid var(--navy-border)', borderLeft: '4px solid var(--gold)', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.16em', color: 'var(--gold)', fontWeight: 800, marginBottom: '0.75rem' }}>
            MUSIC SELECTION RULES
          </div>
          <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Players are expected to select music for their routines and perform to it. You may choose
            any music you like as long as it is appropriate for all audiences.
            {' '}<strong style={{ color: '#fff' }}>Inappropriate music will result in disqualification.</strong>{' '}
            All decisions are made by the contest head judge and are final.
          </p>
          <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
            Examples of inappropriate music — this is <em>not</em> a comprehensive list:
          </p>
          <ul style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: '0 0 0.75rem', paddingLeft: '1.25rem', lineHeight: 1.6 }}>
            <li>Music containing inappropriate language (curse words, derogatory slurs)</li>
            <li>Music addressing inappropriate themes (violence, rape, self-harm, sexual content)</li>
            <li>Music glorifying — including but not limited to — violence, rape, suicide, killing, murder, genocide, or war</li>
            <li>Music that explicitly implies sexual activity (heavy breathing, ecstatic noises or screams)</li>
            <li>Music that discriminates against anyone — yo-yo is an inclusive sport, and discrimination of any kind is not tolerated at VSYC-26</li>
          </ul>
          <p style={{ color: 'var(--text-body)', fontSize: '0.85rem', margin: 0 }}>
            If you have any doubt about your selection, email{' '}
            <a href="mailto:contact@dmvthrowers.club" style={{ color: 'var(--gold)' }}>contact@dmvthrowers.club</a>{' '}
            for a judgment before the upload deadline.
          </p>
        </div>


        {loadError && <p role="alert" style={{ color: '#ff6b6b' }}>{loadError}</p>}
        {!status && !loadError && <p style={{ color: 'var(--text-muted)' }}>Loading your upload slots…</p>}

        {status && status.deadline_passed && (
          <p role="alert" style={{ color: '#ff6b6b' }}>The music deadline has passed ({status.deadline_label}). Email contact@dmvthrowers.club if you need help.</p>
        )}
        {status && !status.unlocked && (
          <p role="alert" style={{ color: '#ff6b6b' }}>Music upload unlocks after payment is received.</p>
        )}
        {status && status.slots.length === 0 && (
          <p style={{ color: 'var(--text-body)' }}>None of the divisions you entered use music.</p>
        )}

        {status && status.slots.length > 0 && (
          <>
            <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '1.5rem' }}>
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                style={{ marginTop: '0.2rem', width: 16, height: 16, accentColor: 'var(--gold)', flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-body)', fontSize: '0.85rem' }}>
                My music selections follow the Music Selection Rules above and are appropriate for all
                audiences. I understand that inappropriate music results in disqualification and that
                the head judge&rsquo;s decision is final.
              </span>
            </label>

            {status.slots.map((slot) => (
              <SlotCard
                key={`${slot.division}:${slot.slot}`}
                slot={slot}
                token={token}
                rulesAccepted={rulesAccepted}
                locked={locked}
                onDone={() => setReloadKey((k) => k + 1)}
              />
            ))}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Loading…</p>
      </div>
    }>
      <UploadContent />
    </Suspense>
  );
}
