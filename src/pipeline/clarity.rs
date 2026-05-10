/*!
Clarity Adjustment Idea

- Clarity is currently implemented as a saved dehaze-family variant.
- Positive clarity uses the older positive dehaze idea from before the
  global-reference experiment:
  * local haze-score analysis
  * larger positive block size
  * nearby non-covering zones included
  * local blended reference, not global image mean
  * per-channel contrast
  * reverse saturation compensation
- Negative clarity uses the saved negative dehaze-style behavior:
  * smaller base block size
  * only covering overlapping zones
  * lifted reference to favor brighter glow in highlights
  * positive saturation compensation

This is an intentional experiment so we can judge how an older dehaze-shaped
algorithm feels when used as the clarity tool.
*/

use crate::pipeline::color::RgbPixel;
use crate::pipeline::contrast::{adjust_contrast_value, ContrastConfig};
use crate::pipeline::saturation::adjust_saturation_pixel;

const LOCAL_BOOST_RESPONSE_EXPONENT: f32 = 0.7;
const CLARITY_CONTRAST_RESPONSE_MULTIPLIER: f32 = 1.45;
const LOCAL_REFERENCE_OFFSET_DARK: f32 = -3.0;
const LOCAL_REFERENCE_OFFSET_BRIGHT: f32 = 5.0;
const LOCAL_REFERENCE_TRANSITION_WIDTH: f32 = 24.0;
const CLARITY_ZONE_WEIGHT_FALLOFF: f32 = 0.55;
const POSITIVE_CLARITY_NEARBY_ZONE_RADIUS_SCALE: f32 = 1.75;
const POSITIVE_CLARITY_NEARBY_ZONE_WEIGHT_SCALE: f32 = 0.35;
const POSITIVE_CLARITY_RESPONSE_EXPONENT: f32 = 0.58;
const NEGATIVE_CLARITY_RESPONSE_EXPONENT: f32 = 0.75;

#[derive(Debug, Clone, Copy)]
pub struct ClarityConfig {
    pub block_size: usize,
    pub contrast_boost: f32,
    pub negative_contrast_reference_offset: f32,
    pub positive_saturation_compensation: f32,
    pub negative_saturation_compensation: f32,
}

impl Default for ClarityConfig {
    fn default() -> Self {
        Self {
            block_size: 16,
            contrast_boost: 0.9,
            negative_contrast_reference_offset: 28.0,
            positive_saturation_compensation: 0.38,
            negative_saturation_compensation: 0.72,
        }
    }
}

pub fn apply_clarity_rgb(
    pixels: &[RgbPixel],
    analysis_pixels: &[RgbPixel],
    width: usize,
    height: usize,
    amount: f32,
    config: ClarityConfig,
    contrast_config: ContrastConfig,
) -> Vec<RgbPixel> {
    if amount == 0.0 || pixels.is_empty() || analysis_pixels.is_empty() || width == 0 || height == 0
    {
        return pixels.to_vec();
    }

    let width = width.min(pixels.len());
    let height = height.min(pixels.len() / width.max(1));
    let analysis_map = build_local_analysis_map(
        analysis_pixels,
        width,
        height,
        clarity_block_size(amount, config.block_size),
        amount > 0.0,
    );

    pixels
        .iter()
        .zip(analysis_map.iter())
        .map(|(&pixel, analysis)| {
            let local_strength =
                clarity_signed_response(amount) * local_boost_response(analysis.boost);
            apply_local_clarity(
                pixel,
                local_strength,
                analysis.reference,
                config,
                contrast_config,
            )
        })
        .collect()
}

