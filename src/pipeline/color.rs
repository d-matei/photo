#[derive(Debug, Clone, Default)]
pub struct ColorGradingState {
    pub shadows_hue: f32,
    pub midtones_hue: f32,
    pub highlights_hue: f32,
    pub global_balance: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RgbPixel {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl RgbPixel {
    pub fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }
}
