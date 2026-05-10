const imageInput = document.getElementById("imageInput");
const originalCanvas = document.getElementById("originalCanvas");
const previewCanvas = document.getElementById("previewCanvas");
const canvasGrid = document.getElementById("canvasGrid");
const previewCaption = document.getElementById("previewCaption");
const statusText = document.getElementById("statusText");
const resetButton = document.getElementById("resetButton");
const holdOriginalButton = document.getElementById("holdOriginalButton");

const controls = {
  exposure: {
    input: document.getElementById("exposureSlider"),
    output: document.getElementById("exposureValue"),
    defaultValue: 0
  },
  saturation: {
    input: document.getElementById("saturationSlider"),
    output: document.getElementById("saturationValue"),
    defaultValue: 0
  },
  contrast: {
    input: document.getElementById("contrastSlider"),
    output: document.getElementById("contrastValue"),
    defaultValue: 0
  },
  contrastRef: {
    input: document.getElementById("contrastRefSlider"),
    output: document.getElementById("contrastRefValue"),
    defaultValue: 128
  },
  contrastGamma: {
    input: document.getElementById("contrastGammaSlider"),
    output: document.getElementById("contrastGammaValue"),
    defaultValue: 0.5
  },
  dehaze: {
    input: document.getElementById("dehazeSlider"),
    output: document.getElementById("dehazeValue"),
    defaultValue: 0
  },
  dehazeBlock: {
    input: document.getElementById("dehazeBlockSlider"),
    output: document.getElementById("dehazeBlockValue"),
    defaultValue: 16
  },
  clarity: {
    input: document.getElementById("claritySlider"),
    output: document.getElementById("clarityValue"),
    defaultValue: 0
  }
};

const originalContext = originalCanvas.getContext("2d", { willReadFrequently: true });
const previewContext = previewCanvas.getContext("2d", { willReadFrequently: true });

let originalImageData = null;
let latestAdjustedImageData = null;
let scheduledRenderToken = null;
let isShowingOriginalPreview = false;

function updateOutputs() {
  controls.exposure.output.value = Number(controls.exposure.input.value).toFixed(0);
  controls.saturation.output.value = Number(controls.saturation.input.value).toFixed(2);
  controls.contrast.output.value = Number(controls.contrast.input.value).toFixed(2);
  controls.contrastRef.output.value = Number(controls.contrastRef.input.value).toFixed(0);
  controls.contrastGamma.output.value = Number(controls.contrastGamma.input.value).toFixed(2);
  controls.dehaze.output.value = Number(controls.dehaze.input.value).toFixed(2);
  controls.dehazeBlock.output.value = Number(controls.dehazeBlock.input.value).toFixed(0);
  controls.clarity.output.value = Number(controls.clarity.input.value).toFixed(2);
}

function showCurrentPreviewBuffer() {
  if (!originalImageData) {
    return;
  }

  const imageDataToShow = isShowingOriginalPreview
    ? originalImageData
    : latestAdjustedImageData ?? originalImageData;

  previewCanvas.width = imageDataToShow.width;
  previewCanvas.height = imageDataToShow.height;
  previewContext.putImageData(imageDataToShow, 0, 0);
  previewCaption.textContent = isShowingOriginalPreview ? "Original Preview" : "Adjusted";
}

function clampToByte(value) {
  return Math.max(0, Math.min(255, value)) | 0;
}

function adjustExposure(channel, sliderValue) {
  return clampToByte(channel + sliderValue);
}

function adjustContrast(channel, sliderValue, reference, gamma) {
  if (sliderValue === 0) {
    return channel;
  }

  if (sliderValue > 0) {
    const effectiveSlider = Math.pow(sliderValue, 1.35);
    const distance = channel - reference;
    return clampToByte(channel + distance * effectiveSlider);
  }

  const distance = reference - channel;
  const normalizedDistance = distance / 127.0;
  const factor = Math.sign(normalizedDistance) * Math.pow(Math.abs(normalizedDistance), gamma);
  const maxShift = 64.0;
  const protectionFloor = 0.45;
  const protectionExponent = 0.9;
  const edgeProtection = reference <= 0 || reference >= 255
    ? 1.0
    : channel < reference
      ? protectionFloor + (1 - protectionFloor) * Math.pow(
        Math.max(0, Math.min(1, channel / Math.max(reference, 1))),
        protectionExponent
      )
      : protectionFloor + (1 - protectionFloor) * Math.pow(
        Math.max(0, Math.min(1, (255 - channel) / Math.max(255 - reference, 1))),
        protectionExponent
      );

  return clampToByte(channel + factor * (-sliderValue) * maxShift * edgeProtection);
}

