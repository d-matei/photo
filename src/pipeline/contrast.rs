/*!
Contrast Adjustment Idea

- Reference value defines the tonal midpoint around which contrast operates.
- Positive contrast keeps the same linear behavior around the reference, but the slider is eased:
  * small positive slider moves produce gentler changes
  * stronger settings still build toward the same kind of punch
  * linear distance from the reference
  * darker-than-reference pixels get darker
  * brighter-than-reference pixels get brighter
- Negative contrast uses a softer non-linear compression:
  * values move toward the reference using a gamma-shaped curve
  * midtones and near-midtones are compressed more than tonal extremes
  * deep shadows keep more depth
  * bright highlights keep more of their original brightness
- Final values are clipped to the displayable 0..255 range.
*/

const DEFAULT_MAX_SHIFT: f32 = 64.0;
const NORMALIZATION_DIVISOR: f32 = 127.0;
const EDGE_PROTECTION_FLOOR: f32 = 0.45;
const EDGE_PROTECTION_EXPONENT: f32 = 0.9;
const POSITIVE_RESPONSE_EXPONENT: f32 = 1.35;

#[derive(Debug, Clone, Copy)]
pub struct ContrastConfig {
    pub reference: f32,
    pub gamma: f32,
    pub max_shift: f32,
}

impl Default for ContrastConfig {
    fn default() -> Self {
        Self {
            reference: 128.0,
            gamma: 0.5,
            max_shift: DEFAULT_MAX_SHIFT,
        }
    }
}

pub fn apply_contrast_u8(pixels: &[u8], slider_value: f32, config: ContrastConfig) -> Vec<u8> {
    pixels
        .iter()
        .map(|&pixel| adjust_contrast_value(pixel, slider_value, config))
        .collect()
}

pub fn adjust_contrast_value(pixel: u8, slider_value: f32, config: ContrastConfig) -> u8 {
    if slider_value == 0.0 {
        return pixel;
    }

    let pixel = pixel as f32;
    let result = if slider_value > 0.0 {
        let effective_slider = positive_response(slider_value);
        let distance = pixel - config.reference;
        pixel + distance * effective_slider
    } else {
        let distance = config.reference - pixel;
        let normalized_distance = distance / NORMALIZATION_DIVISOR;
        let factor = normalized_distance.signum() * normalized_distance.abs().powf(config.gamma);
        let edge_protection = edge_protection(pixel, config.reference);
        pixel + factor * (-slider_value) * config.max_shift * edge_protection
    };

    result.clamp(0.0, 255.0) as u8
}

fn positive_response(slider_value: f32) -> f32 {
    slider_value.powf(POSITIVE_RESPONSE_EXPONENT)
}

fn edge_protection(pixel: f32, reference: f32) -> f32 {
    if reference <= 0.0 || reference >= 255.0 {
        return 1.0;
    }

    let distance_to_edge = if pixel < reference {
        let shadow_range = reference.max(1.0);
        (pixel / shadow_range).clamp(0.0, 1.0)
    } else {
        let highlight_range = (255.0 - reference).max(1.0);
        ((255.0 - pixel) / highlight_range).clamp(0.0, 1.0)
    };

    EDGE_PROTECTION_FLOOR
        + (1.0 - EDGE_PROTECTION_FLOOR) * distance_to_edge.powf(EDGE_PROTECTION_EXPONENT)
}

#[cfg(test)]
mod tests {
    use super::{adjust_contrast_value, apply_contrast_u8, ContrastConfig};

    #[test]
    fn leaves_pixels_unchanged_when_slider_is_zero() {
        let config = ContrastConfig::default();
        let input = vec![0, 64, 128, 192, 255];
        let output = apply_contrast_u8(&input, 0.0, config);

        assert_eq!(output, input);
    }

    #[test]
    fn increases_contrast_linearly_around_reference() {
        let config = ContrastConfig::default();

        assert_eq!(adjust_contrast_value(100, 0.5, config), 89);
        assert_eq!(adjust_contrast_value(156, 0.5, config), 166);
    }

    #[test]
    fn positive_contrast_ramps_up_more_gently_than_before() {
        let config = ContrastConfig::default();

        assert_eq!(adjust_contrast_value(100, 0.2, config), 96);
        assert_eq!(adjust_contrast_value(156, 0.2, config), 159);
    }

    #[test]
    fn decreases_contrast_non_linearly_toward_reference() {
        let config = ContrastConfig::default();

        assert_eq!(adjust_contrast_value(0, -1.0, config), 28);
        assert_eq!(adjust_contrast_value(255, -1.0, config), 226);
        assert_eq!(adjust_contrast_value(120, -1.0, config), 135);
    }

    #[test]
    fn protects_tonal_extremes_more_than_midtones() {
        let config = ContrastConfig::default();

        let deep_shadow = adjust_contrast_value(8, -1.0, config);
        let darker_midtone = adjust_contrast_value(64, -1.0, config);
        let bright_highlight = adjust_contrast_value(247, -1.0, config);
        let brighter_midtone = adjust_contrast_value(192, -1.0, config);

        assert!(deep_shadow < 40);
        assert!(darker_midtone > 80);
        assert!(bright_highlight > 210);
        assert!(brighter_midtone < 180);
    }

    #[test]
    fn clips_values_into_u8_range() {
        let config = ContrastConfig::default();

        assert_eq!(adjust_contrast_value(255, 1.0, config), 255);
        assert_eq!(adjust_contrast_value(0, 1.0, config), 0);
    }
}
