'use client';

import { useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

const ACCEPTED = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a';
const MAX_MB = 128;

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

function UploadContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      setErrorMsg(`File exceeds ${MAX_MB} MB limit.`);
      return;
    }
    setFile(f);
    setErrorMsg('');
    setState('idle');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !token || !rulesAccepted) return;

    setState('uploading');
    setProgress(0);

    try {
      // 1. Ask the server for a signed upload URL (validates token/deadline/type/size)
      const signRes = await fetch(`/api/upload?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          filename: file.name,
          size: file.size,
          type: file.type || 'audio/mpeg',
        }),
      });
      const signBody = await signRes.json().catch(() => ({}));
      if (!signRes.ok) {
        throw (signBody?.error?.message ?? signBody?.message ?? 'Could not start upload');
      }
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
        body: JSON.stringify({ action: 'confirm', filename }),
      });
      const confirmBody = await confirmRes.json().catch(() => ({}));
      if (!confirmRes.ok) {
        throw (confirmBody?.error?.message ?? confirmBody?.message ?? 'Upload confirmation failed');
      }

      setState('done');
    } catch (err) {
      setState('error');
      setErrorMsg(typeof err === 'string' ? err : 'Upload failed. Please try again.');
    }
  };

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

  return (
    <>
      <NavBar />
      <main id="main-content" style={{ maxWidth: 600, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold)', fontSize: '2rem', margin: '0 0 0.5rem' }}>
          Music Upload
        </h1>
        <p style={{ color: 'var(--text-body)', marginTop: 0, marginBottom: '2rem' }}>
          Upload your freestyle music. Accepted: MP3, WAV, M4A · Max {MAX_MB} MB
        </p>

        {/* Music selection rules */}
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
            <a href="mailto:dmvthrowers@gmail.com" style={{ color: 'var(--gold)' }}>dmvthrowers@gmail.com</a>{' '}
            for a judgment before the upload deadline.
          </p>
        </div>

        {state === 'done' ? (
          <div style={{ background: '#0d2a1a', border: '1px solid #2a7a4a', padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: '#7fff7f', fontSize: '1.1rem', margin: '0 0 0.5rem', fontWeight: 700 }}>
              ✓ Music uploaded successfully!
            </p>
            <p style={{ color: 'var(--text-body)', margin: 0, fontSize: '0.9rem' }}>
              You&rsquo;ll receive a confirmation email. You can re-upload before the deadline to replace your track.
            </p>
            <button
              onClick={() => { setFile(null); setState('idle'); setProgress(0); }}
              style={{ marginTop: '1.5rem', background: 'transparent', border: '1px solid var(--navy-border)', color: 'var(--text-body)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Upload a different file
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop music file here or click to browse"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                border: `2px dashed ${dragOver ? 'var(--gold)' : file ? '#2a7a4a' : 'var(--navy-border)'}`,
                background: dragOver ? 'rgba(201,168,76,0.05)' : 'var(--navy)',
                padding: '3rem 2rem',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '1.5rem',
                transition: 'border-color 0.15s, background 0.15s',
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
                <>
                  <p style={{ color: 'var(--text-body)', margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
                    Drop file here
                  </p>
                  <p style={{ color: 'var(--text-body)', opacity: 0.6, fontSize: '0.85rem', margin: 0 }}>
                    or click to browse
                  </p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              onChange={onInputChange}
              style={{ display: 'none' }}
            />

            {/* Rules acknowledgment */}
            <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '1.5rem' }}>
              <input
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                style={{ marginTop: '0.2rem', width: 16, height: 16, accentColor: 'var(--gold)', flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-body)', fontSize: '0.85rem' }}>
                My music selection follows the Music Selection Rules above and is appropriate for all
                audiences. I understand that inappropriate music results in disqualification and that
                the head judge&rsquo;s decision is final.
              </span>
            </label>

            {errorMsg && (
              <p role="alert" style={{ color: '#ff6b6b', margin: '0 0 1rem', fontSize: '0.9rem' }}>
                {errorMsg}
              </p>
            )}

            {state === 'uploading' && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ background: 'var(--navy)', height: 6, borderRadius: 0, overflow: 'hidden' }}>
                  <div
                    style={{ background: 'var(--gold)', height: '100%', width: `${progress}%`, transition: 'width 0.2s' }}
                  />
                </div>
                <p style={{ color: 'var(--text-body)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                  Uploading… {progress}%
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!file || !rulesAccepted || state === 'uploading'}
              style={{
                background: file && rulesAccepted && state !== 'uploading' ? 'var(--gold)' : 'var(--navy-border)',
                color: file && rulesAccepted && state !== 'uploading' ? 'var(--navy-deep)' : 'var(--text-body)',
                border: 'none',
                padding: '0.875rem 2rem',
                fontWeight: 800,
                fontSize: '0.9rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: file && rulesAccepted && state !== 'uploading' ? 'pointer' : 'not-allowed',
                width: '100%',
              }}
            >
              {state === 'uploading' ? 'Uploading…' : 'Submit Music'}
            </button>
          </form>
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