function adjustSaturation(r, g, b, sliderValue) {
  if (sliderValue === 0) {
    return [r, g, b];
  }

  const saturationScale = Math.max(0, 1 + sliderValue);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;

  return [
    clampToByte(gray + (r - gray) * saturationScale),
    clampToByte(gray + (g - gray) * saturationScale),
    clampToByte(gray + (b - gray) * saturationScale)
  ];
}

function applyHeadroomCurve(baseLuminance, rawDelta) {
  if (rawDelta === 0) {
    return 0;
  }

  if (rawDelta > 0) {
    const availableHeadroom = Math.max(0, Math.min(255, 255 - baseLuminance));
    const normalizedHeadroom = Math.max(0, Math.min(1, availableHeadroom / 255));
    const smoothHeadroom = normalizedHeadroom * normalizedHeadroom * (3 - 2 * normalizedHeadroom);
    const protection = Math.pow(smoothHeadroom, 2.35);
    const curvedDelta = rawDelta * protection;

    return Math.min(curvedDelta, availableHeadroom);
  }

  const shadowPush = 1 + (Math.max(0, 128 - baseLuminance) / 128) * (1.12 - 1);
  const curvedDelta = rawDelta * shadowPush;
  return Math.max(curvedDelta, -Math.max(0, Math.min(255, baseLuminance)));
}

function clarityStandardBlend(baseBoost, edgeBoost) {
  const smoothness = Math.max(0, Math.min(1, baseBoost * 0.65 + (1 - edgeBoost) * 0.35));
  return Math.max(0, Math.min(1, 0.22 + smoothness * (0.4 - 0.22)));
}

function dehazeReferenceOffset(localReference) {
  const normalized = Math.max(0, Math.min(1, localReference / 255));
  const parabola = normalized * normalized;

  return -3 + (5 - (-3)) * parabola;
}

function positiveDehazeContrastFactor(channelValue) {
  const normalized = Math.max(0, Math.min(1, channelValue / 255));
  const extremeRange = 0.35;
  const highlightZone = normalized > 1 - extremeRange
    ? Math.max(0, Math.min(1, (normalized - (1 - extremeRange)) / extremeRange))
    : 0;
  const shadowZone = normalized < extremeRange
    ? Math.max(0, Math.min(1, (extremeRange - normalized) / extremeRange))
    : 0;
  const highlightSoftening = 0.82 * Math.pow(highlightZone, 1.55);
  const shadowSoftening = 0.34 * Math.pow(shadowZone, 1.2);
  const highlightPullDamping = 0.16 * highlightZone * highlightZone;
  const shadowPullDamping = 0.1 * shadowZone * shadowZone;
  const lowAttenuation = normalized < 0.25
    ? smoothstep(0, 1, Math.max(0, Math.min(1, (normalized - 0.05) / (0.25 - 0.05))))
    : 1;
  const highAttenuation = normalized > 0.75
    ? smoothstep(0, 1, Math.max(0, Math.min(1, (0.95 - normalized) / (0.95 - 0.75))))
    : 1;
  const attenuation = Math.min(lowAttenuation, highAttenuation);

  return Math.max(
    0.12,
    Math.min(1, (1 - highlightSoftening - shadowSoftening - highlightPullDamping - shadowPullDamping) * attenuation)
  );
}

function positiveDehazeSaturationBoost(r, g, b, localStrength, localBoost) {
  const luminanceWeight = Math.max(0, Math.min(1, luminance(r, g, b) / 255));
  return Math.abs(localStrength) * (localBoost * 0.16 + luminanceWeight * 0.04);
}

