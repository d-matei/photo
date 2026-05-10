/*!
Exposure Adjustment Idea

- This is the current starter implementation for exposure.
- Every pixel channel is shifted by the same amount.
- Positive values brighten uniformly.
- Negative values darken uniformly.
- Final values are clipped to 0..255.

Note:
- This is intentionally simple for tuning.
- A more RAW-like version later should operate in linear light and behave more like stop-based exposure.
*/

pub fn apply_exposure_u8(pixels: &[u8], slider_value: f32) -> Vec<u8> {
    pixels
        .iter()
        .map(|&pixel| adjust_exposure_value(pixel, slider_value))
        .collect()
}

pub fn adjust_exposure_value(pixel: u8, slider_value: f32) -> u8 {
    let adjusted = pixel as f32 + slider_value;
    adjusted.clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::{adjust_exposure_value, apply_exposure_u8};

    #[test]
    fn leaves_values_unchanged_at_zero() {
        let input = vec![0, 32, 128, 220, 255];
        let output = apply_exposure_u8(&input, 0.0);

        assert_eq!(output, input);
    }

    #[test]
    fn brightens_all_pixels_evenly() {
        assert_eq!(adjust_exposure_value(20, 25.0), 45);
        assert_eq!(adjust_exposure_value(128, 25.0), 153);
    }

    #[test]
    fn darkens_all_pixels_evenly() {
        assert_eq!(adjust_exposure_value(200, -50.0), 150);
        assert_eq!(adjust_exposure_value(25, -10.0), 15);
    }

    #[test]
    fn clips_to_valid_u8_range() {
        assert_eq!(adjust_exposure_value(250, 20.0), 255);
        assert_eq!(adjust_exposure_value(5, -20.0), 0);
    }
}
