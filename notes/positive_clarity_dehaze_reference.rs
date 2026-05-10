/*
Reference Snapshot: Positive Clarity Using Earlier Positive-Dehaze Logic

This file preserves the experimental positive-clarity path that reused the
earlier positive-dehaze-style behavior:

- 32px analysis windows
- nearby non-covering windows included with weaker weight
- local reference offset parabola from -3 to +5
- smooth blend from standard reference to curved reference
- per-channel contrast application
- reverse saturation compensation

It is intentionally not compiled into the active backend. It is kept here so we
can copy pieces back later if needed.
*/

use crate::pipeline::color::RgbPixel;
use crate::pipeline::contrast::{adjust_contrast_value, ContrastConfig};

const POSITIVE_CLARITY_EXPANDED_BLOCK_SIZE: usize = 32;
const POSITIVE_CLARITY_LOCAL_BOOST_RESPONSE_EXPONENT: f32 = 0.7;
const POSITIVE_CLARITY_ZONE_WEIGHT_FALLOFF: f32 = 0.55;
const POSITIVE_CLARITY_DEHAZE_RESPONSE_MULTIPLIER: f32 = 1.45;
const POSITIVE_CLARITY_LOCAL_REFERENCE_OFFSET_DARK: f32 = -3.0;
const POSITIVE_CLARITY_LOCAL_REFERENCE_OFFSET_BRIGHT: f32 = 5.0;
const POSITIVE_CLARITY_LOCAL_REFERENCE_TRANSITION_WIDTH: f32 = 24.0;
const POSITIVE_CLARITY_NEARBY_ZONE_RADIUS_SCALE: f32 = 1.75;
const POSITIVE_CLARITY_NEARBY_ZONE_WEIGHT_SCALE: f32 = 0.35;
const POSITIVE_CLARITY_SATURATION_COMPENSATION: f32 = 0.38;
const POSITIVE_CLARITY_RESPONSE_EXPONENT: f32 = 0.58;

pub fn apply_positive_clarity_reference(
    pixels: &[RgbPixel],
    analysis_pixels: &[RgbPixel],
    width: usize,
    height: usize,
    amount: f32,
    contrast_config: ContrastConfig,
) -> Vec<RgbPixel> {
    let width = width.min(pixels.len());
    let height = height.min(pixels.len() / width.max(1));
    let analysis_width = width.min(analysis_pixels.len());
    let analysis_height = height.min(analysis_pixels.len() / analysis_width.max(1));
    let analysis_map = build_positive_clarity_analysis_map(
        analysis_pixels,
        analysis_width,
        analysis_height,
        POSITIVE_CLARITY_EXPANDED_BLOCK_SIZE,
        true,
    );

    pixels
        .iter()
        .zip(analysis_map.iter())
        .map(|(&pixel, analysis)| {
            let local_strength = amount.powf(POSITIVE_CLARITY_RESPONSE_EXPONENT)
                * analysis
                    .boost
                    .powf(POSITIVE_CLARITY_LOCAL_BOOST_RESPONSE_EXPONENT);
            let standard_reference = analysis.reference.clamp(0.0, 255.0);
            let curved_reference = (analysis.reference
                + positive_clarity_local_reference_offset(analysis.reference))
                .clamp(0.0, 255.0);

            let contrast_adjusted = RgbPixel {
                r: positive_clarity_channel(
                    pixel.r,
                    local_strength,
                    standard_reference,
                    curved_reference,
                    contrast_config,
                ),
                g: positive_clarity_channel(
                    pixel.g,
                    local_strength,
                    standard_reference,
                    curved_reference,
                    contrast_config,
                ),
                b: positive_clarity_channel(
                    pixel.b,
                    local_strength,
                    standard_reference,
                    curved_reference,
                    contrast_config,
                ),
            };

            adjust_positive_clarity_saturation(
                contrast_adjusted,
                -local_strength.abs() * POSITIVE_CLARITY_SATURATION_COMPENSATION,
            )
        })
        .collect()
}

fn positive_clarity_channel(
    channel: u8,
    local_strength: f32,
    standard_reference: f32,
    curved_reference: f32,
    contrast_config: ContrastConfig,
) -> u8 {
    let reference = positive_clarity_blended_reference(channel as f32, standard_reference, curved_reference);
    let effective_config = ContrastConfig {
        reference,
        ..contrast_config
    };

    adjust_contrast_value(
        channel,
        local_strength * POSITIVE_CLARITY_DEHAZE_RESPONSE_MULTIPLIER,
        effective_config,
    )
}

fn adjust_positive_clarity_saturation(pixel: RgbPixel, slider_value: f32) -> RgbPixel {
    if slider_value == 0.0 {
        return pixel;
    }

    let saturation_scale = (1.0 + slider_value).max(0.0);
    let gray = luminance(pixel);

    RgbPixel {
        r: adjust_saturation_channel(pixel.r, gray, saturation_scale),
        g: adjust_saturation_channel(pixel.g, gray, saturation_scale),
        b: adjust_saturation_channel(pixel.b, gray, saturation_scale),
    }
}