function negativeDehazeHighlightLift(r, g, b, localStrength) {
  const normalized = Math.max(0, Math.min(1, luminance(r, g, b) / 255));
  const highlightZone = normalized > 0.65
    ? Math.max(0, Math.min(1, (normalized - 0.65) / (1 - 0.65)))
    : 0;
  const curvedHighlightZone = Math.pow(smoothstep(0, 1, highlightZone), 1.75);

  return Math.abs(localStrength) * 0.18 * curvedHighlightZone * 255;
}

function smoothstep(edge0, edge1, x) {
  if (edge0 >= edge1) {
    return x >= edge1 ? 1 : 0;
  }

  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function blendedDehazeReference(pixelLuminance, standardReference, curvedReference) {
  const transitionWidth = 24;
  const start = standardReference - transitionWidth * 0.5;
  const end = standardReference + transitionWidth * 0.5;
  const blend = smoothstep(start, end, pixelLuminance);

  return Math.max(0, Math.min(255, standardReference * (1 - blend) + curvedReference * blend));
}

function dehazeBlockSize(amount, baseBlockSize) {
  return baseBlockSize * 2;
}

function globalMeanLuminance(source, width, height) {
  const count = width * height;
  if (count === 0) {
    return 128;
  }

  let sum = 0;
  for (let index = 0; index < count * 4; index += 4) {
    sum += luminance(source[index], source[index + 1], source[index + 2]);
  }

  return sum / count;
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function buildBlockStarts(length, blockSize) {
  if (length <= 0) {
    return [];
  }

  const actualBlockSize = Math.max(1, Math.min(length, blockSize));
  const stride = Math.max(1, Math.floor(actualBlockSize / 4));
  const starts = [];
  let current = 0;

  while (current + actualBlockSize < length) {
    starts.push(current);
    current += stride;
  }

  starts.push(length - actualBlockSize);

  return [...new Set(starts)].sort((a, b) => a - b);
}

function applyDehazeToImage(
  source,
  analysisSource,
  width,
  height,
  amount,
  blockSize,
  contrastRefValue,
  contrastGammaValue,
  useGlobalPositiveReference = true
) {
  if (amount === 0) {
    return new Uint8ClampedArray(source);
  }

  const actualBlockSize = Math.max(1, Math.min(dehazeBlockSize(amount, blockSize), width, height));
  const includeNearbyZones = true;
  const globalReference = useGlobalPositiveReference
    ? globalMeanLuminance(analysisSource, width, height)
    : null;
  const startsX = buildBlockStarts(width, actualBlockSize);
  const startsY = buildBlockStarts(height, actualBlockSize);
  const boostSum = new Float32Array(width * height);
  const referenceSum = new Float32Array(width * height);
  const weightSum = new Float32Array(width * height);

  for (const startY of startsY) {
    for (const startX of startsX) {
      const endX = Math.min(width, startX + actualBlockSize);
      const endY = Math.min(height, startY + actualBlockSize);
      let mean = 0;
      let count = 0;

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * width + x) * 4;
          mean += luminance(
            analysisSource[index],
            analysisSource[index + 1],
            analysisSource[index + 2]
          );
          count += 1;
        }
      }

      mean /= Math.max(1, count);

      let sumAbsoluteDelta = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * width + x) * 4;
          const lum = luminance(
            analysisSource[index],
            analysisSource[index + 1],
            analysisSource[index + 2]
          );
          sumAbsoluteDelta += Math.abs(lum - mean);
        }
      }

      const normalizedScore = Math.min(1, sumAbsoluteDelta / (Math.max(1, count) * 255));
      const localBoost = 1 - normalizedScore;
      const centerX = startX + (endX - startX) / 2 - 0.5;
      const centerY = startY + (endY - startY) / 2 - 0.5;
      const radiusX = Math.max(1, (endX - startX) / 2);
      const radiusY = Math.max(1, (endY - startY) / 2);
      const nearbyRadiusX = radiusX * 1.75;
      const nearbyRadiusY = radiusY * 1.75;
      const nearStartX = includeNearbyZones
        ? Math.max(0, Math.floor(centerX - nearbyRadiusX))
        : startX;
      const nearEndX = includeNearbyZones
        ? Math.min(width, Math.ceil(centerX + nearbyRadiusX) + 1)
        : endX;
      const nearStartY = includeNearbyZones
        ? Math.max(0, Math.floor(centerY - nearbyRadiusY))
        : startY;
      const nearEndY = includeNearbyZones
        ? Math.min(height, Math.ceil(centerY + nearbyRadiusY) + 1)
        : endY;

      for (let y = nearStartY; y < nearEndY; y += 1) {
        for (let x = nearStartX; x < nearEndX; x += 1) {
          const index = y * width + x;
          const effectiveRadiusX = includeNearbyZones ? nearbyRadiusX : radiusX;
          const effectiveRadiusY = includeNearbyZones ? nearbyRadiusY : radiusY;
          const nearbyDx = (x - centerX) / effectiveRadiusX;
          const nearbyDy = (y - centerY) / effectiveRadiusY;
          const effectiveDistance = Math.sqrt(nearbyDx * nearbyDx + nearbyDy * nearbyDy);
          let weight = Math.max(
            0,
            Math.min(1, 1 / (1 + effectiveDistance * effectiveDistance * 0.55))
          );
          const isCoveringZone = x >= startX && x < endX && y >= startY && y < endY;
          if (includeNearbyZones && !isCoveringZone) {
            weight *= 0.35;
          }

          boostSum[index] += localBoost * weight;
          referenceSum[index] += (globalReference ?? mean) * weight;
          weightSum[index] += weight;
        }
      }
    }
  }

  const adjusted = new Uint8ClampedArray(source);
  const signedAmount = amount > 0
    ? Math.pow(amount, 0.74)
    : -Math.pow(Math.abs(amount), 0.75);
  const negativeDehazeReferenceOffset = 28;
  const positiveDehazeContrastResponseMultiplier = 1.12;
  const negativeDehazeContrastResponseMultiplier = 1.45;
  const positiveSaturationBoost = 1.0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const index = pixelIndex * 4;
        const averagedBoost = weightSum[pixelIndex] === 0 ? 0 : boostSum[pixelIndex] / weightSum[pixelIndex];
        const averagedReference = weightSum[pixelIndex] === 0
          ? contrastRefValue
          : referenceSum[pixelIndex] / weightSum[pixelIndex];
        const standardReference = Math.max(0, Math.min(255, averagedReference));
        const curvedReference = Math.max(
          0,
          Math.min(255, averagedReference + dehazeReferenceOffset(averagedReference))
        );
        const localStrength = signedAmount * Math.pow(averagedBoost, 0.7);
          let r = adjusted[index];
          let g = adjusted[index + 1];
          let b = adjusted[index + 2];
        const contrastSlider = localStrength * 0.9 * (
          localStrength > 0
            ? positiveDehazeContrastResponseMultiplier
            : negativeDehazeContrastResponseMultiplier
        );
        const referenceForR = blendedDehazeReference(r, standardReference, curvedReference);
        const referenceForG = blendedDehazeReference(g, standardReference, curvedReference);
        const referenceForB = blendedDehazeReference(b, standardReference, curvedReference);
        const localContrastReferenceR = localStrength < 0
          ? Math.min(255, referenceForR + negativeDehazeReferenceOffset)
          : referenceForR;
        const localContrastReferenceG = localStrength < 0
          ? Math.min(255, referenceForG + negativeDehazeReferenceOffset)
          : referenceForG;
        const localContrastReferenceB = localStrength < 0
          ? Math.min(255, referenceForB + negativeDehazeReferenceOffset)
          : referenceForB;
        const localSaturationAdjustment = localStrength > 0
          ? positiveDehazeSaturationBoost(r, g, b, localStrength, averagedBoost) * positiveSaturationBoost
          : 0;

        const effectiveContrastSliderR = contrastSlider > 0
          ? contrastSlider * positiveDehazeContrastFactor(r)
          : contrastSlider;
        const effectiveContrastSliderG = contrastSlider > 0
          ? contrastSlider * positiveDehazeContrastFactor(g)
          : contrastSlider;
        const effectiveContrastSliderB = contrastSlider > 0
          ? contrastSlider * positiveDehazeContrastFactor(b)
          : contrastSlider;

        r = adjustContrast(r, effectiveContrastSliderR, localContrastReferenceR, contrastGammaValue);
        g = adjustContrast(g, effectiveContrastSliderG, localContrastReferenceG, contrastGammaValue);
        b = adjustContrast(b, effectiveContrastSliderB, localContrastReferenceB, contrastGammaValue);
        const highlightLift = localStrength < 0
          ? negativeDehazeHighlightLift(r, g, b, localStrength)
          : 0;
        r = clampToByte(r + highlightLift);
        g = clampToByte(g + highlightLift);
        b = clampToByte(b + highlightLift);
        [r, g, b] = adjustSaturation(r, g, b, localSaturationAdjustment);

          adjusted[index] = r;
          adjusted[index + 1] = g;
      adjusted[index + 2] = b;
    }
  }

  return adjusted;
}

