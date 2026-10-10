// next/server for route tests: the real classes, plus an `after()` that queues its callback on
// globalThis.__afterJobs (the real one only works inside a Next request).
import real from '../../../node_modules/next/server.js';
export const NextResponse = real.NextResponse;
export const NextRequest = real.NextRequest;
export const after = (fn) => { (globalThis.__afterJobs ??= []).push(fn); };
