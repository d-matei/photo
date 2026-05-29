/*!
Color Mixer / HSL Adjustment Idea

- The color mixer targets pixels by hue instead of by luminance.
- The hue wheel is split into 9 named color zones:
  Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta, Pink.
- Each zone has a soft overlapping influence mask on the hue circle.
- A pixel can be influenced by neighboring color zones, similar to how color grading
  zones overlap on the luminance scale.
- Each influence mask extends slightly past its neighboring zone centers, so transitions
  between colors stay softer than a hard center-to-center split.
- Each zone has three controls:
  * Hue: shifts selected colors toward their neighboring hue centers.
    - `-100` moves a pure zone-center hue to the previous zone center.
    - `100` moves a pure zone-center hue to the next zone center.
    - Example: pure Yellow can move fully toward Orange or Green.
  * Saturation: reuses the project saturation idea, but scaled by the zone influence.
  * Luminance: reuses the project exposure idea, but scaled by the zone influence.
- The first implementation uses HSV-style hue/saturation/value conversion for hue shifts,
  then applies luminance-weighted saturation and exposure-like luminance shifts.
*/

use crate::pipeline::color::RgbPixel;
use crate::pipeline::exposure::adjust_exposure_value;
use crate::pipeline::saturation::adjust_saturation_pixel;

pub const COLOR_MIXER_ZONE_COUNT: usize = 9;
const HUE_ZONE_EXTRA_OVERLAP: f32 = 0.20;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ColorMixerAdjustments {
    pub hue: [f32; COLOR_MIXER_ZONE_COUNT],
    pub saturation: [f32; COLOR_MIXER_ZONE_COUNT],
    pub luminance: [f32; COLOR_MIXER_ZONE_COUNT],
}

impl Default for ColorMixerAdjustments {
    fn default() -> Self {
        Self {
            hue: [0.0; COLOR_MIXER_ZONE_COUNT],
            saturation: [0.0; COLOR_MIXER_ZONE_COUNT],
            luminance: [0.0; COLOR_MIXER_ZONE_COUNT],
        }
    }
}

