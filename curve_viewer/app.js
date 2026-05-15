const curves = [
  {
    group: "Tonal Ranges",
    title: "Whites Influence Mask",
    description: "The Whites control uses an S curve: slow tail, steeper middle, then a soft ease into the clipped max zone.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much the Whites slider affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Whites mask",
        color: "#245c73",
        fn: x => highRangeWeight(x, 0.60, 0.82)
      }
    ],
    notes: [
      "Strong influence zone: `82%..100%` luminance.",
      "Falloff zone: S-curve rise from `60%..82%` luminance.",
      "Source: `src/pipeline/tonal_ranges.rs` -> `whites_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Tonal Ranges",
    title: "Highlights Influence Mask",
    description: "The Highlights control uses two S curves, one on each side of the max zone.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much the Highlights slider affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Highlights mask",
        color: "#245c73",
        fn: x => middleRangeWeight(x, 0.45, 0.62, 0.78, 0.92)
      }
    ],
    notes: [
      "Strong influence zone: `62%..78%` luminance.",
      "Falloff zones: S-curve rise from `45%..62%` and S-curve fall from `78%..92%`.",
      "Source: `src/pipeline/tonal_ranges.rs` -> `highlights_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Tonal Ranges",
    title: "Shadows Influence Mask",
    description: "The Shadows control uses two S curves, one on each side of the max zone.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much the Shadows slider affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Shadows mask",
        color: "#245c73",
        fn: x => middleRangeWeight(x, 0.08, 0.22, 0.38, 0.55)
      }
    ],
    notes: [
      "Strong influence zone: `22%..38%` luminance.",
      "Falloff zones: S-curve rise from `8%..22%` and S-curve fall from `38%..55%`.",
      "Source: `src/pipeline/tonal_ranges.rs` -> `shadows_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Tonal Ranges",
    title: "Blacks Influence Mask",
    description: "The Blacks control uses an S curve at the low end of the spectrum.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much the Blacks slider affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Blacks mask",
        color: "#245c73",
        fn: x => lowRangeWeight(x, 0.18, 0.40)
      }
    ],
    notes: [
      "Strong influence zone: `0%..18%` luminance.",
      "Falloff zone: S-curve fall from `18%..40%` luminance.",
      "Source: `src/pipeline/tonal_ranges.rs` -> `blacks_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Contrast",
    title: "Positive Contrast Slider Response",
    description: "The positive contrast slider is eased before it reaches the actual contrast formula. This makes low values gentler and high values still strong.",
    xLabel: "Raw positive contrast slider value.",
    yLabel: "Effective slider value after easing.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Current response",
        color: "#245c73",
        fn: x => Math.pow(x, 1.35)
      },
      {
        label: "Linear reference",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Used in `contrast.rs` as `positive_response(slider) = slider^1.35`.",
      "Visual meaning: the slider builds slower near zero, so small positive changes are easier to control.",
      "Source: `src/pipeline/contrast.rs` -> `positive_response`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Contrast",
    title: "Negative Contrast Protection Curve",
    description: "When lowering contrast, tonal extremes are protected so deep shadows and bright highlights move less than middle zones.",
    xLabel: "Normalized distance from the tonal edge toward the reference.",
    yLabel: "Protection multiplier applied to negative contrast shift.",
    domain: [0, 1],
    range: [0.4, 1.02],
    lines: [
      {
        label: "Edge protection",
        color: "#245c73",
        fn: x => 0.45 + (1 - 0.45) * Math.pow(x, 0.9)
      }
    ],
    notes: [
      "This is the protection factor applied before the negative contrast shift.",
      "At the edge (`x = 0`) protection stays around `0.45`; toward the midpoint it rises toward `1.0`.",
      "Source: `src/pipeline/contrast.rs` -> `edge_protection`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Clarity",
    title: "Positive Clarity Slider Response",
    description: "Positive clarity now follows the saved older positive-dehaze-style response before the global-reference experiment.",
    xLabel: "Raw clarity slider value.",
    yLabel: "Effective positive clarity response value.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Current positive response",
        color: "#245c73",
        fn: x => Math.pow(x, 0.58)
      },
      {
        label: "Linear reference",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Used in `clarity.rs` as `amount^0.58` for positive values.",
      "This is the saved old positive-dehaze-style clarity response, so it builds faster than linear.",
      "Source: `src/pipeline/clarity.rs` -> `clarity_signed_response`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Clarity",
    title: "Negative Clarity Slider Response",
    description: "Negative clarity follows the saved negative-dehaze-style response magnitude.",
    xLabel: "Absolute value of the negative clarity slider.",
    yLabel: "Effective negative clarity response magnitude.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Current negative response",
        color: "#245c73",
        fn: x => Math.pow(x, 0.75)
      },
      {
        label: "Linear reference",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Used in `clarity.rs` as `-|amount|^0.75` on the negative side.",
      "This is the saved negative-dehaze-style clarity response magnitude.",
      "Source: `src/pipeline/clarity.rs` -> `clarity_signed_response`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Clarity",
    title: "Clarity Block Size Switch",
    description: "Clarity now switches between two dehaze-family local-analysis scales depending on slider direction.",
    xLabel: "Clarity slider direction encoded as 0 = negative, 1 = positive.",
    yLabel: "Effective block size in pixels when the base size is 16.",
    domain: [0, 1],
    range: [16, 32],
    lines: [
      {
        label: "Block size",
        color: "#245c73",
        fn: x => x < 0.5 ? 16 : 32
      }
    ],
    notes: [
      "Negative clarity keeps the base block size (`16`).",
      "Positive clarity doubles the base block size to `32`, matching the saved older positive dehaze structure.",
      "Source: `src/pipeline/clarity.rs` -> `clarity_block_size`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Clarity",
    title: "Clarity Saturation Compensation",
    description: "The saved dehaze-style clarity still applies saturation compensation after the per-channel contrast step.",
    xLabel: "Absolute local clarity strength.",
    yLabel: "Saturation adjustment magnitude.",
    domain: [0, 1],
    range: [0, 0.75],
    lines: [
      {
        label: "Positive clarity compensation",
        color: "#245c73",
        fn: x => x * 0.38
      },
      {
        label: "Negative clarity compensation",
        color: "#c96d32",
        fn: x => x * 0.72
      }
    ],
    notes: [
      "Positive clarity uses reverse saturation compensation: `-abs(local_strength) * 0.38`.",
      "Negative clarity uses positive saturation compensation: `abs(local_strength) * 0.72`.",
      "Source: `src/pipeline/clarity.rs` -> `apply_local_clarity`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Clarity",
    title: "Clarity Zone Distance Weight",
    description: "The saved dehaze-style clarity uses distance-weighted overlapping local windows rather than the older custom clarity edge map.",
    xLabel: "Normalized distance from zone center.",
    yLabel: "Zone contribution weight for the weighted mean.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Zone weight",
        color: "#245c73",
        fn: x => 1 / (1 + x * x * 0.55)
      }
    ],
    notes: [
      "This is the same local distance falloff idea clarity now inherits from the saved dehaze-family behavior.",
      "Positive clarity nearby non-covering zones are weighted by this curve and then reduced again by `0.35`.",
      "Source: `src/pipeline/clarity.rs` -> `zone_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Positive Dehaze Slider Response",
    description: "Positive dehaze values are made more aggressive than linear before they hit the local boost logic.",
    xLabel: "Raw positive dehaze slider value.",
    yLabel: "Effective positive dehaze response value.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Current response",
        color: "#245c73",
        fn: x => Math.pow(x, 0.74)
      },
      {
        label: "Linear reference",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Used in `dehaze.rs` as `amount^0.74` for positive values.",
      "Positive dehaze still builds faster than linear, but more gently than before.",
      "Source: `src/pipeline/dehaze.rs` -> `signed_response`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Positive Dehaze Extreme Attenuation",
    description: "Positive dehaze is intentionally reduced near the darkest and brightest ends so it acts much less in the bottom and top tonal bands.",
    xLabel: "Normalized luminance from 0 to 1.",
    yLabel: "Extra attenuation multiplier on positive dehaze strength.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Current attenuation",
        color: "#245c73",
        fn: x => {
          const smoothstep = t => t * t * (3 - 2 * t);
          const low = x < 0.25
            ? smoothstep(Math.max(0, Math.min(1, (x - 0.05) / (0.25 - 0.05))))
            : 1;
          const high = x > 0.75
            ? smoothstep(Math.max(0, Math.min(1, (0.95 - x) / (0.95 - 0.75))))
            : 1;
          return Math.min(low, high);
        }
      }
    ],
    notes: [
      "Positive dehaze now starts attenuating below `25%` and above `75%` luminance.",
      "By around `5%/95%`, the positive dehaze effect is almost gone.",
      "Source: `src/pipeline/dehaze.rs` -> `positive_dehaze_extreme_attenuation`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Positive Dehaze Extreme Protection",
    description: "Inside the protected tonal bands, positive dehaze further softens the pull toward black and white.",
    xLabel: "Position inside the protected band from edge start to extreme.",
    yLabel: "Protection contribution before final attenuation.",
    domain: [0, 1],
    range: [0, 0.9],
    lines: [
      {
        label: "Highlight protection",
        color: "#245c73",
        fn: x => 0.82 * Math.pow(x, 1.55) + 0.16 * x * x
      },
      {
        label: "Shadow protection",
        color: "#c96d32",
        fn: x => 0.34 * Math.pow(x, 1.2) + 0.1 * x * x
      }
    ],
    notes: [
      "These are the two positive-only softening terms used inside the top/bottom `35%` bands.",
      "The viewer combines both the softening and the extra pull-damping terms for easier reading.",
      "Source: `src/pipeline/dehaze.rs` -> `positive_dehaze_contrast_factor`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Negative Dehaze Slider Response",
    description: "Negative dehaze is also non-linear, but slightly gentler than the positive side.",
    xLabel: "Absolute value of the negative dehaze slider.",
    yLabel: "Effective negative dehaze response magnitude.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Magnitude response",
        color: "#245c73",
        fn: x => Math.pow(x, 0.75)
      },
      {
        label: "Linear reference",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Used in `dehaze.rs` as `-|amount|^0.75` on the negative side.",
      "This still builds faster than linear, but less aggressively than positive dehaze.",
      "Source: `src/pipeline/dehaze.rs` -> `signed_response`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Negative Dehaze Highlight Lift",
    description: "Negative dehaze now adds a curved highlight boost in the top 35% of the luminance range.",
    xLabel: "Normalized luminance from 0.65 to 1.0.",
    yLabel: "Relative highlight-lift shape before local-strength scaling.",
    domain: [0.65, 1],
    range: [0, 1],
    lines: [
      {
        label: "Current lift curve",
        color: "#245c73",
        fn: x => {
          const t = Math.max(0, Math.min(1, (x - 0.65) / (1 - 0.65)));
          const smooth = t * t * (3 - 2 * t);
          return Math.pow(smooth, 1.75);
        }
      }
    ],
    notes: [
      "This is the curved luminance boost used only by negative dehaze highlights.",
      "The actual lift is `abs(local_strength) * 0.18 * curve * 255`.",
      "Source: `src/pipeline/dehaze.rs` -> `negative_dehaze_highlight_lift`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Local Boost Response",
    description: "The haze score itself is remapped before becoming local dehaze strength.",
    xLabel: "Raw local haze boost score from 0 to 1.",
    yLabel: "Effective local boost after remapping.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Boost response",
        color: "#245c73",
        fn: x => Math.pow(x, 0.7)
      },
      {
        label: "Linear reference",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Used as `boost^0.7` in `dehaze.rs`.",
      "Low-contrast zones become strong quickly, which makes dehaze act decisively in flatter areas.",
      "Source: `src/pipeline/dehaze.rs` -> `local_boost_response`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Reference Offset Parabola",
    description: "The dehaze local reference offset is no longer fixed. It rises from negative in dark references to positive in bright references.",
    xLabel: "Normalized local reference luminance.",
    yLabel: "Offset added to the local dehaze reference.",
    domain: [0, 1],
    range: [-3.2, 5.2],
    lines: [
      {
        label: "Offset",
        color: "#245c73",
        fn: x => -3 + (5 - (-3)) * (x * x)
      }
    ],
    notes: [
      "This is the current `local_reference_offset` parabola in `dehaze.rs`.",
      "Input is normalized local reference luminance; output is the offset applied to that reference.",
      "Source: `src/pipeline/dehaze.rs` -> `local_reference_offset`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Selective Reference Blend",
    description: "The curved dehaze reference is blended in mostly above the standard local reference, using a smoothstep transition.",
    xLabel: "Normalized position inside the transition window.",
    yLabel: "Blend factor between standard and curved reference.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Blend factor",
        color: "#245c73",
        fn: x => x * x * (3 - 2 * x)
      }
    ],
    notes: [
      "This is the `smoothstep` shape used by `blended_reference_for_value`.",
      "The real transition is centered around the standard local reference with a width of `24` luminance units.",
      "Source: `src/pipeline/dehaze.rs` -> `blended_reference_for_value` and `smoothstep`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Zone Distance Weight",
    description: "Overlapping dehaze zones contribute with a distance-based falloff. This is the active weight shape before any positive nearby-zone reduction.",
    xLabel: "Normalized distance from zone center.",
    yLabel: "Zone contribution weight for the weighted mean.",
    domain: [0, 2.5],
    range: [0, 1],
    lines: [
      {
        label: "Zone weight",
        color: "#245c73",
        fn: x => 1 / (1 + x * x * 0.55)
      }
    ],
    notes: [
      "Used in `zone_weight` in `dehaze.rs` with falloff `0.55`.",
      "Positive dehaze nearby non-covering zones are weighted by this curve and then reduced again by `0.35`.",
      "Source: `src/pipeline/dehaze.rs` -> `zone_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Dehaze",
    title: "Positive Dehaze Saturation Boost",
    description: "Positive dehaze adds a small saturation lift driven mostly by local haze boost and a little by pixel luminance.",
    xLabel: "Local haze boost score from 0 to 1.",
    yLabel: "Saturation boost contribution before local-strength scaling.",
    domain: [0, 1],
    range: [0, 0.22],
    lines: [
      {
        label: "From local boost",
        color: "#245c73",
        fn: x => x * 0.16
      },
      {
        label: "From luminance",
        color: "#c96d32",
        fn: x => x * 0.04
      }
    ],
    notes: [
      "The full positive dehaze saturation lift is `abs(local_strength) * (boost * 0.16 + luminance * 0.04)`.",
      "This graph splits the two contributing terms so you can see their relative importance.",
      "Source: `src/pipeline/dehaze.rs` -> `positive_dehaze_saturation_boost`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  }
];

const cards = document.getElementById("cards");
const template = document.getElementById("cardTemplate");

for (const curve of curves) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".card");
  const group = fragment.querySelector(".group");
  const title = fragment.querySelector("h2");
  const description = fragment.querySelector(".description");
  const canvas = fragment.querySelector("canvas");
  const xAxis = fragment.querySelector(".x-axis");
  const yAxis = fragment.querySelector(".y-axis");
  const notes = fragment.querySelector(".notes");

  group.textContent = curve.group;
  title.textContent = curve.title;
  description.textContent = curve.description;
  xAxis.innerHTML = `<strong>X axis:</strong> ${curve.xLabel}`;
  yAxis.innerHTML = `<strong>Y axis:</strong> ${curve.yLabel}`;
  notes.innerHTML = curve.notes.map(note => `<p>${note}</p>`).join("");

  drawGraph(canvas, curve);
  cards.appendChild(card);
}

function drawGraph(canvas, curve) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 24, right: 18, bottom: 34, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height, padding, curve);

  for (const line of curve.lines) {
    drawLine(ctx, padding, plotWidth, plotHeight, curve, line);
  }

  drawAxes(ctx, width, height, padding);
  drawLabels(ctx, width, height, padding, curve);
}

function drawGrid(ctx, width, height, padding, curve) {
  const steps = 5;
  ctx.strokeStyle = "#e8ddd1";
  ctx.lineWidth = 1;

  for (let i = 0; i <= steps; i += 1) {
    const x = padding.left + ((width - padding.left - padding.right) / steps) * i;
    const y = padding.top + ((height - padding.top - padding.bottom) / steps) * i;

    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function drawAxes(ctx, width, height, padding) {
  ctx.strokeStyle = "#6a5f57";
  ctx.lineWidth = 1.25;

  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.stroke();
}

function drawLabels(ctx, width, height, padding, curve) {
  ctx.fillStyle = "#6a5f57";
  ctx.font = "12px Segoe UI";

  ctx.fillText(curve.domain[0].toFixed(2), padding.left - 8, height - padding.bottom + 18);
  ctx.fillText(curve.domain[1].toFixed(2), width - padding.right - 30, height - padding.bottom + 18);
  ctx.fillText(curve.range[1].toFixed(2), 8, padding.top + 4);
  ctx.fillText(curve.range[0].toFixed(2), 8, height - padding.bottom + 4);

  let legendX = padding.left;
  const legendY = 16;
  for (const line of curve.lines) {
    ctx.fillStyle = line.color;
    ctx.fillRect(legendX, legendY - 8, 14, 4);
    ctx.fillStyle = "#6a5f57";
    ctx.fillText(line.label, legendX + 20, legendY);
    legendX += ctx.measureText(line.label).width + 52;
  }
}

function drawLine(ctx, padding, plotWidth, plotHeight, curve, line) {
  const samples = 240;
  ctx.strokeStyle = line.color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const xValue = lerp(curve.domain[0], curve.domain[1], t);
    const yValue = line.fn(xValue);
    const x = padding.left + t * plotWidth;
    const y = padding.top + (1 - normalize(yValue, curve.range[0], curve.range[1])) * plotHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function normalize(value, min, max) {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function highRangeWeight(x, activeStart, fullStart) {
  if (x < activeStart) return 0;
  if (x < fullStart) {
    return sCurve(normalizeClamped(x, activeStart, fullStart));
  }
  return 1;
}

function lowRangeWeight(x, fullEnd, activeEnd) {
  if (x <= fullEnd) return 1;
  if (x <= activeEnd) {
    return sCurve(1 - normalizeClamped(x, fullEnd, activeEnd));
  }
  return 0;
}

function middleRangeWeight(x, activeStart, fullStart, fullEnd, activeEnd) {
  return Math.min(
    highRangeWeight(x, activeStart, fullStart),
    lowRangeWeight(x, fullEnd, activeEnd)
  );
}

function sCurve(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function normalizeClamped(value, min, max) {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
