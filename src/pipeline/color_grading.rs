/*!
Color Grading Adjustment Idea

- The image is split into three luminance-based zones: shadows, midtones, and highlights.
- Each zone has two controls:
  * Hue selects the color tint that will be added to that luminance zone.
  * Intensity selects how strongly that tint is added.
- There is also a global color grading control:
  * it affects the whole image
  * it is strongest at 50% luminance
  * it gently falls in an S-shaped curve toward black and white
  * the darkest and brightest extremes still keep about 86% influence
- The zone masks use the same kind of soft S-curve logic as the tonal range controls.
- A reference slider can move the entire luminance-zone system left or right.
  * The slider is converted to a coefficient with `2^(slider / 100)`.
  * `-100` means coefficient `0.5`, so every luminance boundary is halved.
  * `0` means coefficient `1.0`, preserving the default zones.
  * `100` means coefficient `2.0`, so every luminance boundary is doubled.
- Max influence zones:
  * Highlights: 68%..100% luminance, with a subtle 90% -> 100% slope toward white.
  * Midtones: 34%..66% luminance, with a subtle 90% -> 100% -> 90% slope around 50%.
  * Shadows: 0%..32% luminance, with a subtle 100% -> 90% slope away from black.
- Every soft boundary has a 5% falloff zone so the color transition is not harsh.
- The selected hue is converted into pure RGB coefficients.
- The per-channel color shift is proportional to:
  intensity * zone_influence * selected_hue_channel_coefficient
- This is intentionally simple and experimental, so we can later tune the strength constant
  or replace the additive model with a more advanced color-blend model.
*/

use crate::pipeline::color::RgbPixel;

const MAX_COLOR_SHIFT: f32 = 44.0;
const GLOBAL_MIN_INFLUENCE: f32 = 0.86;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ColorGradingAdjustments {
    pub global_hue: f32,
    pub global_intensity: f32,
    pub reference_shift: f32,
    pub shadows_hue: f32,
    pub shadows_intensity: f32,
    pub midtones_hue: f32,
    pub midtones_intensity: f32,
    pub highlights_hue: f32,
    pub highlights_intensity: f32,
}

impl ColorGradingAdjustments {
    pub fn is_active(&self) -> bool {
        self.global_intensity != 0.0
            || self.shadows_intensity != 0.0
            || self.midtones_intensity != 0.0
            || self.highlights_intensity != 0.0
    }
}

pub fn apply_color_grading_rgb(
    pixels: &[RgbPixel],
    adjustments: ColorGradingAdjustments,
) -> Vec<RgbPixel> {
    pixels
        .iter()
        .copied()
        .map(|pixel| adjust_color_grading_pixel(pixel, adjustments))
        .collect()
}

pub fn adjust_color_grading_pixel(
    pixel: RgbPixel,
    adjustments: ColorGradingAdjustments,
) -> RgbPixel {
    if !adjustments.is_active() {
        return pixel;
    }

    let luma = luminance(pixel) / 255.0;
    let mut delta = ColorDelta::default();
    let reference_coefficient = reference_shift_to_coefficient(adjustments.reference_shift);

    add_zone_delta(
        &mut delta,
        adjustments.global_hue,
        adjustments.global_intensity,
        global_weight(luma),
    );
    add_zone_delta(
        &mut delta,
        adjustments.shadows_hue,
        adjustments.shadows_intensity,
        shadows_weight_with_reference(luma, reference_coefficient),
    );
    add_zone_delta(
        &mut delta,
        adjustments.midtones_hue,
        adjustments.midtones_intensity,
        midtones_weight_with_reference(luma, reference_coefficient),
    );
    add_zone_delta(
        &mut delta,
        adjustments.highlights_hue,
        adjustments.highlights_intensity,
        highlights_weight_with_reference(luma, reference_coefficient),
    );

    RgbPixel {
        r: shift_channel(pixel.r, delta.r),
        g: shift_channel(pixel.g, delta.g),
        b: shift_channel(pixel.b, delta.b),
    }
}

