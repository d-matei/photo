/*!
Saturation Adjustment Idea

- Compute a grayscale reference using luminance-weighted RGB.
- Positive saturation pushes each channel farther away from that gray value.
- Negative saturation pulls each channel back toward gray.
- A value of -1.0 fully desaturates the pixel.
- Final values are clipped to 0..255.

This is a standard, predictable base implementation that we can later refine with more photographic behavior.
*/

use crate::pipeline::color::RgbPixel;

pub fn apply_saturation_rgb(pixels: &[RgbPixel], slider_value: f32) -> Vec<RgbPixel> {
    pixels
        .iter()
        .copied()
        .map(|pixel| adjust_saturation_pixel(pixel, slider_value))
        .collect()
}

pub fn adjust_saturation_pixel(pixel: RgbPixel, slider_value: f32) -> RgbPixel {
    if slider_value == 0.0 {
        return pixel;
    }

    let saturation_scale = (1.0 + slider_value).max(0.0);
    let gray = 0.299 * pixel.r as f32 + 0.587 * pixel.g as f32 + 0.114 * pixel.b as f32;

    RgbPixel {
        r: adjust_channel(pixel.r, gray, saturation_scale),
        g: adjust_channel(pixel.g, gray, saturation_scale),
        b: adjust_channel(pixel.b, gray, saturation_scale),
    }
}

fn adjust_channel(channel: u8, gray: f32, saturation_scale: f32) -> u8 {
    let adjusted = gray + (channel as f32 - gray) * saturation_scale;
    adjusted.clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::{adjust_saturation_pixel, apply_saturation_rgb};
    use crate::pipeline::color::RgbPixel;

    #[test]
    fn leaves_pixels_unchanged_at_zero() {
        let input = vec![RgbPixel::new(120, 80, 40), RgbPixel::new(50, 50, 50)];
        let output = apply_saturation_rgb(&input, 0.0);

        assert_eq!(output, input);
    }

    #[test]
    fn increases_distance_from_gray() {
        let pixel = RgbPixel::new(120, 80, 40);
        let adjusted = adjust_saturation_pixel(pixel, 0.5);

        assert_eq!(adjusted, RgbPixel::new(136, 76, 16));
    }

    #[test]
    fn decreases_distance_from_gray() {
        let pixel = RgbPixel::new(120, 80, 40);
        let adjusted = adjust_saturation_pixel(pixel, -0.5);

        assert_eq!(adjusted, RgbPixel::new(103, 83, 63));
    }

    #[test]
    fn fully_desaturates_at_negative_one() {
        let pixel = RgbPixel::new(120, 80, 40);
        let adjusted = adjust_saturation_pixel(pixel, -1.0);

        assert_eq!(adjusted, RgbPixel::new(87, 87, 87));
    }
}