function midtoneWeight(lum) {
  const normalized = lum / 255;
  if (normalized < 0.2 || normalized > 0.8) {
    return 0;
  }

  return Math.max(0, Math.min(1, (0.8 - normalized) / 0.6));
}

function applyClarityToImage(source, analysisSource, width, height, amount, contrastGammaValue) {
  if (amount === 0) {
    return new Uint8ClampedArray(source);
  }

  const adjusted = new Uint8ClampedArray(source);
  const blockSize = amount > 0 ? 32 : 16;
  const includeNearbyZones = amount > 0;
  const startsX = buildBlockStarts(width, blockSize);
  const startsY = buildBlockStarts(height, blockSize);
  const boostSum = new Float32Array(width * height);
  const referenceSum = new Float32Array(width * height);
  const weightSum = new Float32Array(width * height);

  for (const startY of startsY) {
    for (const startX of startsX) {
      const endX = Math.min(width, startX + blockSize);
      const endY = Math.min(height, startY + blockSize);
      let mean = 0;
      let count = 0;

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * width + x) * 4;
          mean += luminance(
            analysisSource[index],
            analysisSource[index + 1],
            analysisSource[index + 2]
          );
          count += 1;
        }
      }

      mean /= Math.max(1, count);

      let sumAbsoluteDelta = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const index = (y * width + x) * 4;
          const lum = luminance(
            analysisSource[index],
            analysisSource[index + 1],
            analysisSource[index + 2]
          );
          sumAbsoluteDelta += Math.abs(lum - mean);
        }
      }

      const normalizedScore = Math.min(1, sumAbsoluteDelta / (Math.max(1, count) * 255));
      const localBoost = 1 - normalizedScore;
      const centerX = startX + (endX - startX) / 2 - 0.5;
      const centerY = startY + (endY - startY) / 2 - 0.5;
      const radiusX = Math.max(1, (endX - startX) / 2);
      const radiusY = Math.max(1, (endY - startY) / 2);
      const nearbyRadiusX = radiusX * 1.75;
      const nearbyRadiusY = radiusY * 1.75;
      const nearStartX = includeNearbyZones
        ? Math.max(0, Math.floor(centerX - nearbyRadiusX))
        : startX;
      const nearEndX = includeNearbyZones
        ? Math.min(width, Math.ceil(centerX + nearbyRadiusX) + 1)
        : endX;
      const nearStartY = includeNearbyZones
        ? Math.max(0, Math.floor(centerY - nearbyRadiusY))
        : startY;
      const nearEndY = includeNearbyZones
        ? Math.min(height, Math.ceil(centerY + nearbyRadiusY) + 1)
        : endY;

      for (let y = nearStartY; y < nearEndY; y += 1) {
        for (let x = nearStartX; x < nearEndX; x += 1) {
          const pixelIndex = y * width + x;
          const weight = Math.max(
            0,
            Math.min(
              1,
              1 / (1 + (
                Math.pow((x - centerX) / (includeNearbyZones ? nearbyRadiusX : radiusX), 2) +
                Math.pow((y - centerY) / (includeNearbyZones ? nearbyRadiusY : radiusY), 2)
              ) * 0.55)
            )
          );
          const isCoveringZone = x >= startX && x < endX && y >= startY && y < endY;
          const finalWeight = includeNearbyZones && !isCoveringZone ? weight * 0.35 : weight;

          boostSum[pixelIndex] += localBoost * finalWeight;
          referenceSum[pixelIndex] += mean * finalWeight;
          weightSum[pixelIndex] += finalWeight;
        }
      }
    }
  }

  const signedAmount = amount > 0
    ? Math.pow(amount, 0.58)
    : -Math.pow(Math.abs(amount), 0.75);
  const contrastResponseMultiplier = 1.45;
  const negativeReferenceOffset = 28;
  const positiveSaturationCompensation = 0.38;
  const negativeSaturationCompensation = 0.72;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const index = pixelIndex * 4;
      const averagedBoost = weightSum[pixelIndex] === 0 ? 0 : boostSum[pixelIndex] / weightSum[pixelIndex];
      const averagedReference = weightSum[pixelIndex] === 0 ? 128 : referenceSum[pixelIndex] / weightSum[pixelIndex];
      const standardReference = Math.max(0, Math.min(255, averagedReference));
      const curvedReference = Math.max(
        0,
        Math.min(255, averagedReference + dehazeReferenceOffset(averagedReference))
      );
      const localStrength = signedAmount * Math.pow(averagedBoost, 0.7);
      let r = adjusted[index];
      let g = adjusted[index + 1];
      let b = adjusted[index + 2];
      const contrastSlider = localStrength * 0.9 * contrastResponseMultiplier;
      const referenceForR = blendedDehazeReference(r, standardReference, curvedReference);
      const referenceForG = blendedDehazeReference(g, standardReference, curvedReference);
      const referenceForB = blendedDehazeReference(b, standardReference, curvedReference);
      const localContrastReferenceR = localStrength < 0
        ? Math.min(255, referenceForR + negativeReferenceOffset)
        : referenceForR;
      const localContrastReferenceG = localStrength < 0
        ? Math.min(255, referenceForG + negativeReferenceOffset)
        : referenceForG;
      const localContrastReferenceB = localStrength < 0
        ? Math.min(255, referenceForB + negativeReferenceOffset)
        : referenceForB;
      const saturationAdjustment = localStrength > 0
        ? -Math.abs(localStrength) * positiveSaturationCompensation
        : Math.abs(localStrength) * negativeSaturationCompensation;

      r = adjustContrast(r, contrastSlider, localContrastReferenceR, contrastGammaValue);
      g = adjustContrast(g, contrastSlider, localContrastReferenceG, contrastGammaValue);
      b = adjustContrast(b, contrastSlider, localContrastReferenceB, contrastGammaValue);
      [r, g, b] = adjustSaturation(r, g, b, saturationAdjustment);

      adjusted[index] = r;
      adjusted[index + 1] = g;
      adjusted[index + 2] = b;
    }
  }

  return adjusted;
}

