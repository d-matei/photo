/*!
Dehaze Adjustment Idea

- Dehaze looks for locally flat, low-contrast image areas that may feel hazy.
- The image is split into overlapping square analysis windows.
  * both directions currently use the larger positive-style window size by default
    (32px with the current config)
  * the overlap is 75% of the window size horizontally
  * the overlap is 75% of the window size vertically
  * this means a pixel can be influenced by multiple neighboring windows in each direction
- Each window is scored on the original, unmodified image.
  * compute the mean luminance inside the window
  * compute the sum of absolute deltas between each pixel luminance and that window mean
  * low score means low local contrast and more haze-like behavior
- The lower the score, the more boost is assigned to that area.
- Each pixel receives the average boost of the windows that cover it.
- Each pixel also receives a blended local contrast reference from the mean luminance
  of the windows that cover it.
- The blend is distance-weighted:
  * windows whose centers are closer to the current pixel contribute more
  * windows farther away contribute less
  * this softens grid transitions compared with a simple mean
  * nearby windows that do not directly cover the pixel
    can also contribute with a weaker distance-weighted influence to avoid an
    oversharpened look
  * the reference baseline can be unified to the global
    mean luminance of the whole image instead of varying per zone
- That local boost is then used to apply signed adjustments:
  * positive dehaze adds positive contrast
  * negative dehaze adds negative contrast
  * for positive dehaze, the internal contrast is softened in highlights and a little in shadows
  * the local contrast reference uses a luminance-shaped offset:
    it starts around -3 in darker zones and rises toward +5 in the brightest zones
  * that curved reference is blended in mainly for tones above the standard
    local reference, with a soft transition around the boundary
  * negative dehaze also raises the local internal contrast reference to favor brighter glow around highlights
  * negative dehaze also adds a small direct highlight lift
  * the final contrast is applied per RGB channel, then the channels are
    recombined into the final pixel
  * positive dehaze also adds a small saturation lift driven mostly by the
    local haze score and a bit by the current pixel luminance
  * negative dehaze does not add any explicit saturation change

This keeps the dehaze effect local and adaptive instead of adding the same amount everywhere.
*/

use crate::pipeline::color::RgbPixel;
use crate::pipeline::contrast::{adjust_contrast_value, ContrastConfig};
use crate::pipeline::saturation::adjust_saturation_pixel;

const LOCAL_BOOST_RESPONSE_EXPONENT: f32 = 0.7;
const POSITIVE_DEHAZE_CONTRAST_RESPONSE_MULTIPLIER: f32 = 1.12;
const NEGATIVE_DEHAZE_CONTRAST_RESPONSE_MULTIPLIER: f32 = 1.45;
const LOCAL_REFERENCE_OFFSET_DARK: f32 = -3.0;
const LOCAL_REFERENCE_OFFSET_BRIGHT: f32 = 5.0;
const LOCAL_REFERENCE_TRANSITION_WIDTH: f32 = 24.0;
const DEHAZE_ZONE_WEIGHT_FALLOFF: f32 = 0.55;
const POSITIVE_DEHAZE_NEARBY_ZONE_RADIUS_SCALE: f32 = 1.75;
const POSITIVE_DEHAZE_NEARBY_ZONE_WEIGHT_SCALE: f32 = 0.35;
const POSITIVE_DEHAZE_RESPONSE_EXPONENT: f32 = 0.74;
const NEGATIVE_DEHAZE_RESPONSE_EXPONENT: f32 = 0.75;
const POSITIVE_DEHAZE_HIGHLIGHT_SOFTENING_STRENGTH: f32 = 0.82;
const POSITIVE_DEHAZE_HIGHLIGHT_SOFTENING_EXPONENT: f32 = 1.55;
const POSITIVE_DEHAZE_SHADOW_SOFTENING_STRENGTH: f32 = 0.34;
const POSITIVE_DEHAZE_SHADOW_SOFTENING_EXPONENT: f32 = 1.2;
const POSITIVE_DEHAZE_EXTREME_RANGE: f32 = 0.35;
const POSITIVE_DEHAZE_HIGHLIGHT_PULL_DAMPING: f32 = 0.16;
const POSITIVE_DEHAZE_SHADOW_PULL_DAMPING: f32 = 0.1;
const POSITIVE_DEHAZE_MIN_CONTRAST_FACTOR: f32 = 0.12;
const POSITIVE_DEHAZE_ATTENUATION_START_LOW: f32 = 0.25;
const POSITIVE_DEHAZE_ATTENUATION_NEAR_ZERO_LOW: f32 = 0.05;
const POSITIVE_DEHAZE_ATTENUATION_START_HIGH: f32 = 0.75;
const POSITIVE_DEHAZE_ATTENUATION_NEAR_ZERO_HIGH: f32 = 0.95;
const NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_STRENGTH: f32 = 0.18;
const NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_START: f32 = 0.65;
const NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_EXPONENT: f32 = 1.75;
const POSITIVE_DEHAZE_SATURATION_FROM_BOOST: f32 = 0.16;
const POSITIVE_DEHAZE_SATURATION_FROM_LUMINANCE: f32 = 0.04;

