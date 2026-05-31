/*!
Masking Concept

- Every mask turns a pixel position into a strength from `0.0` to `1.0`.
- `0.0` means the masked adjustment does not affect that pixel.
- `1.0` means the masked adjustment is fully applied.
- Values between them create soft gradients and feathering.
- The backend keeps adjustment math separate from mask math:
  * first render what the adjustment would do normally
  * then blend that adjusted result into the current image by mask strength
- Linear gradients follow the Lightroom-style formula:
  `strength = clamp(signed_distance / half_width + 0.5, 0.0, 1.0)`
  where `signed_distance` is measured perpendicular to the center line.
*/

use serde::Deserialize;

#[derive(Debug, Clone, PartialEq)]
pub struct MaskDefinition<T> {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub density: f32,
    pub inverted: bool,
    pub shape: MaskShape,
    pub adjustments: T,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MaskShape {
    LinearGradient(LinearGradientMask),
    RadialGradient(RadialGradientMask),
    Brush(BrushMask),
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct LinearGradientMask {
    pub center_x: f32,
    pub center_y: f32,
    pub angle_degrees: f32,
    pub half_width: f32,
    pub side: f32,
}

impl Default for LinearGradientMask {
    fn default() -> Self {
        Self {
            center_x: 0.5,
            center_y: 0.5,
            angle_degrees: 0.0,
            half_width: 0.28,
            side: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct RadialGradientMask {
    pub center_x: f32,
    pub center_y: f32,
    pub radius_x: f32,
    pub radius_y: f32,
    pub rotation_degrees: f32,
    pub feather: f32,
}

impl Default for RadialGradientMask {
    fn default() -> Self {
        Self {
            center_x: 0.5,
            center_y: 0.5,
            radius_x: 0.28,
            radius_y: 0.22,
            rotation_degrees: 0.0,
            feather: 0.5,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BrushMask {
    pub strokes: Vec<BrushStroke>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct BrushStroke {
    pub center_x: f32,
    pub center_y: f32,
    pub radius: f32,
    pub feather: f32,
    pub flow: f32,
    pub erase: bool,
}

impl Default for BrushMask {
    fn default() -> Self {
        Self {
            strokes: Vec::new(),
        }
    }
}

pub fn mask_strength(shape: &MaskShape, x: usize, y: usize, width: usize, height: usize) -> f32 {
    let normalized = normalized_pixel_position(x, y, width, height);

    match shape {
        MaskShape::LinearGradient(mask) => {
            linear_gradient_strength(*mask, normalized.0, normalized.1)
        }
        MaskShape::RadialGradient(mask) => {
            radial_gradient_strength(*mask, normalized.0, normalized.1)
        }
        MaskShape::Brush(mask) => brush_strength(mask, normalized.0, normalized.1),
    }
}

pub fn linear_gradient_strength(mask: LinearGradientMask, x: f32, y: f32) -> f32 {
    let half_width = mask.half_width.abs().max(0.001);
    let radians = mask.angle_degrees.to_radians();
    let normal_x = -radians.sin();
    let normal_y = radians.cos();
    let dx = x - mask.center_x;
    let dy = y - mask.center_y;
    let signed_distance = (dx * normal_x + dy * normal_y) * mask.side.signum();

    (signed_distance / half_width + 0.5).clamp(0.0, 1.0)
}

pub fn radial_gradient_strength(mask: RadialGradientMask, x: f32, y: f32) -> f32 {
    let radius_x = mask.radius_x.abs().max(0.001);
    let radius_y = mask.radius_y.abs().max(0.001);
    let radians = (-mask.rotation_degrees).to_radians();
    let dx = x - mask.center_x;
    let dy = y - mask.center_y;
    let local_x = dx * radians.cos() - dy * radians.sin();
    let local_y = dx * radians.sin() + dy * radians.cos();
    let distance = ((local_x / radius_x).powi(2) + (local_y / radius_y).powi(2)).sqrt();
    let feather = mask.feather.clamp(0.0, 1.0).max(0.001);
    let full_radius = (1.0 - feather).clamp(0.0, 1.0);

    if distance <= full_radius {
        1.0
    } else {
        ((1.0 - distance) / (1.0 - full_radius).max(0.001)).clamp(0.0, 1.0)
    }
}

pub fn brush_strength(mask: &BrushMask, x: f32, y: f32) -> f32 {
    mask.strokes.iter().fold(0.0, |strength, stroke| {
        let stroke_strength = brush_stroke_strength(*stroke, x, y);
        if stroke.erase {
            (strength - stroke_strength).clamp(0.0, 1.0)
        } else {
            (strength + stroke_strength).clamp(0.0, 1.0)
        }
    })
}

fn brush_stroke_strength(stroke: BrushStroke, x: f32, y: f32) -> f32 {
    let radius = stroke.radius.abs().max(0.001);
    let distance = ((x - stroke.center_x).powi(2) + (y - stroke.center_y).powi(2)).sqrt();
    let feather = stroke.feather.clamp(0.0, 1.0).max(0.001);
    let full_radius = radius * (1.0 - feather);
    let base_strength = if distance <= full_radius {
        1.0
    } else {
        ((radius - distance) / (radius - full_radius).max(0.001)).clamp(0.0, 1.0)
    };

    base_strength * stroke.flow.clamp(0.0, 1.0)
}

fn normalized_pixel_position(x: usize, y: usize, width: usize, height: usize) -> (f32, f32) {
    let normalized_x = if width <= 1 {
        0.5
    } else {
        x as f32 / (width - 1) as f32
    };
    let normalized_y = if height <= 1 {
        0.5
    } else {
        y as f32 / (height - 1) as f32
    };

    (normalized_x, normalized_y)
}

#[cfg(test)]
mod tests {
    use super::{
        brush_strength, linear_gradient_strength, radial_gradient_strength, BrushMask, BrushStroke,
        LinearGradientMask, RadialGradientMask,
    };

    #[test]
    fn linear_gradient_matches_lightroom_style_formula() {
        let mask = LinearGradientMask {
            center_x: 0.5,
            center_y: 0.5,
            angle_degrees: 0.0,
            half_width: 0.25,
            side: 1.0,
        };

        assert_eq!(linear_gradient_strength(mask, 0.5, 0.25), 0.0);
        assert_eq!(linear_gradient_strength(mask, 0.5, 0.5), 0.5);
        assert_eq!(linear_gradient_strength(mask, 0.5, 0.75), 1.0);
    }

    #[test]
    fn radial_gradient_fades_from_center_to_edge() {
        let mask = RadialGradientMask {
            center_x: 0.5,
            center_y: 0.5,
            radius_x: 0.25,
            radius_y: 0.25,
            rotation_degrees: 0.0,
            feather: 1.0,
        };

        assert_eq!(radial_gradient_strength(mask, 0.5, 0.5), 1.0);
        assert_eq!(radial_gradient_strength(mask, 0.75, 0.5), 0.0);
    }

    #[test]
    fn brush_mask_fades_from_center_to_radius() {
        let mask = BrushMask {
            strokes: vec![BrushStroke {
                center_x: 0.5,
                center_y: 0.5,
                radius: 0.25,
                feather: 1.0,
                flow: 1.0,
                erase: false,
            }],
        };

        assert_eq!(brush_strength(&mask, 0.5, 0.5), 1.0);
        assert_eq!(brush_strength(&mask, 0.75, 0.5), 0.0);
    }
}