pub fn highlights_weight(luma: f32) -> f32 {
    highlights_weight_with_reference(luma, 1.0)
}

pub fn midtones_weight(luma: f32) -> f32 {
    midtones_weight_with_reference(luma, 1.0)
}

pub fn shadows_weight(luma: f32) -> f32 {
    shadows_weight_with_reference(luma, 1.0)
}

pub fn global_weight(luma: f32) -> f32 {
    let distance_from_midpoint = ((luma.clamp(0.0, 1.0) - 0.5).abs() / 0.5).clamp(0.0, 1.0);
    1.0 - (1.0 - GLOBAL_MIN_INFLUENCE) * s_curve(distance_from_midpoint)
}

pub fn highlights_weight_with_reference(luma: f32, reference_coefficient: f32) -> f32 {
    highlight_color_grading_weight(luma, reference_coefficient)
}

pub fn midtones_weight_with_reference(luma: f32, reference_coefficient: f32) -> f32 {
    midtone_color_grading_weight(luma, reference_coefficient)
}

pub fn shadows_weight_with_reference(luma: f32, reference_coefficient: f32) -> f32 {
    shadow_color_grading_weight(luma, reference_coefficient)
}

pub fn reference_shift_to_coefficient(reference_shift: f32) -> f32 {
    2.0_f32.powf(reference_shift.clamp(-100.0, 100.0) / 100.0)
}

fn add_zone_delta(delta: &mut ColorDelta, hue: f32, intensity: f32, zone_weight: f32) {
    if intensity == 0.0 || zone_weight == 0.0 {
        return;
    }

    let coeffs = hue_to_rgb_coefficients(hue);
    let strength = (intensity / 100.0).clamp(0.0, 1.0) * zone_weight * MAX_COLOR_SHIFT;

    delta.r += strength * coeffs.r;
    delta.g += strength * coeffs.g;
    delta.b += strength * coeffs.b;
}

fn hue_to_rgb_coefficients(hue_degrees: f32) -> ColorDelta {
    let hue = hue_degrees.rem_euclid(360.0);
    let chroma = 1.0;
    let x = chroma * (1.0 - ((hue / 60.0) % 2.0 - 1.0).abs());

    let (r, g, b) = match hue {
        h if h < 60.0 => (chroma, x, 0.0),
        h if h < 120.0 => (x, chroma, 0.0),
        h if h < 180.0 => (0.0, chroma, x),
        h if h < 240.0 => (0.0, x, chroma),
        h if h < 300.0 => (x, 0.0, chroma),
        _ => (chroma, 0.0, x),
    };

    ColorDelta { r, g, b }
}

fn highlight_color_grading_weight(luma: f32, reference_coefficient: f32) -> f32 {
    let luma = luma.clamp(0.0, 1.0);
    let falloff_start = scaled_reference_point(0.63, reference_coefficient);
    let full_start = scaled_reference_point(0.68, reference_coefficient);
    let peak = scaled_reference_point(1.0, reference_coefficient);

    if luma < falloff_start {
        0.0
    } else if luma < full_start {
        0.9 * s_curve(normalized(luma, falloff_start, full_start))
    } else {
        0.9 + 0.1 * normalized(luma, full_start, peak)
    }
}

fn midtone_color_grading_weight(luma: f32, reference_coefficient: f32) -> f32 {
    let luma = luma.clamp(0.0, 1.0);
    let falloff_start = scaled_reference_point(0.29, reference_coefficient);
    let full_start = scaled_reference_point(0.34, reference_coefficient);
    let peak = scaled_reference_point(0.50, reference_coefficient);
    let full_end = scaled_reference_point(0.66, reference_coefficient);
    let falloff_end = scaled_reference_point(0.71, reference_coefficient);

    if luma < falloff_start {
        0.0
    } else if luma < full_start {
        0.9 * s_curve(normalized(luma, falloff_start, full_start))
    } else if luma <= peak {
        0.9 + 0.1 * normalized(luma, full_start, peak)
    } else if luma <= full_end {
        0.9 + 0.1 * (1.0 - normalized(luma, peak, full_end))
    } else if luma <= falloff_end {
        0.9 * s_curve(1.0 - normalized(luma, full_end, falloff_end))
    } else {
        0.0
    }
}