fn apply_local_clarity(
    pixel: RgbPixel,
    local_strength: f32,
    local_reference: f32,
    config: ClarityConfig,
    contrast_config: ContrastConfig,
) -> RgbPixel {
    if local_strength == 0.0 {
        return pixel;
    }

    let contrast_slider =
        local_strength * config.contrast_boost * CLARITY_CONTRAST_RESPONSE_MULTIPLIER;
    let standard_reference = local_reference.clamp(0.0, 255.0);
    let curved_reference =
        (local_reference + local_reference_offset(local_reference)).clamp(0.0, 255.0);
    let adjusted = RgbPixel {
        r: clarity_channel(
            pixel.r,
            contrast_slider,
            local_strength,
            standard_reference,
            curved_reference,
            config,
            contrast_config,
        ),
        g: clarity_channel(
            pixel.g,
            contrast_slider,
            local_strength,
            standard_reference,
            curved_reference,
            config,
            contrast_config,
        ),
        b: clarity_channel(
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
        -local_strength.abs() * config.positive_saturation_compensation
    } else {
        local_strength.abs() * config.negative_saturation_compensation
    };

    adjust_saturation_pixel(adjusted, saturation_adjustment)
}

fn clarity_channel(
    channel: u8,
    contrast_slider: f32,
    local_strength: f32,
    standard_reference: f32,
    curved_reference: f32,
    config: ClarityConfig,
    contrast_config: ContrastConfig,
) -> u8 {
    let base_reference =
        blended_reference_for_value(channel as f32, standard_reference, curved_reference);
    let effective_config = if local_strength < 0.0 {
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

    adjust_contrast_value(channel, contrast_slider, effective_config)
}

fn clarity_signed_response(amount: f32) -> f32 {
    if amount > 0.0 {
        amount.powf(POSITIVE_CLARITY_RESPONSE_EXPONENT)
    } else {
        -amount.abs().powf(NEGATIVE_CLARITY_RESPONSE_EXPONENT)
    }
}

fn local_boost_response(boost: f32) -> f32 {
    boost.clamp(0.0, 1.0).powf(LOCAL_BOOST_RESPONSE_EXPONENT)
}

fn clarity_block_size(amount: f32, base_block_size: usize) -> usize {
    if amount > 0.0 {
        base_block_size.saturating_mul(2)
    } else {
        base_block_size
    }
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
            let nearby_radius_x = radius_x * POSITIVE_CLARITY_NEARBY_ZONE_RADIUS_SCALE;
            let nearby_radius_y = radius_y * POSITIVE_CLARITY_NEARBY_ZONE_RADIUS_SCALE;
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
                        weight *= POSITIVE_CLARITY_NEARBY_ZONE_WEIGHT_SCALE;
                    }

                    boost_sum[index] += strength * weight;
                    reference_sum[index] += analysis.mean * weight;
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

fn zone_weight(x: f32, y: f32, center_x: f32, center_y: f32, radius_x: f32, radius_y: f32) -> f32 {
    let dx = (x - center_x) / radius_x;
    let dy = (y - center_y) / radius_y;
    let normalized_distance = (dx * dx + dy * dy).sqrt();

    (1.0 / (1.0 + normalized_distance * normalized_distance * CLARITY_ZONE_WEIGHT_FALLOFF))
        .clamp(0.0, 1.0)
}

fn luminance(pixel: RgbPixel) -> f32 {
    0.299 * pixel.r as f32 + 0.587 * pixel.g as f32 + 0.114 * pixel.b as f32
}

#[cfg(test)]
mod tests {
    use super::{apply_clarity_rgb, ClarityConfig};
    use crate::pipeline::color::RgbPixel;
    use crate::pipeline::contrast::ContrastConfig;

    #[test]
    fn returns_original_when_amount_is_zero() {
        let pixels = vec![RgbPixel::new(120, 118, 116); 4];
        let output = apply_clarity_rgb(
            &pixels,
            &pixels,
            2,
            2,
            0.0,
            ClarityConfig::default(),
            ContrastConfig::default(),
        );

        assert_eq!(output, pixels);
    }

    #[test]
    fn positive_clarity_changes_pixels() {
        let pixels = vec![
            RgbPixel::new(120, 118, 116),
            RgbPixel::new(122, 120, 118),
            RgbPixel::new(124, 122, 120),
            RgbPixel::new(126, 124, 122),
        ];
        let output = apply_clarity_rgb(
            &pixels,
            &pixels,
            2,
            2,
            0.5,
            ClarityConfig::default(),
            ContrastConfig::default(),
        );

        assert_ne!(output, pixels);
    }

    #[test]
    fn negative_clarity_changes_pixels() {
        let pixels = vec![
            RgbPixel::new(120, 118, 116),
            RgbPixel::new(122, 120, 118),
            RgbPixel::new(124, 122, 120),
            RgbPixel::new(126, 124, 122),
        ];
        let output = apply_clarity_rgb(
            &pixels,
            &pixels,
            2,
            2,
            -0.5,
            ClarityConfig::default(),
            ContrastConfig::default(),
        );

        assert_ne!(output, pixels);
    }
}