function renderPreview() {
  updateOutputs();

  if (!originalImageData) {
    return;
  }

  const exposureValue = Number(controls.exposure.input.value);
  const saturationValue = Number(controls.saturation.input.value);
  const contrastValue = Number(controls.contrast.input.value);
  const contrastRefValue = Number(controls.contrastRef.input.value);
  const contrastGammaValue = Number(controls.contrastGamma.input.value);
  const dehazeValue = Number(controls.dehaze.input.value);
  const dehazeBlockValue = Number(controls.dehazeBlock.input.value);
  const clarityValue = Number(controls.clarity.input.value);

  const width = originalImageData.width;
  const height = originalImageData.height;
  const source = originalImageData.data;
  let adjusted = new Uint8ClampedArray(source.length);

  for (let index = 0; index < source.length; index += 4) {
    let r = source[index];
    let g = source[index + 1];
    let b = source[index + 2];
    const a = source[index + 3];

    r = adjustExposure(r, exposureValue);
    g = adjustExposure(g, exposureValue);
    b = adjustExposure(b, exposureValue);

    [r, g, b] = adjustSaturation(r, g, b, saturationValue);

    r = adjustContrast(r, contrastValue, contrastRefValue, contrastGammaValue);
    g = adjustContrast(g, contrastValue, contrastRefValue, contrastGammaValue);
    b = adjustContrast(b, contrastValue, contrastRefValue, contrastGammaValue);

    adjusted[index] = r;
    adjusted[index + 1] = g;
    adjusted[index + 2] = b;
    adjusted[index + 3] = a;
  }

  adjusted = applyDehazeToImage(
    adjusted,
    source,
    width,
    height,
    dehazeValue,
    dehazeBlockValue,
    contrastRefValue,
    contrastGammaValue
  );

  adjusted = applyClarityToImage(
    adjusted,
    source,
    width,
    height,
    clarityValue,
    contrastGammaValue
  );

  latestAdjustedImageData = new ImageData(adjusted, width, height);
  showCurrentPreviewBuffer();

  statusText.textContent = `Preview updated. Exposure ${exposureValue.toFixed(0)}, Saturation ${saturationValue.toFixed(2)}, Contrast ${contrastValue.toFixed(2)}, Dehaze ${dehazeValue.toFixed(2)}, Clarity ${clarityValue.toFixed(2)}.`;
}

