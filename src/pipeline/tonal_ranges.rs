/*!
Tonal Range Adjustment Idea

- These controls behave like Lightroom-style Whites, Highlights, Shadows, and Blacks.
- Each control changes exposure-like luminance in a specific brightness range.
- The adjustment is based on the pixel luminance, not on separate hue decisions.
- The final luminance delta is added equally to R, G, and B so color balance is disturbed less
  than a per-channel exposure curve would disturb it.
- Each range has a strong central area and softer boundaries:
  * Whites belong to the standard 80%..100% band and are strongest from 82%..100%.
  * Highlights belong to the standard 60%..80% band and are strongest from 62%..78%.
  * Shadows belong to the standard 20%..40% band and are strongest from 22%..38%.
  * Blacks belong to the standard 0%..20% band and are strongest from 0%..18%.
- Each side of the mask is built from an S curve:
  * low influence starts slowly
  * the middle of the transition becomes steeper
  * the curve eases into the max-influence zone with negative second derivative
  * the max zone is clipped to 1.0
*/

use crate::pipeline::color::RgbPixel;

const MAX_RANGE_SHIFT: f32 = 100.0;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct TonalRangeAdjustments {
    pub whites: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub blacks: f32,
}

pub fn apply_tonal_ranges_rgb(
    pixels: &[RgbPixel],
    adjustments: TonalRangeAdjustments,
) -> Vec<RgbPixel> {
    pixels
        .iter()
        .copied()
        .map(|pixel| adjust_tonal_ranges_pixel(pixel, adjustments))
        .collect()
}

pub fn adjust_tonal_ranges_pixel(pixel: RgbPixel, adjustments: TonalRangeAdjustments) -> RgbPixel {
    if adjustments == TonalRangeAdjustments::default() {
        return pixel;
    }

    let luma = luminance(pixel) / 255.0;
    let delta = adjustments.whites * whites_weight(luma)
        + adjustments.highlights * highlights_weight(luma)
        + adjustments.shadows * shadows_weight(luma)
        + adjustments.blacks * blacks_weight(luma);
    let delta = delta.clamp(-MAX_RANGE_SHIFT, MAX_RANGE_SHIFT);

    shift_luminance(pixel, delta)
}

pub fn whites_weight(luma: f32) -> f32 {
    high_range_weight(luma, 0.60, 0.82)
}

pub fn highlights_weight(luma: f32) -> f32 {
    middle_range_weight(luma, 0.45, 0.62, 0.78, 0.92)
}

pub fn shadows_weight(luma: f32) -> f32 {
    middle_range_weight(luma, 0.08, 0.22, 0.38, 0.55)
}

pub fn blacks_weight(luma: f32) -> f32 {
    low_range_weight(luma, 0.18, 0.40)
}

fn high_range_weight(luma: f32, active_start: f32, full_start: f32) -> f32 {
    let luma = luma.clamp(0.0, 1.0);

    if luma < active_start {
        0.0
    } else if luma < full_start {
        s_curve(normalized(luma, active_start, full_start))
    } else {
        1.0
    }
}

fn low_range_weight(luma: f32, full_end: f32, active_end: f32) -> f32 {
    let luma = luma.clamp(0.0, 1.0);

    if luma <= full_end {
        1.0
    } else if luma <= active_end {
        s_curve(1.0 - normalized(luma, full_end, active_end))
    } else {
        0.0
    }
}

fn middle_range_weight(
    luma: f32,
    active_start: f32,
    full_start: f32,
    full_end: f32,
    active_end: f32,
) -> f32 {
    let low = high_range_weight(luma, active_start, full_start);
    let high = low_range_weight(luma, full_end, active_end);

    low.min(high)
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

fn shift_luminance(pixel: RgbPixel, delta: f32) -> RgbPixel {
    RgbPixel {
        r: shift_channel(pixel.r, delta),
        g: shift_channel(pixel.g, delta),
        b: shift_channel(pixel.b, delta),
    }
}

fn shift_channel(channel: u8, delta: f32) -> u8 {
    (channel as f32 + delta).clamp(0.0, 255.0) as u8
}

fn luminance(pixel: RgbPixel) -> f32 {
    0.299 * pixel.r as f32 + 0.587 * pixel.g as f32 + 0.114 * pixel.b as f32
}

#[cfg(test)]
mod tests {
    use super::{
        adjust_tonal_ranges_pixel, blacks_weight, highlights_weight, shadows_weight, whites_weight,
        TonalRangeAdjustments,
    };
    use crate::pipeline::color::RgbPixel;

    #[test]
    fn whites_are_strongest_in_top_luminance_range() {
        assert_eq!(whites_weight(0.55), 0.0);
        assert!(whites_weight(0.70) < whites_weight(0.80));
        assert!(whites_weight(0.80) < whites_weight(0.81));
        assert_eq!(whites_weight(0.82), 1.0);
        assert_eq!(whites_weight(0.90), 1.0);
    }

    #[test]
    fn highlights_peak_in_upper_mid_luminance_range() {
        assert_eq!(highlights_weight(0.40), 0.0);
        assert!(highlights_weight(0.55) < highlights_weight(0.65));
        assert_eq!(highlights_weight(0.70), 1.0);
        assert!(highlights_weight(0.79) > highlights_weight(0.81));
        assert!(highlights_weight(0.85) < highlights_weight(0.75));
        assert_eq!(highlights_weight(0.95), 0.0);
    }

    #[test]
    fn shadows_peak_in_lower_mid_luminance_range() {
        assert_eq!(shadows_weight(0.05), 0.0);
        assert!(shadows_weight(0.15) < shadows_weight(0.25));
        assert_eq!(shadows_weight(0.30), 1.0);
        assert!(shadows_weight(0.39) > shadows_weight(0.41));
        assert!(shadows_weight(0.47) < shadows_weight(0.35));
        assert_eq!(shadows_weight(0.60), 0.0);
    }

    #[test]
    fn blacks_are_strongest_near_zero() {
        assert_eq!(blacks_weight(0.05), 1.0);
        assert_eq!(blacks_weight(0.18), 1.0);
        assert!(blacks_weight(0.19) > blacks_weight(0.21));
        assert!(blacks_weight(0.25) > blacks_weight(0.35));
        assert_eq!(blacks_weight(0.45), 0.0);
    }

    #[test]
    fn applies_luminance_delta_without_changing_zero_adjustment() {
        let pixel = RgbPixel::new(180, 180, 180);
        let unchanged = adjust_tonal_ranges_pixel(pixel, TonalRangeAdjustments::default());
        let adjusted = adjust_tonal_ranges_pixel(
            pixel,
            TonalRangeAdjustments {
                highlights: 20.0,
                ..TonalRangeAdjustments::default()
            },
        );

        assert_eq!(unchanged, pixel);
        assert!(adjusted.r > pixel.r);
        assert_eq!(adjusted.r, adjusted.g);
        assert_eq!(adjusted.g, adjusted.b);
    }
}
