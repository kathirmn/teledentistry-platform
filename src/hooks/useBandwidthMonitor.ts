'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { LowBandwidthTier, NetworkHealthStats } from '@/lib/webrtc-types';

interface UseBandwidthMonitorProps {
  onTierChange?: (tier: LowBandwidthTier) => void;
  webcamStream?: MediaStream | null;
  intraoralStream?: MediaStream | null;
}

interface MetricSample {
  rtt: number;
  loss: number;
  uplink: number;
}

export function useBandwidthMonitor({
  onTierChange,
  webcamStream,
  intraoralStream,
}: UseBandwidthMonitorProps) {
  const [stats, setStats] = useState<NetworkHealthStats>({
    rttMs: 35,
    packetLossPercent: 0.5,
    currentUplinkKbps: 2400,
    activeTier: 'optimal',
    forcedLowBandwidth: false,
  });

  // Moving average history window (last 4 samples = ~8-12 seconds)
  const historyRef = useRef<MetricSample[]>([]);
  // Hysteresis counters to prevent flickering between tiers
  const degradeStreakRef = useRef<number>(0);
  const recoveryStreakRef = useRef<number>(0);

  // Apply frame rate and constraints degradation to local streams
  const applyTierToTracks = useCallback((tier: LowBandwidthTier) => {
    // Intraoral Camera: Always prioritize sharp resolution, reducing FPS rather than detail
    if (intraoralStream) {
      const track = intraoralStream.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        const targetFps = tier === 'critical' ? 10 : tier === 'moderate' ? 15 : 25;
        try {
          track.applyConstraints({ frameRate: { ideal: targetFps, max: targetFps } }).catch(() => {});
        } catch (e) {
          console.warn('Could not apply intraoral constraints', e);
        }
      }
    }

    // PC Webcam: Can aggressively drop resolution and fps in low bandwidth to preserve intraoral
    if (webcamStream) {
      const track = webcamStream.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        const targetFps = tier === 'critical' ? 5 : tier === 'moderate' ? 15 : 20;
        const targetWidth = tier === 'critical' ? 320 : tier === 'moderate' ? 640 : 1280;
        const targetHeight = tier === 'critical' ? 240 : tier === 'moderate' ? 480 : 720;
        try {
          track
            .applyConstraints({
              width: { ideal: targetWidth, max: targetWidth },
              height: { ideal: targetHeight, max: targetHeight },
              frameRate: { ideal: targetFps, max: targetFps },
            })
            .catch(() => {});
        } catch (e) {
          console.warn('Could not apply webcam constraints', e);
        }
      }
    }
  }, [intraoralStream, webcamStream]);

  // Periodic network evaluation with moving average & hysteresis
  useEffect(() => {
    const interval = setInterval(() => {
      if (stats.forcedLowBandwidth) return;

      // Sample raw instantaneous metrics (synthetic baseline or WebRTC stats)
      const rawLoss = Math.random() * 1.5;
      const rawRtt = Math.floor(30 + Math.random() * 20);
      const rawUplink = Math.floor(2000 + Math.random() * 600);

      // Add to sliding window (max 4 samples)
      historyRef.current.push({ rtt: rawRtt, loss: rawLoss, uplink: rawUplink });
      if (historyRef.current.length > 4) {
        historyRef.current.shift();
      }

      // Compute Moving Average over sliding window
      const count = historyRef.current.length;
      const avgRtt = Math.round(historyRef.current.reduce((acc, s) => acc + s.rtt, 0) / count);
      const avgLoss = Math.round((historyRef.current.reduce((acc, s) => acc + s.loss, 0) / count) * 10) / 10;
      const avgUplink = Math.round(historyRef.current.reduce((acc, s) => acc + s.uplink, 0) / count);

      // Instantaneous threshold evaluation
      let sampleTier: LowBandwidthTier = 'optimal';
      if (avgUplink < 800 || avgLoss > 8 || avgRtt > 250) {
        sampleTier = 'critical';
      } else if (avgUplink < 1800 || avgLoss > 3 || avgRtt > 120) {
        sampleTier = 'moderate';
      }

      setStats((prev) => {
        if (prev.forcedLowBandwidth) return prev;

        let targetTier = prev.activeTier;

        // Hysteresis logic: only change tier if sustained over multiple ticks
        if (sampleTier !== prev.activeTier) {
          if (sampleTier === 'critical' || (sampleTier === 'moderate' && prev.activeTier === 'optimal')) {
            // Degrading: require 3 consecutive poor samples (~6-9 seconds)
            degradeStreakRef.current += 1;
            recoveryStreakRef.current = 0;
            if (degradeStreakRef.current >= 3) {
              targetTier = sampleTier;
              degradeStreakRef.current = 0;
            }
          } else {
            // Recovering: require 4 consecutive good samples (~8-12 seconds)
            recoveryStreakRef.current += 1;
            degradeStreakRef.current = 0;
            if (recoveryStreakRef.current >= 4) {
              targetTier = sampleTier;
              recoveryStreakRef.current = 0;
            }
          }
        } else {
          degradeStreakRef.current = 0;
          recoveryStreakRef.current = 0;
        }

        if (targetTier !== prev.activeTier) {
          console.log(`[Bandwidth Monitor] Tier transitioning with debounce to: ${targetTier}`);
          onTierChange?.(targetTier);
          applyTierToTracks(targetTier);
        }

        return {
          ...prev,
          rttMs: avgRtt,
          packetLossPercent: avgLoss,
          currentUplinkKbps: avgUplink,
          activeTier: targetTier,
        };
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [stats.forcedLowBandwidth, onTierChange, applyTierToTracks]);

  // Manual Low-Bandwidth Mode toggle
  const toggleForcedLowBandwidth = useCallback(() => {
    setStats((prev) => {
      const nextForced = !prev.forcedLowBandwidth;
      const nextTier: LowBandwidthTier = nextForced ? 'critical' : 'optimal';
      onTierChange?.(nextTier);
      applyTierToTracks(nextTier);
      return {
        ...prev,
        forcedLowBandwidth: nextForced,
        activeTier: nextTier,
      };
    });
  }, [onTierChange, applyTierToTracks]);

  return {
    stats,
    toggleForcedLowBandwidth,
    applyTierToTracks,
  };
}
