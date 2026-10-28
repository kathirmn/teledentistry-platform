'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Smartphone, ShieldCheck, X, Lock, Globe } from 'lucide-react';

interface MobilePairingModalProps {
  roomId: string;
  localIp: string;
  httpPort?: number;
  httpsPort?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function MobilePairingModal({
  roomId,
  localIp,
  httpPort = 3000,
  httpsPort = 3443,
  isOpen,
  onClose,
}: MobilePairingModalProps) {
  const [protocolMode, setProtocolMode] = useState<'https' | 'http'>('https');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // If localIp is localhost, fallback to window.location.hostname
  const effectiveIp =
    localIp && localIp !== 'localhost'
      ? localIp
      : typeof window !== 'undefined'
      ? window.location.hostname
      : '192.168.0.6';

  const port = protocolMode === 'https' ? httpsPort : httpPort;
  const mobileUrl = `${protocolMode}://${effectiveIp}:${port}/room/${roomId}/mobile`;

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(mobileUrl, {
        width: 260,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code', err));
    }
  }, [isOpen, mobileUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Connect Mobile Companion Camera</h3>
            <p className="text-xs text-slate-400">Scan with iPhone or Android to stream over-the-shoulder view</p>
          </div>
        </div>

        {/* Protocol Selector Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-4 text-xs font-semibold">
          <button
            onClick={() => setProtocolMode('https')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition ${
              protocolMode === 'https'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>HTTPS (Port {httpsPort})</span>
            <span className="text-[9px] bg-cyan-900 text-cyan-200 px-1 rounded">Recommended</span>
          </button>
          <button
            onClick={() => setProtocolMode('http')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition ${
              protocolMode === 'http'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>HTTP (Port {httpPort})</span>
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center bg-white p-4 rounded-xl shadow-inner mb-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Mobile Pairing QR Code" className="w-56 h-56 select-none" />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-400">
              <QrCode className="w-12 h-12 animate-pulse" />
            </div>
          )}
          <span className="text-[11px] font-mono text-slate-600 mt-1">Point phone camera to scan</span>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-lg mb-4 text-xs text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Camera Access on Mobile Phone:</span>
          </div>
          {protocolMode === 'https' ? (
            <p className="text-[11px] text-slate-300 leading-relaxed">
              When your phone loads the page, tap <strong>&ldquo;Advanced&rdquo;</strong> &rarr;{' '}
              <strong>&ldquo;Proceed to {effectiveIp} (unsafe)&rdquo;</strong>, then grant camera permissions. Both
              your PC and phone will be in the same consultation room!
            </p>
          ) : (
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Plain HTTP access over Wi-Fi. (Note: iOS Safari and modern Android Chrome may require HTTPS to grant camera access).
            </p>
          )}
        </div>

        {/* Direct Link & Copy */}
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2">
          <input
            type="text"
            readOnly
            value={mobileUrl}
            className="flex-1 bg-transparent text-xs text-slate-300 font-mono truncate focus:outline-none px-1"
          />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-md transition shadow"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