#[derive(Debug, Clone, Copy)]
pub struct DehazeConfig {
    pub block_size: usize,
    pub contrast_boost: f32,
    pub negative_contrast_reference_offset: f32,
    pub positive_saturation_boost: f32,
    pub positive_uses_global_reference: bool,
}

impl Default for DehazeConfig {
    fn default() -> Self {
        Self {
            block_size: 16,
            contrast_boost: 0.9,
            negative_contrast_reference_offset: 28.0,
            positive_saturation_boost: 1.0,
            positive_uses_global_reference: true,
        }
    }
}

pub fn apply_dehaze_rgb(
    pixels: &[RgbPixel],
    analysis_pixels: &[RgbPixel],
    width: usize,
    height: usize,
    amount: f32,
    config: DehazeConfig,
    contrast_config: ContrastConfig,
) -> Vec<RgbPixel> {
    if amount == 0.0 || pixels.is_empty() || analysis_pixels.is_empty() || width == 0 || height == 0
    {
        return pixels.to_vec();
    }

    let width = width.min(pixels.len());
    let height = height.min(pixels.len() / width.max(1));
    let analysis_width = width.min(analysis_pixels.len());
    let analysis_height = height.min(analysis_pixels.len() / analysis_width.max(1));
    let effective_block_size = dehaze_block_size(amount, config.block_size);
    let include_nearby_zones = true;
    let global_reference = if config.positive_uses_global_reference {
        Some(global_mean_luminance(
            analysis_pixels,
            analysis_width,
            analysis_height,
        ))
    } else {
        None
    };
    let analysis_map = build_local_analysis_map(
        analysis_pixels,
        analysis_width,
        analysis_height,
        effective_block_size,
        include_nearby_zones,
        global_reference,
    );

    pixels
        .iter()
        .zip(analysis_map.iter())
        .map(|(&pixel, analysis)| {
            let local_strength = signed_response(amount) * local_boost_response(analysis.boost);
            apply_local_dehaze(
                pixel,
                local_strength,
                analysis.boost,
                analysis.reference,
                config,
                contrast_config,
            )
        })
        .collect()
}

