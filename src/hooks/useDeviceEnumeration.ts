'use client';

import { useState, useEffect, useCallback } from 'react';

export interface MediaDeviceInfoSummary {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
        console.log(`[Hardware] Stopped track: ${track.kind} (${track.label})`);
      } catch (err) {
        console.warn('[Hardware] Error stopping track:', err);
      }
    });
  } catch (e) {
    console.warn('[Hardware] Error stopping stream tracks:', e);
  }
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

        if (candidateIntra && candidateWebcam && candidateIntra.deviceId !== candidateWebcam.deviceId) {
          setSelectedIntraoralId((prev) => prev || candidateIntra.deviceId);
          setSelectedWebcamId((prev) => prev || candidateWebcam.deviceId);
        } else {
          // Fallback: first camera as webcam, second as intraoral (guaranteed distinct)
          const first = vDevices[0]?.deviceId || '';
          const second = vDevices[1]?.deviceId || '';
          setSelectedWebcamId((prev) => prev || first);
          setSelectedIntraoralId((prev) => prev || (second !== first ? second : ''));
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
   * Acquire camera stream with an automatic fallback ladder to solve USB 2.0/3.0 Root Hub Contention
   * and Windows UVC driver constraints.
   *
   * CRITICAL FIX: Every ladder step MUST strictly preserve `deviceId: { exact: deviceId }`.
   * Never use `ideal: deviceId`, as browsers (Chrome/Edge on Windows) will silently fall back
   * to the first/default camera if the requested camera cannot satisfy the resolution constraint,
   * causing one camera to duplicate into both viewports!
   */
  const acquireCameraWithFallback = useCallback(
    async (deviceId: string, isIntraoral = false): Promise<CameraStreamResult> => {
      setUsbContentionWarning(null);

      if (!deviceId) {
        throw new Error('No device ID specified for camera acquisition');
      }

      // Strict resolution ladder: always locking to exact deviceId
      const constraintLadder: MediaTrackConstraints[] = isIntraoral
        ? [
            // Intraoral Ladder 1: 1080p for macro dental inspection
            {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 20 },
            },
            // Intraoral Ladder 2: 720p if 1080p saturated USB bus
            {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 15 },
            },
            // Intraoral Ladder 3: 480p universal fallback
            {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15 },
            },
            // Intraoral Ladder 4: Native default (no resolution constraint)
            {
              deviceId: { exact: deviceId },
            },
          ]
        : [
            // Webcam Ladder 1: 720p for clinician face
            {
              deviceId: { exact: deviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 15 },
            },
            // Webcam Ladder 2: 480p standard VGA (native to USB 2.0 PC cameras like 1908:2311)
            {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15 },
            },
            // Webcam Ladder 3: 240p low bandwidth
            {
              deviceId: { exact: deviceId },
              width: { ideal: 320 },
              height: { ideal: 240 },
              frameRate: { ideal: 15 },
            },
            // Webcam Ladder 4: Native default (no resolution constraint)
            {
              deviceId: { exact: deviceId },
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

          // CRITICAL: Guarantee device isolation!
          // Reject any stream where the browser returned a different physical device
          if (settings.deviceId && settings.deviceId !== deviceId) {
            console.error(
              `[Hardware] Browser returned wrong deviceId "${settings.deviceId}" instead of requested "${deviceId}". Aborting stream.`
            );
            track.stop();
            throw new Error(`Device mismatch: requested ${deviceId}, but browser returned ${settings.deviceId}`);
          }

          if (fallbackUsed) {
            setUsbContentionWarning(
              `USB Bandwidth adjusted: ${isIntraoral ? 'Intraoral camera' : 'Webcam'} stepped down to ${settings.width || 640}x${settings.height || 480} to prevent USB controller crash.`
            );
          }

          console.log(`[Hardware] Successfully acquired ${isIntraoral ? 'intraoral' : 'webcam'} camera on step ${i + 1} (${settings.width}x${settings.height})`);

          return {
            stream,
            actualWidth: settings.width || (isIntraoral ? 1280 : 640),
            actualHeight: settings.height || (isIntraoral ? 720 : 480),
            fallbackUsed,
          };
        } catch (err: unknown) {
          lastError = err;
          const errorName = (err as Error)?.name;
          console.warn(
            `Ladder step ${i + 1} failed for ${isIntraoral ? 'intraoral' : 'webcam'} camera (${errorName}):`,
            err
          );

          // If NotReadableError (USB bus saturation or device in use) or OverconstrainedError, try next lower step
          if (
            errorName === 'NotReadableError' ||
            errorName === 'OverconstrainedError' ||
            errorName === 'AbortError' ||
            errorName === 'TrackStartError'
          ) {
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
