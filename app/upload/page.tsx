'use client';

import { useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';

const ACCEPTED = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4';
const MAX_MB = 50;

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

function UploadContent() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
    if (!file || !token) return;

    setState('uploading');
    setProgress(0);

    try {
      // Raw file body; the API derives the enforced filename from the
      // registration and stores the file in R2.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/upload?token=${encodeURIComponent(token)}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-original-filename', encodeURIComponent(file.name));
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            try { reject(JSON.parse(xhr.responseText).error.message ?? 'Upload failed'); }
            catch { reject('Upload failed'); }
          }
        };
        xhr.onerror = () => reject('Network error');
        xhr.send(file);
      });

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
              disabled={!file || state === 'uploading'}
              style={{
                background: file && state !== 'uploading' ? 'var(--gold)' : 'var(--navy-border)',
                color: file && state !== 'uploading' ? 'var(--navy-deep)' : 'var(--text-body)',
                border: 'none',
                padding: '0.875rem 2rem',
                fontWeight: 800,
                fontSize: '0.9rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: file && state !== 'uploading' ? 'pointer' : 'not-allowed',
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