function resizeCanvases(width, height) {
  originalCanvas.width = width;
  originalCanvas.height = height;
  previewCanvas.width = width;
  previewCanvas.height = height;
}

function updateCanvasLayout(width, height) {
  canvasGrid.classList.remove("landscape-stack");
}

function scheduleRender() {
  if (scheduledRenderToken !== null) {
    cancelAnimationFrame(scheduledRenderToken);
  }

  scheduledRenderToken = requestAnimationFrame(() => {
    scheduledRenderToken = null;
    renderPreview();
  });
}

function loadImage(file) {
  const reader = new FileReader();

  reader.onload = event => {
    const image = new Image();

    image.onload = () => {
      updateCanvasLayout(image.width, image.height);
      resizeCanvases(image.width, image.height);
      originalContext.drawImage(image, 0, 0);
      originalImageData = originalContext.getImageData(0, 0, image.width, image.height);
      latestAdjustedImageData = null;
      statusText.textContent = `Loaded ${file.name} at ${image.width}x${image.height}.`;
      scheduleRender();
    };

    image.src = event.target.result;
  };

  reader.readAsDataURL(file);
}

imageInput.addEventListener("change", event => {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  loadImage(file);
});

Object.values(controls).forEach(({ input }) => {
  input.addEventListener("input", () => scheduleRender());
  input.addEventListener("change", () => scheduleRender());
});