fn apply_local_dehaze(
    pixel: RgbPixel,
    local_strength: f32,
    local_boost: f32,
    local_reference: f32,
    config: DehazeConfig,
    contrast_config: ContrastConfig,
) -> RgbPixel {
    if local_strength == 0.0 {
        return pixel;
    }

    let response_multiplier = if local_strength > 0.0 {
        POSITIVE_DEHAZE_CONTRAST_RESPONSE_MULTIPLIER
    } else {
        NEGATIVE_DEHAZE_CONTRAST_RESPONSE_MULTIPLIER
    };
    let contrast_slider = local_strength * config.contrast_boost * response_multiplier;
    let standard_reference = local_reference.clamp(0.0, 255.0);
    let curved_reference =
        (local_reference + local_reference_offset(local_reference)).clamp(0.0, 255.0);
    let contrast_adjusted = RgbPixel {
        r: dehaze_channel(
            pixel.r,
            contrast_slider,
            local_strength,
            standard_reference,
            curved_reference,
            config,
            contrast_config,
        ),
        g: dehaze_channel(
            pixel.g,
            contrast_slider,
            local_strength,
            standard_reference,
            curved_reference,
            config,
            contrast_config,
        ),
        b: dehaze_channel(
            pixel.b,
            contrast_slider,
            local_strength,
            standard_reference,
            curved_reference,
            config,
            contrast_config,
        ),
    };
    let saturation_adjustment = if local_strength > 0.0 {
        positive_dehaze_saturation_boost(pixel, local_strength, local_boost)
            * config.positive_saturation_boost
    } else {
        0.0
    };
    let highlight_lift = if local_strength < 0.0 {
        negative_dehaze_highlight_lift(contrast_adjusted, local_strength)
    } else {
        0.0
    };

    adjust_saturation_pixel(
        RgbPixel {
            r: ((contrast_adjusted.r as f32) + highlight_lift).clamp(0.0, 255.0) as u8,
            g: ((contrast_adjusted.g as f32) + highlight_lift).clamp(0.0, 255.0) as u8,
            b: ((contrast_adjusted.b as f32) + highlight_lift).clamp(0.0, 255.0) as u8,
        },
        saturation_adjustment,
    )
}

fn dehaze_channel(
    channel: u8,
    contrast_slider: f32,
    local_strength: f32,
    standard_reference: f32,
    curved_reference: f32,
    config: DehazeConfig,
    contrast_config: ContrastConfig,
) -> u8 {
    let base_reference =
        blended_reference_for_value(channel as f32, standard_reference, curved_reference);
    let effective_contrast_config = if local_strength < 0.0 {
        ContrastConfig {
            reference: (base_reference + config.negative_contrast_reference_offset)
                .clamp(0.0, 255.0),
            ..contrast_config
        }
    } else {
        ContrastConfig {
            reference: base_reference,
            ..contrast_config
        }
    };

    let effective_slider = if contrast_slider > 0.0 {
        contrast_slider * positive_dehaze_contrast_factor(channel as f32)
    } else {
        contrast_slider
    };

    adjust_contrast_value(channel, effective_slider, effective_contrast_config)
}

fn positive_dehaze_contrast_factor(channel_value: f32) -> f32 {
    let normalized = (channel_value / 255.0).clamp(0.0, 1.0);
    let highlight_zone = if normalized > 1.0 - POSITIVE_DEHAZE_EXTREME_RANGE {
        ((normalized - (1.0 - POSITIVE_DEHAZE_EXTREME_RANGE)) / POSITIVE_DEHAZE_EXTREME_RANGE)
            .clamp(0.0, 1.0)
    } else {
        0.0
    };
    let shadow_zone = if normalized < POSITIVE_DEHAZE_EXTREME_RANGE {
        ((POSITIVE_DEHAZE_EXTREME_RANGE - normalized) / POSITIVE_DEHAZE_EXTREME_RANGE)
            .clamp(0.0, 1.0)
    } else {
        0.0
    };
    let highlight_softening = POSITIVE_DEHAZE_HIGHLIGHT_SOFTENING_STRENGTH
        * highlight_zone.powf(POSITIVE_DEHAZE_HIGHLIGHT_SOFTENING_EXPONENT);
    let shadow_softening = POSITIVE_DEHAZE_SHADOW_SOFTENING_STRENGTH
        * shadow_zone.powf(POSITIVE_DEHAZE_SHADOW_SOFTENING_EXPONENT);
    let highlight_pull_damping =
        POSITIVE_DEHAZE_HIGHLIGHT_PULL_DAMPING * highlight_zone * highlight_zone;
    let shadow_pull_damping = POSITIVE_DEHAZE_SHADOW_PULL_DAMPING * shadow_zone * shadow_zone;
    let attenuation = positive_dehaze_extreme_attenuation(normalized);

    ((1.0 - highlight_softening - shadow_softening - highlight_pull_damping - shadow_pull_damping)
        * attenuation)
        .clamp(POSITIVE_DEHAZE_MIN_CONTRAST_FACTOR, 1.0)
}

