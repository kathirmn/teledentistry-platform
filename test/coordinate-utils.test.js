// Automated unit test for coordinate normalization and letterbox drift prevention
const assert = require('assert');

function calculateRenderedVideoBox(boxWidth, boxHeight, videoWidth, videoHeight) {
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

  let renderWidth;
  let renderHeight;
  let offsetX;
  let offsetY;

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

function normalizeCoordinates(clientX, clientY, containerRect, videoWidth, videoHeight, isMirrored = false) {
  const box = calculateRenderedVideoBox(containerRect.width, containerRect.height, videoWidth, videoHeight);
  const clickX = clientX - containerRect.left;
  const clickY = clientY - containerRect.top;

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

function denormalizeCoordinates(point, containerWidth, containerHeight, videoWidth, videoHeight, isMirrored = false) {
  const box = calculateRenderedVideoBox(containerWidth, containerHeight, videoWidth, videoHeight);
  const effectiveX = isMirrored ? 1 - point.x : point.x;

  return {
    x: box.offsetX + effectiveX * box.renderWidth,
    y: box.offsetY + point.y * box.renderHeight,
  };
}

console.log('--- Running Coordinate Normalization Unit Tests ---');

// Test 1: Letterbox Scenario (Video is 16:9 1920x1080 inside a 4:3 800x600 container)
{
  const containerRect = { left: 0, top: 0, width: 800, height: 600 };
  const box = calculateRenderedVideoBox(800, 600, 1920, 1080);
  assert.strictEqual(box.renderWidth, 800);
  assert.strictEqual(box.renderHeight, 450); // 800 / (16/9) = 450
  assert.strictEqual(box.offsetX, 0);
  assert.strictEqual(box.offsetY, 75); // (600 - 450) / 2 = 75px letterbox bar on top and bottom
  console.log('✔ Test 1 Passed: Letterbox offsets accurately calculated (75px top/bottom bars)');

  // Point clicked at exact center of the video: (400, 300) in container
  const norm = normalizeCoordinates(400, 300, containerRect, 1920, 1080);
  assert.strictEqual(norm.x, 0.5);
  assert.strictEqual(norm.y, 0.5);
  console.log('✔ Test 2 Passed: Center of letterboxed video accurately maps to (0.5, 0.5)');

  // Point clicked in top black bar (e.g. y = 20) should clamp to top edge of video (y = 0)
  const clampedTop = normalizeCoordinates(400, 20, containerRect, 1920, 1080);
  assert.strictEqual(clampedTop.y, 0);
  console.log('✔ Test 3 Passed: Clicks inside black letterbox bars clamp to video boundary (0, 1)');
}

// Test 4: Pillarbox Scenario (Video is 4:3 640x480 inside a 16:9 1600x900 container)
{
  const box = calculateRenderedVideoBox(1600, 900, 640, 480);
  assert.strictEqual(box.renderHeight, 900);
  assert.strictEqual(box.renderWidth, 1200); // 900 * (4/3) = 1200
  assert.strictEqual(box.offsetX, 200); // (1600 - 1200) / 2 = 200px pillarbox bar on left and right
  assert.strictEqual(box.offsetY, 0);
  console.log('✔ Test 4 Passed: Pillarbox offsets accurately calculated (200px left/right bars)');
}

// Test 5: Cross-device Telestration Invariance (Drawing on tooth at 16:9 maps to exact tooth at 4:3 iPad)
{
  const seniorMonitor = { left: 0, top: 0, width: 1920, height: 1080 }; // 16:9 monitor
  const juniorIpad = { width: 1024, height: 768 }; // 4:3 iPad
  const cameraRes = { width: 1280, height: 720 }; // 16:9 camera

  // Senior doctor clicks tooth at (x: 1000, y: 600) on 1920x1080
  const normPt = normalizeCoordinates(1000, 600, seniorMonitor, cameraRes.width, cameraRes.height);

  // Junior dentist on 4:3 iPad denormalizes
  const ipadPt = denormalizeCoordinates(normPt, juniorIpad.width, juniorIpad.height, cameraRes.width, cameraRes.height);

  // Re-normalizing on iPad must yield the exact same anatomical normalized coordinate!
  const ipadContainerRect = { left: 0, top: 0, width: juniorIpad.width, height: juniorIpad.height };
  const roundtripNorm = normalizeCoordinates(ipadPt.x, ipadPt.y, ipadContainerRect, cameraRes.width, cameraRes.height);

  assert.strictEqual(normPt.x, roundtripNorm.x);
  assert.strictEqual(normPt.y, roundtripNorm.y);
  console.log('✔ Test 5 Passed: Cross-device letterbox invariance verified! Zero drift between 16:9 and 4:3 displays');
}

// Test 6: Mirror Flip Inversion
{
  const containerRect = { left: 0, top: 0, width: 800, height: 600 };
  const normalPt = normalizeCoordinates(600, 300, containerRect, 800, 600, false);
  const mirroredPt = normalizeCoordinates(600, 300, containerRect, 800, 600, true);

  assert.strictEqual(Math.round((normalPt.x + mirroredPt.x) * 10) / 10, 1.0);
  assert.strictEqual(normalPt.y, mirroredPt.y);
  console.log('✔ Test 6 Passed: Mirror flip horizontal inversion (1 - normX) verified with vertical parity');
}

console.log('\n--- ALL UNIT TESTS PASSED SUCCESSFULLY! ---');
