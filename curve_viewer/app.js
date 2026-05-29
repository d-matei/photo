const curves = [
  {
    group: "Tonal Ranges",
    title: "Basic Tone Influence Masks",
    description: "Whites, Highlights, Shadows, and Blacks use luminance masks with strong zones and soft S-curve falloffs.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much each tonal slider affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    markers: [
      { label: "Red", x: 0, color: "#c73a32" },
      { label: "Orange", x: 30, color: "#d47a2c" },
      { label: "Yellow", x: 60, color: "#c9ad2f" },
      { label: "Green", x: 120, color: "#5f9b42" },
      { label: "Aqua", x: 180, color: "#2aa49a" },
      { label: "Blue", x: 240, color: "#376ab5" },
      { label: "Purple", x: 270, color: "#7352aa" },
      { label: "Magenta", x: 300, color: "#b348a3" },
      { label: "Pink", x: 330, color: "#cf5d78" }
    ],
    lines: [
      {
        label: "Blacks",
        color: "#245c73",
        fn: x => lowRangeWeight(x, 0.18, 0.40)
      },
      {
        label: "Shadows",
        color: "#c96d32",
        fn: x => middleRangeWeight(x, 0.08, 0.22, 0.38, 0.55)
      },
      {
        label: "Highlights",
        color: "#7c9b3d",
        fn: x => middleRangeWeight(x, 0.45, 0.62, 0.78, 0.92)
      },
      {
        label: "Whites",
        color: "#9c5ca8",
        fn: x => highRangeWeight(x, 0.60, 0.82)
      }
    ],
    notes: [
      "Blacks strong zone: `0%..18%`; falloff: `18%..40%`.",
      "Shadows strong zone: `22%..38%`; falloffs: `8%..22%` and `38%..55%`.",
      "Highlights strong zone: `62%..78%`; falloffs: `45%..62%` and `78%..92%`.",
      "Whites strong zone: `82%..100%`; falloff: `60%..82%`.",
      "Source: `src/pipeline/tonal_ranges.rs` -> `blacks_weight`, `shadows_weight`, `highlights_weight`, `whites_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Exposure",
    title: "Exposure Channel Transfer",
    description: "Exposure currently shifts every RGB channel by the same slider amount and clips the result to the valid 0..255 range.",
    xLabel: "Original channel value normalized from 0 = black to 1 = white.",
    yLabel: "Adjusted channel value normalized from 0 = black to 1 = white.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Exposure +50",
        color: "#245c73",
        fn: x => clamp01(x + 50 / 255)
      },
      {
        label: "Exposure -50",
        color: "#c96d32",
        fn: x => clamp01(x - 50 / 255)
      },
      {
        label: "Unchanged",
        color: "#7c9b3d",
        fn: x => x
      }
    ],
    notes: [
      "Formula: `new_channel = old_channel + slider_value`, clipped to `0..255`.",
      "The graph uses `+50` and `-50` as examples.",
      "Source: `src/pipeline/exposure.rs` -> `adjust_exposure_value`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Saturation",
    title: "Saturation Slider Response",
    description: "Saturation changes the distance between each channel and the luminance-weighted grayscale reference.",
    xLabel: "Saturation slider value.",
    yLabel: "Distance-from-gray multiplier.",
    domain: [-1, 1],
    range: [0, 2],
    lines: [
      {
        label: "Scale",
        color: "#245c73",
        fn: x => Math.max(0, 1 + x)
      }
    ],
    notes: [
      "Formula: `gray = 0.299R + 0.587G + 0.114B`.",
      "Formula: `new_channel = gray + (old_channel - gray) * (1 + slider)`.",
      "`-1` fully desaturates to grayscale; `0` is unchanged; `1` doubles distance from gray.",
      "Source: `src/pipeline/saturation.rs` -> `adjust_saturation_pixel`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Grading",
    title: "Temperature And Tint Influence",
    description: "Temperature and Tint are currently simple global color-balance controls with fixed hue directions and full influence everywhere.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much Temperature/Tint affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Global influence",
        color: "#245c73",
        fn: () => 1
      }
    ],
    notes: [
      "Temperature positive direction: warm amber/orange hue around `38deg`.",
      "Temperature negative direction: cool blue hue around `220deg`.",
      "Tint positive direction: magenta hue around `300deg`.",
      "Tint negative direction: green hue around `120deg`.",
      "This is intentionally a simple first model, not a physically accurate RAW white-balance transform.",
      "Source: `src/pipeline/color_balance.rs`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Grading",
    title: "Temperature And Tint Strength",
    description: "Temperature and Tint use a simple linear slider response before adding their fixed hue direction.",
    xLabel: "Absolute Temperature/Tint slider value.",
    yLabel: "Maximum per-channel color shift in 8-bit channel units.",
    domain: [0, 100],
    range: [0, 48],
    lines: [
      {
        label: "Current strength",
        color: "#245c73",
        fn: x => x / 100 * 48
      }
    ],
    notes: [
      "Current max shift is `48` channel units at slider value `100`.",
      "The hue direction depends on slider sign: warm/cool for Temperature, magenta/green for Tint.",
      "Source: `src/pipeline/color_balance.rs` -> `MAX_COLOR_BALANCE_SHIFT`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Grading",
    title: "Hue To RGB Coefficients",
    description: "Color grading, temperature/tint, and color balance convert a selected hue into RGB channel coefficients.",
    xLabel: "Hue angle in degrees.",
    yLabel: "RGB coefficient from 0 to 1.",
    domain: [0, 360],
    range: [0, 1],
    lines: [
      {
        label: "Red coefficient",
        color: "#c73a32",
        fn: x => hueCoefficient(x).r
      },
      {
        label: "Green coefficient",
        color: "#5f9b42",
        fn: x => hueCoefficient(x).g
      },
      {
        label: "Blue coefficient",
        color: "#376ab5",
        fn: x => hueCoefficient(x).b
      }
    ],
    notes: [
      "`0deg` = red, `60deg` = yellow, `120deg` = green, `180deg` = cyan, `240deg` = blue, `300deg` = magenta.",
      "These coefficients are multiplied by intensity and added to RGB channels.",
      "Source: `src/pipeline/color_grading.rs` and `src/pipeline/color_balance.rs` -> `hue_to_rgb_coefficients`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Mixer",
    title: "Color Mixer Hue Zone Masks",
    description: "The HSL mixer uses 9 overlapping hue zones. Each zone peaks at its named hue and falls with an S curve slightly past neighboring hue centers.",
    xLabel: "Hue angle in degrees around the color wheel.",
    yLabel: "How much each color mixer zone affects that hue.",
    domain: [0, 360],
    range: [0, 1],
    lines: [
      {
        label: "Red",
        color: "#c73a32",
        fn: x => colorMixerZoneWeight(x, 0)
      },
      {
        label: "Orange",
        color: "#d47a2c",
        fn: x => colorMixerZoneWeight(x, 1)
      },
      {
        label: "Yellow",
        color: "#c9ad2f",
        fn: x => colorMixerZoneWeight(x, 2)
      },
      {
        label: "Green",
        color: "#5f9b42",
        fn: x => colorMixerZoneWeight(x, 3)
      },
      {
        label: "Aqua",
        color: "#2aa49a",
        fn: x => colorMixerZoneWeight(x, 4)
      },
      {
        label: "Blue",
        color: "#376ab5",
        fn: x => colorMixerZoneWeight(x, 5)
      },
      {
        label: "Purple",
        color: "#7352aa",
        fn: x => colorMixerZoneWeight(x, 6)
      },
      {
        label: "Magenta",
        color: "#b348a3",
        fn: x => colorMixerZoneWeight(x, 7)
      },
      {
        label: "Pink",
        color: "#cf5d78",
        fn: x => colorMixerZoneWeight(x, 8)
      }
    ],
    notes: [
      "Zone centers: Red `0deg`, Orange `30deg`, Yellow `60deg`, Green `120deg`, Aqua `180deg`, Blue `240deg`, Purple `270deg`, Magenta `300deg`, Pink `330deg`.",
      "Each zone extends `20%` past the neighboring center on both sides, so adjacent colors blend more softly.",
      "The hue slider moves each center toward its neighboring centers: for example Yellow at `-100` moves to Orange, and Yellow at `100` moves to Green.",
      "Source: `src/pipeline/color_mixer.rs` -> `zone_weight` and `hue_shift_for_zone`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Grading",
    title: "Color Grading Zone Masks",
    description: "The color grading masks use 5% S-curve falloffs, while the global mask keeps nearly full influence across the whole image.",
    xLabel: "Pixel luminance normalized from 0 = black to 1 = white.",
    yLabel: "How much each color grading zone affects that luminance.",
    domain: [0, 1],
    range: [0, 1],
    controls: [
      {
        key: "referenceShift",
        label: "Color reference",
        min: -100,
        max: 100,
        value: 0,
        format: value => {
          const coefficient = colorReferenceCoefficient(value);
          return `${value.toFixed(0)} (${coefficient.toFixed(2)}x)`;
        }
      }
    ],
    lines: [
      {
        label: "Global",
        color: "#9c5ca8",
        fn: x => colorGradingGlobalWeight(x)
      },
      {
        label: "Shadows",
        color: "#245c73",
        fn: (x, state) => colorGradingShadowsWeight(x, colorReferenceCoefficient(state.referenceShift))
      },
      {
        label: "Midtones",
        color: "#c96d32",
        fn: (x, state) => colorGradingMidtonesWeight(x, colorReferenceCoefficient(state.referenceShift))
      },
      {
        label: "Highlights",
        color: "#7c9b3d",
        fn: (x, state) => colorGradingHighlightsWeight(x, colorReferenceCoefficient(state.referenceShift))
      }
    ],
    notes: [
      "Global: peaks at `50%` luminance and falls with an S-shaped curve to about `86%` influence at `0%` and `100%`.",
      "Shadows: max zone `0%..32%`, strongest at `0%`, gently slopes down to `90%` influence at `32%`.",
      "Midtones: max zone `34%..66%`, strongest at `50%`, gently slopes down to `90%` influence at both edges.",
      "Highlights: max zone `68%..100%`, strongest at `100%`, gently slopes down to `90%` influence at `68%`.",
      "All outer boundaries use 5% S-curve falloffs: shadows `32%..37%`, midtones `29%..34%` and `66%..71%`, highlights `63%..68%`.",
      "The color reference slider multiplies every luminance boundary by `2^(slider / 100)`, so `-100 = 0.5x`, `0 = 1.0x`, `100 = 2.0x`.",
      "Source: `src/pipeline/color_grading.rs` -> `shadows_weight`, `midtones_weight`, `highlights_weight`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Grading",
    title: "Color Grading Reference Slider Response",
    description: "The color grading reference slider turns into a multiplier that shifts all color grading luminance-zone boundaries.",
    xLabel: "Color Reference slider value.",
    yLabel: "Boundary multiplier.",
    domain: [-100, 100],
    range: [0.5, 2],
    lines: [
      {
        label: "Coefficient",
        color: "#245c73",
        fn: x => colorReferenceCoefficient(x)
      }
    ],
    notes: [
      "Formula: `coefficient = 2^(slider / 100)`.",
      "`-100 = 0.5x`, `0 = 1.0x`, `100 = 2.0x`.",
      "Source: `src/pipeline/color_grading.rs` -> `reference_shift_to_coefficient`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Mixer",
    title: "Color Mixer Hue Slider Response",
    description: "The Color Mixer hue slider moves a pure zone-center color toward its previous or next neighboring zone center.",
    xLabel: "Hue slider value.",
    yLabel: "Hue shift in degrees.",
    domain: [-100, 100],
    range: [-60, 60],
    lines: [
      {
        label: "Yellow zone",
        color: "#c9ad2f",
        fn: x => colorMixerHueShift(2, x)
      },
      {
        label: "Green zone",
        color: "#5f9b42",
        fn: x => colorMixerHueShift(3, x)
      },
      {
        label: "Blue zone",
        color: "#376ab5",
        fn: x => colorMixerHueShift(5, x)
      },
      {
        label: "Red zone",
        color: "#c73a32",
        fn: x => colorMixerHueShift(0, x)
      }
    ],
    notes: [
      "Different zones can have different degree ranges because the 9 color centers are not evenly spaced.",
      "Example: Yellow at `-100` shifts `-30deg` toward Orange; Yellow at `100` shifts `+60deg` toward Green.",
      "Source: `src/pipeline/color_mixer.rs` -> `hue_shift_for_zone`.",
      "Auto-updates with project changes: No. This viewer is a manual snapshot."
    ]
  },
  {
    group: "Color Mixer",
    title: "Color Mixer Saturation And Luminance Response",
    description: "Color Mixer Saturation and Luminance are linear slider responses, later multiplied by the hue-zone influence mask.",
    xLabel: "Color Mixer slider value.",
    yLabel: "Effective value at full zone influence.",
    domain: [-100, 100],
    range: [-100, 100],
    lines: [
      {
        label: "Luminance channel shift",
        color: "#245c73",
        fn: x => x
      },
      {
        label: "Saturation percent mapped for display",
        color: "#c96d32",
        fn: x => x
      }
    ],
    notes: [
      "Luminance uses exposure-style shift: `channel + slider * zone_weight`.",
      "Saturation uses `slider / 100 * zone_weight`, then the existing saturation formula.",
      "Both are simple linear mappings before the hue-zone mask is applied.",
      "Source: `src/pipeline/color_mixer.rs` -> `adjust_color_mixer_pixel`.",
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
    title: "Clarity Slider Response",
    description: "Positive and negative clarity use different response powers, so they are easiest to compare on the same absolute slider-strength graph.",
    xLabel: "Absolute clarity slider value.",
    yLabel: "Effective clarity response magnitude.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Positive clarity",
        color: "#245c73",
        fn: x => Math.pow(x, 0.58)
      },
      {
        label: "Negative clarity",
        color: "#c96d32",
        fn: x => Math.pow(x, 0.75)
      },
      {
        label: "Linear reference",
        color: "#7c9b3d",
        fn: x => x
      }
    ],
    notes: [
      "Positive clarity uses `amount^0.58`, so it builds faster than linear.",
      "Negative clarity uses `-|amount|^0.75`, also faster than linear but gentler than positive clarity.",
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
    title: "Dehaze Slider Response",
    description: "Positive and negative dehaze both use non-linear response curves, with the positive side slightly more aggressive.",
    xLabel: "Absolute dehaze slider value.",
    yLabel: "Effective dehaze response magnitude.",
    domain: [0, 1],
    range: [0, 1],
    lines: [
      {
        label: "Positive dehaze",
        color: "#245c73",
        fn: x => Math.pow(x, 0.74)
      },
      {
        label: "Negative dehaze",
        color: "#c96d32",
        fn: x => Math.pow(x, 0.75)
      },
      {
        label: "Linear reference",
        color: "#7c9b3d",
        fn: x => x
      }
    ],
    notes: [
      "Positive dehaze uses `amount^0.74`.",
      "Negative dehaze uses `-|amount|^0.75`.",
      "Both build faster than linear; positive is very slightly more aggressive.",
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
  const state = {};

  group.textContent = curve.group;
  title.textContent = curve.title;
  description.textContent = curve.description;
  xAxis.innerHTML = `<strong>X axis:</strong> ${curve.xLabel}`;
  yAxis.innerHTML = `<strong>Y axis:</strong> ${curve.yLabel}`;
  notes.innerHTML = curve.notes.map(note => `<p>${note}</p>`).join("");

  if (curve.controls) {
    const controls = buildCurveControls(curve, state, () => drawGraph(canvas, curve, state));
    canvas.before(controls);
  }

  drawGraph(canvas, curve, state);
  cards.appendChild(card);
}

function buildCurveControls(curve, state, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "curve-controls";

  for (const control of curve.controls) {
    state[control.key] = control.value;

    const row = document.createElement("label");
    row.className = "curve-control";

    const name = document.createElement("span");
    name.textContent = control.label;

    const value = document.createElement("strong");
    value.textContent = control.format(control.value);

    const input = document.createElement("input");
    input.type = "range";
    input.min = control.min;
    input.max = control.max;
    input.value = control.value;

    input.addEventListener("input", () => {
      state[control.key] = Number(input.value);
      value.textContent = control.format(state[control.key]);
      onChange();
    });

    row.append(name, input, value);
    wrapper.appendChild(row);
  }

  return wrapper;
}

function drawGraph(canvas, curve, state = {}) {
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
    drawLine(ctx, padding, plotWidth, plotHeight, curve, line, state);
  }

  if (curve.markers) {
    drawMarkers(ctx, padding, plotWidth, plotHeight, curve);
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

function drawLine(ctx, padding, plotWidth, plotHeight, curve, line, state) {
  const samples = 240;
  ctx.strokeStyle = line.color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const xValue = lerp(curve.domain[0], curve.domain[1], t);
    const yValue = line.fn(xValue, state);
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

function drawMarkers(ctx, padding, plotWidth, plotHeight, curve) {
  ctx.save();
  ctx.lineWidth = 2;

  for (const marker of curve.markers) {
    const t = normalize(marker.x, curve.domain[0], curve.domain[1]);
    const x = padding.left + t * plotWidth;
    const bandWidth = 18;

    ctx.fillStyle = `${marker.color}22`;
    ctx.fillRect(x - bandWidth / 2, padding.top, bandWidth, plotHeight);

    ctx.strokeStyle = marker.color;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotHeight);
    ctx.stroke();

    ctx.fillStyle = marker.color;
    ctx.beginPath();
    ctx.arc(x, padding.top + 6, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6a5f57";
    ctx.font = "11px Segoe UI";
    ctx.fillText(marker.label, x - ctx.measureText(marker.label).width / 2, padding.top - 6);
    ctx.fillText(marker.label, x - ctx.measureText(marker.label).width / 2, padding.top + plotHeight + 16);
  }

  ctx.restore();
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

function colorGradingHighlightsWeight(x, referenceCoefficient = 1) {
  x = clamp01(x);
  const falloffStart = scaledReferencePoint(0.63, referenceCoefficient);
  const fullStart = scaledReferencePoint(0.68, referenceCoefficient);
  const peak = scaledReferencePoint(1, referenceCoefficient);
  if (x < falloffStart) return 0;
  if (x < fullStart) return 0.9 * sCurve(normalizeClamped(x, falloffStart, fullStart));
  return 0.9 + 0.1 * normalizeClamped(x, fullStart, peak);
}

function colorGradingMidtonesWeight(x, referenceCoefficient = 1) {
  x = clamp01(x);
  const falloffStart = scaledReferencePoint(0.29, referenceCoefficient);
  const fullStart = scaledReferencePoint(0.34, referenceCoefficient);
  const peak = scaledReferencePoint(0.50, referenceCoefficient);
  const fullEnd = scaledReferencePoint(0.66, referenceCoefficient);
  const falloffEnd = scaledReferencePoint(0.71, referenceCoefficient);
  if (x < falloffStart) return 0;
  if (x < fullStart) return 0.9 * sCurve(normalizeClamped(x, falloffStart, fullStart));
  if (x <= peak) return 0.9 + 0.1 * normalizeClamped(x, fullStart, peak);
  if (x <= fullEnd) return 0.9 + 0.1 * (1 - normalizeClamped(x, peak, fullEnd));
  if (x <= falloffEnd) return 0.9 * sCurve(1 - normalizeClamped(x, fullEnd, falloffEnd));
  return 0;
}

function colorGradingShadowsWeight(x, referenceCoefficient = 1) {
  x = clamp01(x);
  const peak = scaledReferencePoint(0, referenceCoefficient);
  const fullEnd = scaledReferencePoint(0.32, referenceCoefficient);
  const falloffEnd = scaledReferencePoint(0.37, referenceCoefficient);
  if (x <= fullEnd) return 0.9 + 0.1 * (1 - normalizeClamped(x, peak, fullEnd));
  if (x <= falloffEnd) return 0.9 * sCurve(1 - normalizeClamped(x, fullEnd, falloffEnd));
  return 0;
}

function colorGradingGlobalWeight(x) {
  const distanceFromMidpoint = Math.abs(clamp01(x) - 0.5) / 0.5;
  return 1 - (1 - 0.86) * sCurve(distanceFromMidpoint);
}

function hueCoefficient(hueDegrees) {
  const hue = wrapHue(hueDegrees);
  const chroma = 1;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));

  if (hue < 60) return { r: chroma, g: x, b: 0 };
  if (hue < 120) return { r: x, g: chroma, b: 0 };
  if (hue < 180) return { r: 0, g: chroma, b: x };
  if (hue < 240) return { r: 0, g: x, b: chroma };
  if (hue < 300) return { r: x, g: 0, b: chroma };
  return { r: chroma, g: 0, b: x };
}

const colorMixerZoneCenters = [0, 30, 60, 120, 180, 240, 270, 300, 330];
const colorMixerExtraOverlap = 0.20;

function colorMixerZoneWeight(hue, zoneIndex) {
  const previous = colorMixerZoneCenters[previousColorMixerZoneIndex(zoneIndex)];
  const center = colorMixerZoneCenters[zoneIndex];
  const next = colorMixerZoneCenters[nextColorMixerZoneIndex(zoneIndex)];
  const signedDistance = signedHueDistance(center, wrapHue(hue));

  if (signedDistance < 0) {
    const previousDistance = expandedColorMixerDistance(clockwiseHueDistance(previous, center));
    return sCurve(1 - Math.min(1, Math.abs(signedDistance) / previousDistance));
  }

  const nextDistance = expandedColorMixerDistance(clockwiseHueDistance(center, next));
  return sCurve(1 - Math.min(1, signedDistance / nextDistance));
}

function expandedColorMixerDistance(distance) {
  return Math.max(1, distance * (1 + colorMixerExtraOverlap));
}

function colorMixerHueShift(zoneIndex, sliderValue) {
  const slider = Math.max(-100, Math.min(100, sliderValue)) / 100;
  const center = colorMixerZoneCenters[zoneIndex];

  if (slider > 0) {
    return clockwiseHueDistance(center, colorMixerZoneCenters[nextColorMixerZoneIndex(zoneIndex)]) * slider;
  }
  if (slider < 0) {
    return -clockwiseHueDistance(colorMixerZoneCenters[previousColorMixerZoneIndex(zoneIndex)], center) * Math.abs(slider);
  }
  return 0;
}

function previousColorMixerZoneIndex(zoneIndex) {
  return zoneIndex === 0 ? colorMixerZoneCenters.length - 1 : zoneIndex - 1;
}

function nextColorMixerZoneIndex(zoneIndex) {
  return (zoneIndex + 1) % colorMixerZoneCenters.length;
}

function clockwiseHueDistance(from, to) {
  return (to - from + 360) % 360 || 360;
}

function signedHueDistance(center, hue) {
  const distance = (hue - center + 360) % 360;
  return distance > 180 ? distance - 360 : distance;
}

function wrapHue(hue) {
  return ((hue % 360) + 360) % 360;
}

function colorReferenceCoefficient(referenceShift) {
  return Math.pow(2, Math.max(-100, Math.min(100, referenceShift)) / 100);
}

function scaledReferencePoint(point, referenceCoefficient) {
  return point * Math.max(0.5, Math.min(2, referenceCoefficient));
}

function sCurve(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function normalizeClamped(value, min, max) {
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}