fn positive_dehaze_extreme_attenuation(normalized: f32) -> f32 {
    let low_attenuation = if normalized < POSITIVE_DEHAZE_ATTENUATION_START_LOW {
        let t = ((normalized - POSITIVE_DEHAZE_ATTENUATION_NEAR_ZERO_LOW)
            / (POSITIVE_DEHAZE_ATTENUATION_START_LOW - POSITIVE_DEHAZE_ATTENUATION_NEAR_ZERO_LOW))
            .clamp(0.0, 1.0);
        smoothstep(0.0, 1.0, t)
    } else {
        1.0
    };
    let high_attenuation = if normalized > POSITIVE_DEHAZE_ATTENUATION_START_HIGH {
        let t = ((POSITIVE_DEHAZE_ATTENUATION_NEAR_ZERO_HIGH - normalized)
            / (POSITIVE_DEHAZE_ATTENUATION_NEAR_ZERO_HIGH
                - POSITIVE_DEHAZE_ATTENUATION_START_HIGH))
            .clamp(0.0, 1.0);
        smoothstep(0.0, 1.0, t)
    } else {
        1.0
    };

    low_attenuation.min(high_attenuation)
}

fn positive_dehaze_saturation_boost(pixel: RgbPixel, local_strength: f32, local_boost: f32) -> f32 {
    let luminance_weight = (luminance(pixel) / 255.0).clamp(0.0, 1.0);
    local_strength.abs()
        * (local_boost * POSITIVE_DEHAZE_SATURATION_FROM_BOOST
            + luminance_weight * POSITIVE_DEHAZE_SATURATION_FROM_LUMINANCE)
}

fn negative_dehaze_highlight_lift(pixel: RgbPixel, local_strength: f32) -> f32 {
    let normalized = (luminance(pixel) / 255.0).clamp(0.0, 1.0);
    let highlight_zone = if normalized > NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_START {
        ((normalized - NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_START)
            / (1.0 - NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_START))
            .clamp(0.0, 1.0)
    } else {
        0.0
    };
    let curved_highlight_zone =
        smoothstep(0.0, 1.0, highlight_zone).powf(NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_EXPONENT);

    local_strength.abs() * NEGATIVE_DEHAZE_HIGHLIGHT_LIFT_STRENGTH * curved_highlight_zone * 255.0
}

fn signed_response(amount: f32) -> f32 {
    if amount > 0.0 {
        amount.powf(POSITIVE_DEHAZE_RESPONSE_EXPONENT)
    } else {
        -amount.abs().powf(NEGATIVE_DEHAZE_RESPONSE_EXPONENT)
    }
}

fn local_boost_response(boost: f32) -> f32 {
    boost.clamp(0.0, 1.0).powf(LOCAL_BOOST_RESPONSE_EXPONENT)
}

fn dehaze_block_size(amount: f32, base_block_size: usize) -> usize {
    let _ = amount;
    base_block_size.saturating_mul(2)
}

fn local_reference_offset(local_reference: f32) -> f32 {
    let normalized = (local_reference / 255.0).clamp(0.0, 1.0);
    let parabola = normalized * normalized;

    LOCAL_REFERENCE_OFFSET_DARK
        + (LOCAL_REFERENCE_OFFSET_BRIGHT - LOCAL_REFERENCE_OFFSET_DARK) * parabola
}