fn shadow_color_grading_weight(luma: f32, reference_coefficient: f32) -> f32 {
    let luma = luma.clamp(0.0, 1.0);
    let peak = scaled_reference_point(0.0, reference_coefficient);
    let full_end = scaled_reference_point(0.32, reference_coefficient);
    let falloff_end = scaled_reference_point(0.37, reference_coefficient);

    if luma <= full_end {
        0.9 + 0.1 * (1.0 - normalized(luma, peak, full_end))
    } else if luma <= falloff_end {
        0.9 * s_curve(1.0 - normalized(luma, full_end, falloff_end))
    } else {
        0.0
    }
}

fn scaled_reference_point(point: f32, reference_coefficient: f32) -> f32 {
    point * reference_coefficient.clamp(0.5, 2.0)
}

fn normalized(value: f32, start: f32, end: f32) -> f32 {
    if start >= end {
        return if value >= end { 1.0 } else { 0.0 };
    }

    ((value - start) / (end - start)).clamp(0.0, 1.0)
}

fn s_curve(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn shift_channel(channel: u8, delta: f32) -> u8 {
    (channel as f32 + delta).clamp(0.0, 255.0) as u8
}

fn luminance(pixel: RgbPixel) -> f32 {
    0.299 * pixel.r as f32 + 0.587 * pixel.g as f32 + 0.114 * pixel.b as f32
}

#[derive(Debug, Clone, Copy, Default)]
struct ColorDelta {
    r: f32,
    g: f32,
    b: f32,
}

#[cfg(test)]
mod tests {
    use super::{
        adjust_color_grading_pixel, global_weight, highlights_weight, midtones_weight,
        shadows_weight, ColorGradingAdjustments,
    };
    use crate::pipeline::color::RgbPixel;

    #[test]
    fn zone_weights_match_requested_ranges() {
        assert_eq!(shadows_weight(0.00), 1.0);
        assert!(shadows_weight(0.10) > shadows_weight(0.32));
        assert_eq!(shadows_weight(0.32), 0.9);
        assert!(shadows_weight(0.34) > shadows_weight(0.36));
        assert_eq!(shadows_weight(0.38), 0.0);

        assert_eq!(midtones_weight(0.20), 0.0);
        assert!(midtones_weight(0.31) < midtones_weight(0.35));
        assert_eq!(midtones_weight(0.50), 1.0);
        assert_eq!(midtones_weight(0.34), 0.9);
        assert_eq!(midtones_weight(0.66), 0.9);
        assert!(midtones_weight(0.68) > midtones_weight(0.70));

        assert_eq!(highlights_weight(0.60), 0.0);
        assert!(highlights_weight(0.65) < highlights_weight(0.69));
        assert_eq!(highlights_weight(0.68), 0.9);
        assert!(highlights_weight(0.80) < highlights_weight(1.0));
        assert_eq!(highlights_weight(1.0), 1.0);
    }

    #[test]
    fn global_weight_peaks_in_midtones_and_softens_at_extremes() {
        assert_eq!(global_weight(0.50), 1.0);
        assert!(global_weight(0.25) > global_weight(0.0));
        assert!(global_weight(0.75) > global_weight(1.0));
        assert!((global_weight(0.0) - 0.86).abs() < 0.001);
        assert!((global_weight(1.0) - 0.86).abs() < 0.001);
    }

    #[test]
    fn red_highlight_grade_adds_red_to_bright_pixels() {
        let pixel = RgbPixel::new(200, 200, 200);
        let adjusted = adjust_color_grading_pixel(
            pixel,
            ColorGradingAdjustments {
                highlights_hue: 0.0,
                highlights_intensity: 100.0,
                ..ColorGradingAdjustments::default()
            },
        );

        assert!(adjusted.r > pixel.r);
        assert_eq!(adjusted.g, pixel.g);
        assert_eq!(adjusted.b, pixel.b);
    }
}
