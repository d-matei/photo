#[derive(Debug, Clone)]
pub struct BasicToneAdjustments {
    pub exposure: f32,
    pub contrast: f32,
    pub contrast_ref: f32,
    pub contrast_gamma: f32,
}

impl Default for BasicToneAdjustments {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            contrast: 0.0,
            contrast_ref: 128.0,
            contrast_gamma: 0.5,
        }
    }
}

impl BasicToneAdjustments {
    pub fn active_count(&self) -> usize {
        let mut count = 0;

        if self.exposure != 0.0 {
            count += 1;
        }
        if self.contrast != 0.0 {
            count += 1;
        }

        count
    }
}

#[derive(Debug, Clone, Default)]
pub struct ColorAdjustments {
    pub saturation: f32,
    pub vibrance: f32,
}

impl ColorAdjustments {
    pub fn active_count(&self) -> usize {
        let mut count = 0;

        if self.saturation != 0.0 {
            count += 1;
        }
        if self.vibrance != 0.0 {
            count += 1;
        }

        count
    }
}

#[derive(Debug, Clone, Default)]
pub struct DetailAdjustments {
    pub clarity: f32,
    pub texture: f32,
    pub dehaze: f32,
}

impl DetailAdjustments {
    pub fn active_count(&self) -> usize {
        let mut count = 0;

        if self.clarity != 0.0 {
            count += 1;
        }
        if self.texture != 0.0 {
            count += 1;
        }
        if self.dehaze != 0.0 {
            count += 1;
        }

        count
    }
}

#[derive(Debug, Clone, Default)]
pub struct EffectAdjustments {
    pub color_grading_enabled: bool,
    pub masking_enabled: bool,
}

impl EffectAdjustments {
    pub fn active_count(&self) -> usize {
        let mut count = 0;

        if self.color_grading_enabled {
            count += 1;
        }
        if self.masking_enabled {
            count += 1;
        }

        count
    }
}