fn adjust_saturation_channel(channel: u8, gray: f32, saturation_scale: f32) -> u8 {
    let adjusted = gray + (channel as f32 - gray) * saturation_scale;
    adjusted.clamp(0.0, 255.0) as u8
}

#[derive(Debug, Clone, Copy)]
struct PositiveClarityAnalysis {
    boost: f32,
    reference: f32,
}

#[derive(Debug, Clone, Copy)]
struct BlockMetric {
    mean: f32,
    score: f32,
}

fn build_positive_clarity_analysis_map(
    pixels: &[RgbPixel],
    width: usize,
    height: usize,
    block_size: usize,
    include_nearby_zones: bool,
) -> Vec<PositiveClarityAnalysis> {
    let mut boost_sum = vec![0.0; width * height];
    let mut reference_sum = vec![0.0; width * height];
    let mut weight_sum = vec![0.0; width * height];
    let starts_x = block_starts(width, block_size);
    let starts_y = block_starts(height, block_size);

    for start_y in starts_y {
        for start_x in &starts_x {
            let metric = block_metric(pixels, width, height, *start_x, start_y, block_size);
            let strength = 1.0 - metric.score;
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
                    let mut weight = positive_clarity_zone_weight(
                        x as f32,
                        y as f32,
                        center_x,
                        center_y,
                        if include_nearby_zones { nearby_radius_x } else { radius_x },
                        if include_nearby_zones { nearby_radius_y } else { radius_y },
                    );
                    let is_covering_zone = x >= *start_x && x < end_x && y >= start_y && y < end_y;
                    if include_nearby_zones && !is_covering_zone {
                        weight *= POSITIVE_CLARITY_NEARBY_ZONE_WEIGHT_SCALE;
                    }
                    boost_sum[index] += strength * weight;
                    reference_sum[index] += metric.mean * weight;
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
                PositiveClarityAnalysis {
                    boost: 0.0,
                    reference: 128.0,
                }
            } else {
                PositiveClarityAnalysis {
                    boost: (boost_total / total_weight).clamp(0.0, 1.0),
                    reference: (reference_total / total_weight).clamp(0.0, 255.0),
                }
            }
        })
        .collect()
}

fn positive_clarity_zone_weight(
    x: f32,
    y: f32,
    center_x: f32,
    center_y: f32,
    radius_x: f32,
    radius_y: f32,
) -> f32 {
    let dx = (x - center_x) / radius_x;
    let dy = (y - center_y) / radius_y;
    let normalized_distance = (dx * dx + dy * dy).sqrt();

    (1.0 / (1.0 + normalized_distance * normalized_distance * POSITIVE_CLARITY_ZONE_WEIGHT_FALLOFF))
        .clamp(0.0, 1.0)
}

fn positive_clarity_local_reference_offset(local_reference: f32) -> f32 {
    let normalized = (local_reference / 255.0).clamp(0.0, 1.0);
    let parabola = normalized * normalized;

    POSITIVE_CLARITY_LOCAL_REFERENCE_OFFSET_DARK
        + (POSITIVE_CLARITY_LOCAL_REFERENCE_OFFSET_BRIGHT - POSITIVE_CLARITY_LOCAL_REFERENCE_OFFSET_DARK)
            * parabola
}

fn positive_clarity_blended_reference(
    value: f32,
    standard_reference: f32,
    curved_reference: f32,
) -> f32 {
    let start = standard_reference - POSITIVE_CLARITY_LOCAL_REFERENCE_TRANSITION_WIDTH * 0.5;
    let end = standard_reference + POSITIVE_CLARITY_LOCAL_REFERENCE_TRANSITION_WIDTH * 0.5;
    let blend = smoothstep(start, end, value);

    (standard_reference * (1.0 - blend) + curved_reference * blend).clamp(0.0, 255.0)
}

fn block_metric(
    pixels: &[RgbPixel],
    width: usize,
    height: usize,
    start_x: usize,
    start_y: usize,
    block_size: usize,
) -> BlockMetric {
    let end_x = (start_x + block_size).min(width);
    let end_y = (start_y + block_size).min(height);
    let mut luminances = Vec::with_capacity((end_x.saturating_sub(start_x)) * (end_y.saturating_sub(start_y)));

    for y in start_y..end_y {
        for x in start_x..end_x {
            luminances.push(luminance(pixels[y * width + x]));
        }
    }

    if luminances.is_empty() {
        return BlockMetric {
            mean: 128.0,
            score: 0.0,
        };
    }

    let mean = luminances.iter().sum::<f32>() / luminances.len() as f32;
    let sum_absolute_delta = luminances
        .iter()
        .map(|value| (value - mean).abs())
        .sum::<f32>();
    let score = (sum_absolute_delta / (luminances.len() as f32 * 255.0)).clamp(0.0, 1.0);

    BlockMetric { mean, score }
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

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    if edge0 >= edge1 {
        return if x >= edge1 { 1.0 } else { 0.0 };
    }

    let t = ((x - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn luminance(pixel: RgbPixel) -> f32 {
    0.299 * pixel.r as f32 + 0.587 * pixel.g as f32 + 0.114 * pixel.b as f32
}
