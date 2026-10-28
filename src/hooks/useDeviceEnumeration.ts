'use client';

import { useState, useEffect, useCallback } from 'react';

export interface MediaDeviceInfoSummary {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface CameraStreamResult {
  stream: MediaStream;
  actualWidth: number;
  actualHeight: number;
  fallbackUsed: boolean;
  error?: string;
}

export function useDeviceEnumeration() {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfoSummary[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfoSummary[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('');
  const [selectedIntraoralId, setSelectedIntraoralId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [usbContentionWarning, setUsbContentionWarning] = useState<string | null>(null);

  // Enumerate all available hardware devices
  const refreshDevices = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vDevices: MediaDeviceInfoSummary[] = [];
      const aDevices: MediaDeviceInfoSummary[] = [];

      devices.forEach((d, idx) => {
        if (d.kind === 'videoinput') {
          vDevices.push({
            deviceId: d.deviceId,
            label: d.label || `Camera ${idx + 1}`,
            kind: d.kind,
          });
        } else if (d.kind === 'audioinput') {
          aDevices.push({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${idx + 1}`,
            kind: d.kind,
          });
        }
      });

      setVideoDevices(vDevices);
      setAudioDevices(aDevices);

      // Smart auto-assign device selections: distinguish built-in webcam from USB intraoral wand
      if (vDevices.length === 1) {
        // Exactly 1 camera available: assign to clinician webcam, leave intraoral empty awaiting USB wand
        setSelectedWebcamId((prev) => prev || vDevices[0].deviceId);
      } else if (vDevices.length > 1) {
        // 2 or more cameras: detect external intraoral wand vs clinician face webcam
        const intraKeywords = /intraoral|dental|wand|endoscope|mouth|uvc|usb\s*video|external/i;
        const webcamKeywords = /facetime|integrated|internal|built-in|front|webcam/i;

        const candidateIntra = vDevices.find((d) => intraKeywords.test(d.label));
        const candidateWebcam = vDevices.find((d) => webcamKeywords.test(d.label));

        if (candidateIntra && candidateWebcam) {
          setSelectedIntraoralId((prev) => prev || candidateIntra.deviceId);
          setSelectedWebcamId((prev) => prev || candidateWebcam.deviceId);
        } else {
          // Fallback: first camera as webcam, second as intraoral
          setSelectedWebcamId((prev) => prev || vDevices[0].deviceId);
          setSelectedIntraoralId((prev) => prev || vDevices[1].deviceId);
        }
      }
      if (aDevices.length > 0) {
        setSelectedAudioId((prev) => prev || aDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Failed to enumerate media devices:', err);
    }
  }, []);

  // Hotplug listener: Re-enumerate when USB cameras are plugged or unplugged
  useEffect(() => {
    refreshDevices();

    if (navigator.mediaDevices?.addEventListener) {
      const handler = () => {
        console.log('[Hardware] Media device change detected. Re-enumerating...');
        refreshDevices();
      };
      navigator.mediaDevices.addEventListener('devicechange', handler);
      return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
    }
  }, [refreshDevices]);

  /**
   * Acquire camera stream with an automatic fallback ladder to solve USB 2.0 Root Hub Contention:
   * Try 1080p -> fallback 720p @ 15fps -> fallback 480p @ 15fps with MJPEG preference
   */
  const acquireCameraWithFallback = useCallback(
    async (deviceId: string, isIntraoral = false): Promise<CameraStreamResult> => {
      setUsbContentionWarning(null);

      // Resolution ladder
      const constraintLadder: MediaTrackConstraints[] = isIntraoral
        ? [
            // Ladder 1: High definition for intraoral inspection
            {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 20 },
            },
            // Ladder 2: Safe 720p if 1080p saturated USB bus
            {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 15 },
            },
            // Ladder 3: 480p emergency fallback
            {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15 },
            },
          ]
        : [
            // Webcam ladder (optimized to save USB bandwidth for intraoral)
            {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 15 },
            },
            {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15 },
            },
          ];

      let lastError: unknown;

      for (let i = 0; i < constraintLadder.length; i++) {
        const constraints = constraintLadder[i];
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: constraints,
            audio: false,
          });

          const track = stream.getVideoTracks()[0];
          const settings = track.getSettings();
          const fallbackUsed = i > 0;

          if (fallbackUsed) {
            setUsbContentionWarning(
              `USB Bandwidth adjusted: ${isIntraoral ? 'Intraoral camera' : 'Webcam'} stepped down to ${settings.width}x${settings.height} to prevent USB controller crash.`
            );
          }

          return {
            stream,
            actualWidth: settings.width || 1280,
            actualHeight: settings.height || 720,
            fallbackUsed,
          };
        } catch (err: unknown) {
          lastError = err;
          const errorName = (err as Error)?.name;
          console.warn(
            `Ladder step ${i + 1} failed for camera (${errorName}):`,
            err
          );

          // If NotReadableError (USB bus saturation), immediately continue to next lower step
          if (errorName === 'NotReadableError' || errorName === 'OverconstrainedError') {
            continue;
          }
        }
      }

      throw lastError || new Error('Could not initialize camera stream after fallback ladder.');
    },
    []
  );

  return {
    videoDevices,
    audioDevices,
    selectedWebcamId,
    selectedIntraoralId,
    selectedAudioId,
    setSelectedWebcamId,
    setSelectedIntraoralId,
    setSelectedAudioId,
    refreshDevices,
    acquireCameraWithFallback,
    usbContentionWarning,
  };
}
