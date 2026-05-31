use crate::pipeline::clarity::{apply_clarity_rgb, ClarityConfig};
use crate::pipeline::color::RgbPixel;
use crate::pipeline::color_balance::{adjust_color_balance_pixel, ColorBalanceAdjustments};
use crate::pipeline::color_grading::{adjust_color_grading_pixel, ColorGradingAdjustments};
use crate::pipeline::color_mixer::{
    adjust_color_mixer_pixel, ColorMixerAdjustments, COLOR_MIXER_ZONE_COUNT,
};
use crate::pipeline::contrast::{adjust_contrast_value, ContrastConfig};
use crate::pipeline::dehaze::{apply_dehaze_rgb, DehazeConfig};
use crate::pipeline::exposure::adjust_exposure_value;
use crate::pipeline::masking::{mask_strength, MaskDefinition};
use crate::pipeline::saturation::adjust_saturation_pixel;
use crate::pipeline::tonal_ranges::{adjust_tonal_ranges_pixel, TonalRangeAdjustments};

#[derive(Debug, Clone, PartialEq)]
pub struct RenderParams {
    pub global: AdjustmentValues,
    pub masks: Vec<MaskDefinition<AdjustmentValues>>,
}

impl Default for RenderParams {
    fn default() -> Self {
        Self {
            global: AdjustmentValues::default(),
            masks: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AdjustmentValues {
    pub exposure: f32,
    pub whites: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub blacks: f32,
    pub temperature: f32,
    pub tint: f32,
    pub global_grading_hue: f32,
    pub global_grading_intensity: f32,
    pub shadows_grading_hue: f32,
    pub shadows_grading_intensity: f32,
    pub midtones_grading_hue: f32,
    pub midtones_grading_intensity: f32,
    pub highlights_grading_hue: f32,
    pub highlights_grading_intensity: f32,
    pub color_grading_reference: f32,
    pub mixer_hue: [f32; COLOR_MIXER_ZONE_COUNT],
    pub mixer_saturation: [f32; COLOR_MIXER_ZONE_COUNT],
    pub mixer_luminance: [f32; COLOR_MIXER_ZONE_COUNT],
    pub saturation: f32,
    pub contrast: f32,
    pub dehaze: f32,
    pub clarity: f32,
    pub contrast_reference: f32,
    pub contrast_gamma: f32,
    pub dehaze_block_size: usize,
    pub dehaze_negative_reference_offset: f32,
    pub dehaze_positive_saturation_boost: f32,
    pub clarity_block_size: usize,
    pub clarity_negative_reference_offset: f32,
    pub clarity_positive_saturation_compensation: f32,
    pub clarity_negative_saturation_compensation: f32,
}

impl Default for AdjustmentValues {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            whites: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            blacks: 0.0,
            temperature: 0.0,
            tint: 0.0,
            global_grading_hue: 35.0,
            global_grading_intensity: 0.0,
            shadows_grading_hue: 220.0,
            shadows_grading_intensity: 0.0,
            midtones_grading_hue: 35.0,
            midtones_grading_intensity: 0.0,
            highlights_grading_hue: 45.0,
            highlights_grading_intensity: 0.0,
            color_grading_reference: 0.0,
            mixer_hue: [0.0; COLOR_MIXER_ZONE_COUNT],
            mixer_saturation: [0.0; COLOR_MIXER_ZONE_COUNT],
            mixer_luminance: [0.0; COLOR_MIXER_ZONE_COUNT],
            saturation: 0.0,
            contrast: 0.0,
            dehaze: 0.0,
            clarity: 0.0,
            contrast_reference: 128.0,
            contrast_gamma: 0.5,
            dehaze_block_size: 16,
            dehaze_negative_reference_offset: 28.0,
            dehaze_positive_saturation_boost: 1.0,
            clarity_block_size: 16,
            clarity_negative_reference_offset: 28.0,
            clarity_positive_saturation_compensation: 0.38,
            clarity_negative_saturation_compensation: 0.72,
        }
    }
}

impl AdjustmentValues {
    pub fn is_active(&self) -> bool {
        self.exposure != 0.0
            || self.whites != 0.0
            || self.highlights != 0.0
            || self.shadows != 0.0
            || self.blacks != 0.0
            || self.temperature != 0.0
            || self.tint != 0.0
            || self.global_grading_intensity != 0.0
            || self.shadows_grading_intensity != 0.0
            || self.midtones_grading_intensity != 0.0
            || self.highlights_grading_intensity != 0.0
            || self.mixer_hue.iter().any(|&value| value != 0.0)
            || self.mixer_saturation.iter().any(|&value| value != 0.0)
            || self.mixer_luminance.iter().any(|&value| value != 0.0)
            || self.saturation != 0.0
            || self.contrast != 0.0
            || self.dehaze != 0.0
            || self.clarity != 0.0
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RenderedImage {
    pub pixels: Vec<RgbPixel>,
    pub width: usize,
    pub height: usize,
}

pub fn render_rgb(
    original_pixels: &[RgbPixel],
    width: usize,
    height: usize,
    params: &RenderParams,
) -> RenderedImage {
    let mut pixels = apply_adjustments(
        original_pixels,
        original_pixels,
        width,
        height,
        &params.global,
    );

    for mask in &params.masks {
        if !mask.enabled || !mask.adjustments.is_active() {
            continue;
        }

        let masked_pixels =
            apply_adjustments(&pixels, original_pixels, width, height, &mask.adjustments);

        for (index, pixel) in pixels.iter_mut().enumerate() {
            let x = index % width;
            let y = index / width;
            let mut strength = mask_strength(&mask.shape, x, y, width, height);
            if mask.inverted {
                strength = 1.0 - strength;
            }
            strength *= (mask.density / 100.0).clamp(0.0, 1.0);

            *pixel = blend_pixel(*pixel, masked_pixels[index], strength);
        }
    }

    RenderedImage {
        pixels,
        width,
        height,
    }
}

pub fn apply_adjustments(
    input_pixels: &[RgbPixel],
    original_pixels: &[RgbPixel],
    width: usize,
    height: usize,
    adjustments: &AdjustmentValues,
) -> Vec<RgbPixel> {
    let mut pixels = input_pixels.to_vec();

    if adjustments.exposure != 0.0 {
        pixels.iter_mut().for_each(|pixel| {
            pixel.r = adjust_exposure_value(pixel.r, adjustments.exposure);
            pixel.g = adjust_exposure_value(pixel.g, adjustments.exposure);
            pixel.b = adjust_exposure_value(pixel.b, adjustments.exposure);
        });
    }

    let tonal_adjustments = TonalRangeAdjustments {
        whites: adjustments.whites,
        highlights: adjustments.highlights,
        shadows: adjustments.shadows,
        blacks: adjustments.blacks,
    };
    if tonal_adjustments != TonalRangeAdjustments::default() {
        pixels.iter_mut().for_each(|pixel| {
            *pixel = adjust_tonal_ranges_pixel(*pixel, tonal_adjustments);
        });
    }

    let color_balance_adjustments = ColorBalanceAdjustments {
        temperature: adjustments.temperature,
        tint: adjustments.tint,
    };
    if color_balance_adjustments.is_active() {
        pixels.iter_mut().for_each(|pixel| {
            *pixel = adjust_color_balance_pixel(*pixel, color_balance_adjustments);
        });
    }

    let color_grading_adjustments = ColorGradingAdjustments {
        global_hue: adjustments.global_grading_hue,
        global_intensity: adjustments.global_grading_intensity,
        reference_shift: adjustments.color_grading_reference,
        shadows_hue: adjustments.shadows_grading_hue,
        shadows_intensity: adjustments.shadows_grading_intensity,
        midtones_hue: adjustments.midtones_grading_hue,
        midtones_intensity: adjustments.midtones_grading_intensity,
        highlights_hue: adjustments.highlights_grading_hue,
        highlights_intensity: adjustments.highlights_grading_intensity,
    };
    if color_grading_adjustments.is_active() {
        pixels.iter_mut().for_each(|pixel| {
            *pixel = adjust_color_grading_pixel(*pixel, color_grading_adjustments);
        });
    }

    let color_mixer_adjustments = ColorMixerAdjustments {
        hue: adjustments.mixer_hue,
        saturation: adjustments.mixer_saturation,
        luminance: adjustments.mixer_luminance,
    };
    if color_mixer_adjustments.is_active() {
        pixels.iter_mut().for_each(|pixel| {
            *pixel = adjust_color_mixer_pixel(*pixel, color_mixer_adjustments);
        });
    }

    if adjustments.saturation != 0.0 {
        pixels = pixels
            .into_iter()
            .map(|pixel| adjust_saturation_pixel(pixel, adjustments.saturation))
            .collect();
    }

    let contrast_config = ContrastConfig {
        reference: adjustments.contrast_reference,
        gamma: adjustments.contrast_gamma,
        max_shift: ContrastConfig::default().max_shift,
    };

    if adjustments.contrast != 0.0 {
        pixels.iter_mut().for_each(|pixel| {
            pixel.r = adjust_contrast_value(pixel.r, adjustments.contrast, contrast_config);
            pixel.g = adjust_contrast_value(pixel.g, adjustments.contrast, contrast_config);
            pixel.b = adjust_contrast_value(pixel.b, adjustments.contrast, contrast_config);
        });
    }

    if adjustments.dehaze != 0.0 {
        pixels = apply_dehaze_rgb(
            &pixels,
            original_pixels,
            width,
            height,
            adjustments.dehaze,
            DehazeConfig {
                block_size: adjustments.dehaze_block_size,
                contrast_boost: DehazeConfig::default().contrast_boost,
                negative_contrast_reference_offset: adjustments.dehaze_negative_reference_offset,
                positive_saturation_boost: adjustments.dehaze_positive_saturation_boost,
                positive_uses_global_reference: DehazeConfig::default()
                    .positive_uses_global_reference,
            },
            contrast_config,
        );
    }

    if adjustments.clarity != 0.0 {
        pixels = apply_clarity_rgb(
            &pixels,
            original_pixels,
            width,
            height,
            adjustments.clarity,
            ClarityConfig {
                block_size: adjustments.clarity_block_size,
                contrast_boost: ClarityConfig::default().contrast_boost,
                negative_contrast_reference_offset: adjustments.clarity_negative_reference_offset,
                positive_saturation_compensation: adjustments
                    .clarity_positive_saturation_compensation,
                negative_saturation_compensation: adjustments
                    .clarity_negative_saturation_compensation,
            },
            contrast_config,
        );
    }

    pixels
}

fn blend_pixel(base: RgbPixel, adjusted: RgbPixel, strength: f32) -> RgbPixel {
    RgbPixel {
        r: blend_channel(base.r, adjusted.r, strength),
        g: blend_channel(base.g, adjusted.g, strength),
        b: blend_channel(base.b, adjusted.b, strength),
    }
}

fn blend_channel(base: u8, adjusted: u8, strength: f32) -> u8 {
    (base as f32 + (adjusted as f32 - base as f32) * strength)
        .round()
        .clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::{render_rgb, AdjustmentValues, RenderParams};
    use crate::pipeline::color::RgbPixel;
    use crate::pipeline::masking::{LinearGradientMask, MaskDefinition, MaskShape};

    #[test]
    fn linear_mask_blends_adjustment_by_gradient_strength() {
        let original = vec![
            RgbPixel::new(100, 100, 100),
            RgbPixel::new(100, 100, 100),
            RgbPixel::new(100, 100, 100),
        ];
        let mut mask_adjustments = AdjustmentValues::default();
        mask_adjustments.exposure = 30.0;

        let params = RenderParams {
            global: AdjustmentValues::default(),
            masks: vec![MaskDefinition {
                id: "linear-1".to_string(),
                name: "Linear 1".to_string(),
                enabled: true,
                density: 100.0,
                inverted: false,
                shape: MaskShape::LinearGradient(LinearGradientMask {
                    center_x: 0.5,
                    center_y: 0.5,
                    angle_degrees: 90.0,
                    half_width: 0.5,
                    side: -1.0,
                }),
                adjustments: mask_adjustments,
            }],
        };

        let rendered = render_rgb(&original, 3, 1, &params);

        assert_eq!(rendered.pixels[0], RgbPixel::new(100, 100, 100));
        assert_eq!(rendered.pixels[1], RgbPixel::new(115, 115, 115));
        assert_eq!(rendered.pixels[2], RgbPixel::new(130, 130, 130));
    }
}