resetButton.addEventListener("click", () => {
  Object.values(controls).forEach(control => {
    control.input.value = String(control.defaultValue);
  });
  scheduleRender();
});

function setOriginalPreviewState(nextState) {
  if (!originalImageData || isShowingOriginalPreview === nextState) {
    return;
  }

  isShowingOriginalPreview = nextState;
  showCurrentPreviewBuffer();
}

holdOriginalButton.addEventListener("mousedown", () => setOriginalPreviewState(true));
holdOriginalButton.addEventListener("mouseup", () => setOriginalPreviewState(false));
holdOriginalButton.addEventListener("mouseleave", () => setOriginalPreviewState(false));
holdOriginalButton.addEventListener("touchstart", event => {
  event.preventDefault();
  setOriginalPreviewState(true);
}, { passive: false });
holdOriginalButton.addEventListener("touchend", () => setOriginalPreviewState(false));
holdOriginalButton.addEventListener("touchcancel", () => setOriginalPreviewState(false));

window.addEventListener("keydown", event => {
  if (event.code !== "Space" || event.repeat) {
    return;
  }

  const targetTag = event.target instanceof HTMLElement ? event.target.tagName : "";
  if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "BUTTON") {
    return;
  }

  event.preventDefault();
  setOriginalPreviewState(true);
});

window.addEventListener("keyup", event => {
  if (event.code !== "Space") {
    return;
  }

  setOriginalPreviewState(false);
});

updateOutputs();
