import { NormalizedPoint } from './webrtc-types';

export interface RenderedVideoBox {
  renderWidth: number;
  renderHeight: number;
  offsetX: number;
  offsetY: number;
  boxWidth: number;
  boxHeight: number;
  videoWidth: number;
  videoHeight: number;
}

/**
 * Calculates the exact rendered bounding box of a video with object-fit: contain
 * inside a container, accounting for letterboxing (top/bottom) or pillarboxing (left/right).
 */
export function calculateRenderedVideoBox(
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number
): RenderedVideoBox {
  if (!videoWidth || !videoHeight || !boxWidth || !boxHeight) {
    return {
      renderWidth: boxWidth,
      renderHeight: boxHeight,
      offsetX: 0,
      offsetY: 0,
      boxWidth,
      boxHeight,
      videoWidth: videoWidth || boxWidth,
      videoHeight: videoHeight || boxHeight,
    };
  }

  const videoRatio = videoWidth / videoHeight;
  const boxRatio = boxWidth / boxHeight;

  let renderWidth: number;
  let renderHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (boxRatio > videoRatio) {
    // Pillarbox: vertical space is filled, black bars on left & right
    renderHeight = boxHeight;
    renderWidth = boxHeight * videoRatio;
    offsetX = (boxWidth - renderWidth) / 2;
    offsetY = 0;
  } else {
    // Letterbox: horizontal space is filled, black bars on top & bottom
    renderWidth = boxWidth;
    renderHeight = boxWidth / videoRatio;
    offsetX = 0;
    offsetY = (boxHeight - renderHeight) / 2;
  }

  return {
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
    boxWidth,
    boxHeight,
    videoWidth,
    videoHeight,
  };
}

/**
 * Normalizes mouse/touch coordinates into [0..1] range relative strictly to the
 * intrinsic video frame, ignoring letterboxing and correctly accounting for mirror-flip.
 */
export function normalizeCoordinates(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  videoWidth: number,
  videoHeight: number,
  isMirrored = false
): NormalizedPoint {
  const box = calculateRenderedVideoBox(
    containerRect.width,
    containerRect.height,
    videoWidth,
    videoHeight
  );

  const clickX = clientX - containerRect.left;
  const clickY = clientY - containerRect.top;

  // Position relative to the rendered video frame
  const vidX = Math.max(0, Math.min(box.renderWidth, clickX - box.offsetX));
  const vidY = Math.max(0, Math.min(box.renderHeight, clickY - box.offsetY));

  let normX = vidX / box.renderWidth;
  const normY = vidY / box.renderHeight;

  if (isMirrored) {
    normX = 1 - normX;
  }

  return {
    x: Math.round(normX * 10000) / 10000,
    y: Math.round(normY * 10000) / 10000,
  };
}

/**
 * Maps normalized [0..1] coordinates back to canvas pixel coordinates within
 * the container, placing strokes precisely on top of the video frame.
 */
export function denormalizeCoordinates(
  point: NormalizedPoint,
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
  isMirrored = false
): { x: number; y: number } {
  const box = calculateRenderedVideoBox(
    containerWidth,
    containerHeight,
    videoWidth,
    videoHeight
  );

  const effectiveX = isMirrored ? 1 - point.x : point.x;

  return {
    x: box.offsetX + effectiveX * box.renderWidth,
    y: box.offsetY + point.y * box.renderHeight,
  };
}
