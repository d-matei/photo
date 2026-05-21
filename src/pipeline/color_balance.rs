/*!
Temperature and Tint Adjustment Idea

- This is a first simple color-balance model for testing.
- It follows the same basic tint-addition idea as global color grading, but with fixed hues.
- The influence is global: every pixel receives 100% of the selected adjustment strength.
- Temperature:
  * positive values add a warm amber/orange hue
  * negative values add a cool blue hue
- Tint:
  * positive values add a magenta hue
  * negative values add a green hue
- The slider magnitude controls intensity.
- This is not a physically accurate RAW white-balance model yet, but it gives us an editable
  and easy-to-understand starting point that can later be replaced by a more advanced model.
*/

use crate::pipeline::color::RgbPixel;

const MAX_COLOR_BALANCE_SHIFT: f32 = 48.0;
const WARM_TEMPERATURE_HUE: f32 = 38.0;
const COOL_TEMPERATURE_HUE: f32 = 220.0;
const MAGENTA_TINT_HUE: f32 = 300.0;
const GREEN_TINT_HUE: f32 = 120.0;

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ColorBalanceAdjustments {
    pub temperature: f32,
    pub tint: f32,
}

impl ColorBalanceAdjustments {
    pub fn is_active(&self) -> bool {
        self.temperature != 0.0 || self.tint != 0.0
    }
}

pub fn apply_color_balance_rgb(
    pixels: &[RgbPixel],
    adjustments: ColorBalanceAdjustments,
) -> Vec<RgbPixel> {
    pixels
        .iter()
        .copied()
        .map(|pixel| adjust_color_balance_pixel(pixel, adjustments))
        .collect()
}

pub fn adjust_color_balance_pixel(
    pixel: RgbPixel,
    adjustments: ColorBalanceAdjustments,
) -> RgbPixel {
    if !adjustments.is_active() {
        return pixel;
    }

    let mut delta = ColorDelta::default();
    add_signed_hue_delta(
        &mut delta,
        adjustments.temperature,
        WARM_TEMPERATURE_HUE,
        COOL_TEMPERATURE_HUE,
    );
    add_signed_hue_delta(
        &mut delta,
        adjustments.tint,
        MAGENTA_TINT_HUE,
        GREEN_TINT_HUE,
    );

    RgbPixel {
        r: shift_channel(pixel.r, delta.r),
        g: shift_channel(pixel.g, delta.g),
        b: shift_channel(pixel.b, delta.b),
    }
}

fn add_signed_hue_delta(delta: &mut ColorDelta, value: f32, positive_hue: f32, negative_hue: f32) {
    if value == 0.0 {
        return;
    }

    let hue = if value > 0.0 {
        positive_hue
    } else {
        negative_hue
    };
    let coeffs = hue_to_rgb_coefficients(hue);
    let strength = (value.abs() / 100.0).clamp(0.0, 1.0) * MAX_COLOR_BALANCE_SHIFT;

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

fn shift_channel(channel: u8, delta: f32) -> u8 {
    (channel as f32 + delta).clamp(0.0, 255.0) as u8
}

#[derive(Debug, Clone, Copy, Default)]
struct ColorDelta {
    r: f32,
    g: f32,
    b: f32,
}

#[cfg(test)]
mod tests {
    use super::{adjust_color_balance_pixel, ColorBalanceAdjustments};
    use crate::pipeline::color::RgbPixel;

    #[test]
    fn positive_temperature_adds_warmth() {
        let pixel = RgbPixel::new(120, 120, 120);
        let adjusted = adjust_color_balance_pixel(
            pixel,
            ColorBalanceAdjustments {
                temperature: 100.0,
                tint: 0.0,
            },
        );

        assert!(adjusted.r > pixel.r);
        assert!(adjusted.g > pixel.g);
        assert_eq!(adjusted.b, pixel.b);
    }

    #[test]
    fn negative_tint_adds_green() {
        let pixel = RgbPixel::new(120, 120, 120);
        let adjusted = adjust_color_balance_pixel(
            pixel,
            ColorBalanceAdjustments {
                temperature: 0.0,
                tint: -100.0,
            },
        );

        assert_eq!(adjusted.r, pixel.r);
        assert!(adjusted.g > pixel.g);
        assert_eq!(adjusted.b, pixel.b);
    }
}