impl ColorMixerAdjustments {
    pub fn is_active(&self) -> bool {
        self.hue.iter().any(|&value| value != 0.0)
            || self.saturation.iter().any(|&value| value != 0.0)
            || self.luminance.iter().any(|&value| value != 0.0)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ColorMixerZone {
    pub name: &'static str,
    pub center_hue: f32,
}

pub const COLOR_MIXER_ZONES: [ColorMixerZone; COLOR_MIXER_ZONE_COUNT] = [
    ColorMixerZone {
        name: "Red",
        center_hue: 0.0,
    },
    ColorMixerZone {
        name: "Orange",
        center_hue: 30.0,
    },
    ColorMixerZone {
        name: "Yellow",
        center_hue: 60.0,
    },
    ColorMixerZone {
        name: "Green",
        center_hue: 120.0,
    },
    ColorMixerZone {
        name: "Aqua",
        center_hue: 180.0,
    },
    ColorMixerZone {
        name: "Blue",
        center_hue: 240.0,
    },
    ColorMixerZone {
        name: "Purple",
        center_hue: 270.0,
    },
    ColorMixerZone {
        name: "Magenta",
        center_hue: 300.0,
    },
    ColorMixerZone {
        name: "Pink",
        center_hue: 330.0,
    },
];

pub fn apply_color_mixer_rgb(
    pixels: &[RgbPixel],
    adjustments: ColorMixerAdjustments,
) -> Vec<RgbPixel> {
    pixels
        .iter()
        .copied()
        .map(|pixel| adjust_color_mixer_pixel(pixel, adjustments))
        .collect()
}

pub fn adjust_color_mixer_pixel(pixel: RgbPixel, adjustments: ColorMixerAdjustments) -> RgbPixel {
    if !adjustments.is_active() {
        return pixel;
    }

    let hsv = rgb_to_hsv(pixel);
    if hsv.s <= f32::EPSILON {
        return pixel;
    }

    let mut hue_shift = 0.0;
    let mut saturation_shift = 0.0;
    let mut luminance_shift = 0.0;

    for index in 0..COLOR_MIXER_ZONE_COUNT {
        let weight = zone_weight(hsv.h, index);
        if weight == 0.0 {
            continue;
        }

        hue_shift += hue_shift_for_zone(index, adjustments.hue[index]) * weight;
        saturation_shift += adjustments.saturation[index] / 100.0 * weight;
        luminance_shift += adjustments.luminance[index] * weight;
    }

    let shifted_hue = wrap_hue(hsv.h + hue_shift);
    let mut adjusted = hsv_to_rgb(Hsv {
        h: shifted_hue,
        s: hsv.s,
        v: hsv.v,
    });

    if saturation_shift != 0.0 {
        adjusted = adjust_saturation_pixel(adjusted, saturation_shift);
    }

    if luminance_shift != 0.0 {
        adjusted = RgbPixel {
            r: adjust_exposure_value(adjusted.r, luminance_shift),
            g: adjust_exposure_value(adjusted.g, luminance_shift),
            b: adjust_exposure_value(adjusted.b, luminance_shift),
        };
    }

    adjusted
}

pub fn zone_weight(hue: f32, zone_index: usize) -> f32 {
    let previous = zone_center(previous_zone_index(zone_index));
    let center = zone_center(zone_index);
    let next = zone_center(next_zone_index(zone_index));
    let hue = wrap_hue(hue);

    let prev_distance = expanded_zone_distance(clockwise_distance(previous, center));
    let next_distance = expanded_zone_distance(clockwise_distance(center, next));
    let signed_distance = signed_hue_distance(center, hue);

    if signed_distance < 0.0 {
        let t = 1.0 - (signed_distance.abs() / prev_distance).clamp(0.0, 1.0);
        s_curve(t)
    } else {
        let t = 1.0 - (signed_distance / next_distance).clamp(0.0, 1.0);
        s_curve(t)
    }
}

pub fn hue_shift_for_zone(zone_index: usize, slider_value: f32) -> f32 {
    let slider = slider_value.clamp(-100.0, 100.0) / 100.0;
    let center = zone_center(zone_index);

    if slider > 0.0 {
        clockwise_distance(center, zone_center(next_zone_index(zone_index))) * slider
    } else if slider < 0.0 {
        -clockwise_distance(zone_center(previous_zone_index(zone_index)), center) * slider.abs()
    } else {
        0.0
    }
}

fn previous_zone_index(zone_index: usize) -> usize {
    if zone_index == 0 {
        COLOR_MIXER_ZONE_COUNT - 1
    } else {
        zone_index - 1
    }
}

fn next_zone_index(zone_index: usize) -> usize {
    (zone_index + 1) % COLOR_MIXER_ZONE_COUNT
}

fn zone_center(zone_index: usize) -> f32 {
    COLOR_MIXER_ZONES[zone_index % COLOR_MIXER_ZONE_COUNT].center_hue
}

fn clockwise_distance(from: f32, to: f32) -> f32 {
    (to - from).rem_euclid(360.0)
}

fn expanded_zone_distance(distance: f32) -> f32 {
    (distance * (1.0 + HUE_ZONE_EXTRA_OVERLAP)).max(1.0)
}

fn signed_hue_distance(center: f32, hue: f32) -> f32 {
    let distance = (hue - center).rem_euclid(360.0);
    if distance > 180.0 {
        distance - 360.0
    } else {
        distance
    }
}

fn s_curve(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

#[derive(Debug, Clone, Copy)]
struct Hsv {
    h: f32,
    s: f32,
    v: f32,
}

fn rgb_to_hsv(pixel: RgbPixel) -> Hsv {
    let r = pixel.r as f32 / 255.0;
    let g = pixel.g as f32 / 255.0;
    let b = pixel.b as f32 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let delta = max - min;

    let hue = if delta <= f32::EPSILON {
        0.0
    } else if max == r {
        60.0 * ((g - b) / delta).rem_euclid(6.0)
    } else if max == g {
        60.0 * (((b - r) / delta) + 2.0)
    } else {
        60.0 * (((r - g) / delta) + 4.0)
    };
    let saturation = if max <= f32::EPSILON {
        0.0
    } else {
        delta / max
    };

    Hsv {
        h: wrap_hue(hue),
        s: saturation,
        v: max,
    }
}

fn hsv_to_rgb(hsv: Hsv) -> RgbPixel {
    let hue = wrap_hue(hsv.h);
    let chroma = hsv.v * hsv.s;
    let x = chroma * (1.0 - ((hue / 60.0) % 2.0 - 1.0).abs());
    let m = hsv.v - chroma;

    let (r1, g1, b1) = match hue {
        h if h < 60.0 => (chroma, x, 0.0),
        h if h < 120.0 => (x, chroma, 0.0),
        h if h < 180.0 => (0.0, chroma, x),
        h if h < 240.0 => (0.0, x, chroma),
        h if h < 300.0 => (x, 0.0, chroma),
        _ => (chroma, 0.0, x),
    };

    RgbPixel {
        r: ((r1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        g: ((g1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
        b: ((b1 + m) * 255.0).round().clamp(0.0, 255.0) as u8,
    }
}

fn wrap_hue(hue: f32) -> f32 {
    hue.rem_euclid(360.0)
}

#[cfg(test)]
mod tests {
    use super::{
        adjust_color_mixer_pixel, hue_shift_for_zone, zone_weight, ColorMixerAdjustments,
        COLOR_MIXER_ZONES,
    };
    use crate::pipeline::color::RgbPixel;

    #[test]
    fn pure_yellow_can_shift_to_green_at_max_positive() {
        let yellow_index = 2;
        let pixel = RgbPixel::new(255, 255, 0);
        let mut adjustments = ColorMixerAdjustments::default();
        adjustments.hue[yellow_index] = 100.0;

        let adjusted = adjust_color_mixer_pixel(pixel, adjustments);

        assert_eq!(hue_shift_for_zone(yellow_index, 100.0), 60.0);
        assert_eq!(adjusted, RgbPixel::new(0, 255, 0));
    }

    #[test]
    fn pure_yellow_can_shift_to_orange_at_max_negative() {
        let yellow_index = 2;
        let pixel = RgbPixel::new(255, 255, 0);
        let mut adjustments = ColorMixerAdjustments::default();
        adjustments.hue[yellow_index] = -100.0;

        let adjusted = adjust_color_mixer_pixel(pixel, adjustments);

        assert_eq!(hue_shift_for_zone(yellow_index, -100.0), -30.0);
        assert_eq!(adjusted, RgbPixel::new(255, 128, 0));
    }

    #[test]
    fn zone_weight_peaks_at_zone_center_and_extends_past_neighbors() {
        let yellow_index = 2;
        assert_eq!(
            zone_weight(COLOR_MIXER_ZONES[yellow_index].center_hue, yellow_index),
            1.0
        );
        assert!(zone_weight(COLOR_MIXER_ZONES[1].center_hue, yellow_index) > 0.0);
        assert!(zone_weight(COLOR_MIXER_ZONES[3].center_hue, yellow_index) > 0.0);
        assert_eq!(zone_weight(0.0, yellow_index), 0.0);
        assert_eq!(zone_weight(135.0, yellow_index), 0.0);
    }
}
