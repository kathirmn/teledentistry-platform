import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

let cachedServers: any[] | null = null;
let cacheExpiry = 0;

export async function GET() {
  const ident = process.env.XIRSYS_IDENT;
  const secret = process.env.XIRSYS_SECRET;
  const channel = process.env.XIRSYS_CHANNEL;
  const gateway = process.env.XIRSYS_GATEWAY || 'https://global.xirsys.net';

  if (!ident || !secret || !channel) {
    return NextResponse.json({ iceServers: DEFAULT_ICE_SERVERS });
  }

  const now = Date.now();
  if (cachedServers && now < cacheExpiry) {
    return NextResponse.json({ iceServers: cachedServers });
  }

  try {
    const auth = Buffer.from(`${ident}:${secret}`).toString('base64');
    const res = await fetch(`${gateway}/_turn/${channel}?webrtc=1`, {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await res.json();
    if (data.s === 'ok' && data.v && Array.isArray(data.v.iceServers)) {
      cachedServers = data.v.iceServers;
      cacheExpiry = now + 10 * 60 * 1000;
      return NextResponse.json({ iceServers: cachedServers });
    }
  } catch (err) {
    console.warn('[Xirsys Route] Error fetching TURN credentials:', err);
  }

  return NextResponse.json({ iceServers: cachedServers || DEFAULT_ICE_SERVERS });
}