fn blended_reference_for_value(
    pixel_value: f32,
    standard_reference: f32,
    curved_reference: f32,
) -> f32 {
    let start = standard_reference - LOCAL_REFERENCE_TRANSITION_WIDTH * 0.5;
    let end = standard_reference + LOCAL_REFERENCE_TRANSITION_WIDTH * 0.5;
    let blend = smoothstep(start, end, pixel_value);

    (standard_reference * (1.0 - blend) + curved_reference * blend).clamp(0.0, 255.0)
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    if edge0 >= edge1 {
        return if x >= edge1 { 1.0 } else { 0.0 };
    }

    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[derive(Debug, Clone, Copy)]
struct LocalAnalysis {
    boost: f32,
    reference: f32,
}

fn build_local_analysis_map(
    pixels: &[RgbPixel],
    width: usize,
    height: usize,
    block_size: usize,
    include_nearby_zones: bool,
    global_reference: Option<f32>,
) -> Vec<LocalAnalysis> {
    let mut boost_sum = vec![0.0; width * height];
    let mut reference_sum = vec![0.0; width * height];
    let mut weight_sum = vec![0.0; width * height];
    let starts_x = block_starts(width, block_size);
    let starts_y = block_starts(height, block_size);

    for start_y in starts_y {
        for start_x in &starts_x {
            let analysis = block_analysis(pixels, width, height, *start_x, start_y, block_size);
            let strength = 1.0 - analysis.score;
            let end_x = (*start_x + block_size).min(width);
            let end_y = (start_y + block_size).min(height);
            let center_x = (*start_x as f32 + (end_x - *start_x) as f32 / 2.0) - 0.5;
            let center_y = (start_y as f32 + (end_y - start_y) as f32 / 2.0) - 0.5;
            let radius_x = ((end_x - *start_x) as f32 / 2.0).max(1.0);
            let radius_y = ((end_y - start_y) as f32 / 2.0).max(1.0);
            let nearby_radius_x = radius_x * POSITIVE_DEHAZE_NEARBY_ZONE_RADIUS_SCALE;
            let nearby_radius_y = radius_y * POSITIVE_DEHAZE_NEARBY_ZONE_RADIUS_SCALE;
            let near_start_x = if include_nearby_zones {
                ((center_x - nearby_radius_x).floor() as isize).max(0) as usize
            } else {
                *start_x
            };
            let near_end_x = if include_nearby_zones {
                ((center_x + nearby_radius_x).ceil() as usize + 1).min(width)
            } else {
                end_x
            };
            let near_start_y = if include_nearby_zones {
                ((center_y - nearby_radius_y).floor() as isize).max(0) as usize
            } else {
                start_y
            };
            let near_end_y = if include_nearby_zones {
                ((center_y + nearby_radius_y).ceil() as usize + 1).min(height)
            } else {
                end_y
            };
            for y in near_start_y..near_end_y {
                for x in near_start_x..near_end_x {
                    let index = y * width + x;
                    let mut weight = zone_weight(
                        x as f32,
                        y as f32,
                        center_x,
                        center_y,
                        if include_nearby_zones {
                            nearby_radius_x
                        } else {
                            radius_x
                        },
                        if include_nearby_zones {
                            nearby_radius_y
                        } else {
                            radius_y
                        },
                    );
                    let is_covering_zone = x >= *start_x && x < end_x && y >= start_y && y < end_y;
                    if include_nearby_zones && !is_covering_zone {
                        weight *= POSITIVE_DEHAZE_NEARBY_ZONE_WEIGHT_SCALE;
                    }
                    boost_sum[index] += strength * weight;
                    reference_sum[index] += global_reference.unwrap_or(analysis.mean) * weight;
                    weight_sum[index] += weight;
                }
            }
        }
    }

    boost_sum
        .into_iter()
        .zip(reference_sum)
        .zip(weight_sum)
        .map(|((boost_total, reference_total), total_weight)| {
            if total_weight == 0.0 {
                LocalAnalysis {
                    boost: 0.0,
                    reference: 128.0,
                }
            } else {
                LocalAnalysis {
                    boost: (boost_total / total_weight).clamp(0.0, 1.0),
                    reference: (reference_total / total_weight).clamp(0.0, 255.0),
                }
            }
        })
        .collect()
}

fn global_mean_luminance(pixels: &[RgbPixel], width: usize, height: usize) -> f32 {
    let count = width.saturating_mul(height);
    if count == 0 {
        return 128.0;
    }

    pixels
        .iter()
        .take(count)
        .map(|&pixel| luminance(pixel))
        .sum::<f32>()
        / count as f32
}

fn zone_weight(x: f32, y: f32, center_x: f32, center_y: f32, radius_x: f32, radius_y: f32) -> f32 {
    let dx = (x - center_x) / radius_x;
    let dy = (y - center_y) / radius_y;
    let normalized_distance = (dx * dx + dy * dy).sqrt();

    (1.0 / (1.0 + normalized_distance * normalized_distance * DEHAZE_ZONE_WEIGHT_FALLOFF))
        .clamp(0.0, 1.0)
}

#[derive(Debug, Clone, Copy)]
struct BlockAnalysis {
    mean: f32,
    score: f32,
}

fn block_analysis(
    pixels: &[RgbPixel],
    width: usize,
    height: usize,
    start_x: usize,
    start_y: usize,
    block_size: usize,
) -> BlockAnalysis {
    let end_x = (start_x + block_size).min(width);
    let end_y = (start_y + block_size).min(height);
    let mut luminances = Vec::with_capacity((end_x - start_x) * (end_y - start_y));

    for y in start_y..end_y {
        for x in start_x..end_x {
            luminances.push(luminance(pixels[y * width + x]));
        }
    }

    if luminances.is_empty() {
        return BlockAnalysis {
            mean: 128.0,
            score: 1.0,
        };
    }

    let mean = luminances.iter().sum::<f32>() / luminances.len() as f32;
    let sum_absolute_delta = luminances
        .iter()
        .map(|value| (value - mean).abs())
        .sum::<f32>();
    let normalized = sum_absolute_delta / (luminances.len() as f32 * 255.0);

    BlockAnalysis {
        mean,
        score: normalized.clamp(0.0, 1.0),
    }
}

fn block_starts(length: usize, block_size: usize) -> Vec<usize> {
    if length == 0 {
        return Vec::new();
    }

    let block_size = block_size.max(1).min(length);
    let stride = (block_size / 4).max(1);
    let mut starts = Vec::new();
    let mut current = 0;

    while current + block_size < length {
        starts.push(current);
        current += stride;
    }

    starts.push(length - block_size);
    starts.sort_unstable();
    starts.dedup();
    starts
}

fn luminance(pixel: RgbPixel) -> f32 {
    0.299 * pixel.r as f32 + 0.587 * pixel.g as f32 + 0.114 * pixel.b as f32
}

#[cfg(test)]
mod tests {
    use super::{
        apply_dehaze_rgb, block_analysis, block_starts, build_local_analysis_map, luminance,
        DehazeConfig,
    };
    use crate::pipeline::color::RgbPixel;
    use crate::pipeline::contrast::ContrastConfig;

    #[test]
    fn returns_original_when_amount_is_zero() {
        let pixels = vec![RgbPixel::new(120, 120, 120); 4];
        let output = apply_dehaze_rgb(
            &pixels,
            &pixels,
            2,
            2,
            0.0,
            DehazeConfig::default(),
            ContrastConfig::default(),
        );

        assert_eq!(output, pixels);
    }

    #[test]
    fn negative_dehaze_softens_low_contrast_regions() {
        let pixels = vec![
            RgbPixel::new(120, 118, 116),
            RgbPixel::new(122, 120, 118),
            RgbPixel::new(124, 122, 120),
            RgbPixel::new(126, 124, 122),
        ];
        let output = apply_dehaze_rgb(
            &pixels,
            &pixels,
            2,
            2,
            -1.0,
            DehazeConfig {
                block_size: 2,
                contrast_boost: 1.1,
                negative_contrast_reference_offset: 28.0,
                positive_saturation_boost: 1.0,
                positive_uses_global_reference: true,
            },
            ContrastConfig::default(),
        );

        let input_luminance_span = luminance(pixels[3]) - luminance(pixels[0]);
        let output_luminance_span = luminance(output[3]) - luminance(output[0]);

        assert!(output_luminance_span.abs() < input_luminance_span.abs());
    }

    #[test]
    fn negative_dehaze_uses_higher_reference_for_highlights() {
        let pixels = vec![
            RgbPixel::new(230, 228, 220),
            RgbPixel::new(232, 230, 222),
            RgbPixel::new(234, 232, 224),
            RgbPixel::new(236, 234, 226),
        ];
        let output = apply_dehaze_rgb(
            &pixels,
            &pixels,
            2,
            2,
            -1.0,
            DehazeConfig::default(),
            ContrastConfig::default(),
        );

        assert!(output[0].r > 220);
        assert!(output[3].r > 225);
    }

    #[test]
    fn low_contrast_area_gets_more_boost_than_high_contrast_area() {
        let low_pixels = vec![
            RgbPixel::new(120, 120, 120),
            RgbPixel::new(121, 121, 121),
            RgbPixel::new(122, 122, 122),
            RgbPixel::new(123, 123, 123),
        ];
        let high_pixels = vec![
            RgbPixel::new(0, 0, 0),
            RgbPixel::new(255, 255, 255),
            RgbPixel::new(0, 0, 0),
            RgbPixel::new(255, 255, 255),
        ];
        let low_contrast = block_analysis(&low_pixels, 2, 2, 0, 0, 2);
        let high_contrast = block_analysis(&high_pixels, 2, 2, 0, 0, 2);

        assert!(1.0 - low_contrast.score > 1.0 - high_contrast.score);
    }

    #[test]
    fn positive_dehaze_is_more_aggressive_than_linear_mapping() {
        let pixels = vec![
            RgbPixel::new(120, 118, 116),
            RgbPixel::new(122, 120, 118),
            RgbPixel::new(124, 122, 120),
            RgbPixel::new(126, 124, 122),
        ];
        let output = apply_dehaze_rgb(
            &pixels,
            &pixels,
            2,
            2,
            0.5,
            DehazeConfig::default(),
            ContrastConfig::default(),
        );

        assert!(output[0].r <= 118 || output[0].b <= 114 || output[3].r >= 127);
    }

    #[test]
    fn local_reference_follows_local_mean_luminance() {
        let pixels = vec![
            RgbPixel::new(40, 40, 40),
            RgbPixel::new(42, 42, 42),
            RgbPixel::new(220, 220, 220),
            RgbPixel::new(222, 222, 222),
        ];
        let analysis_map = build_local_analysis_map(&pixels, 2, 2, 1, false, None);

        assert!(analysis_map[0].reference < 60.0);
        assert!(analysis_map[3].reference > 200.0);
    }

    #[test]
    fn weighted_blend_favors_nearby_zone_centers() {
        let pixels = vec![
            RgbPixel::new(20, 20, 20),
            RgbPixel::new(20, 20, 20),
            RgbPixel::new(240, 240, 240),
            RgbPixel::new(240, 240, 240),
            RgbPixel::new(20, 20, 20),
            RgbPixel::new(20, 20, 20),
            RgbPixel::new(240, 240, 240),
            RgbPixel::new(240, 240, 240),
        ];
        let analysis_map = build_local_analysis_map(&pixels, 4, 2, 2, false, None);

        assert!(analysis_map[0].reference < analysis_map[1].reference);
        assert!(analysis_map[2].reference > analysis_map[1].reference);
    }

    #[test]
    fn block_starts_overlap_by_half_and_cover_edges() {
        assert_eq!(block_starts(8, 4), vec![0, 1, 2, 3, 4]);
        assert_eq!(block_starts(7, 4), vec![0, 1, 2, 3]);
        assert_eq!(block_starts(3, 8), vec![0]);
    }
}
