use crate::pipeline::adjustments::{
    BasicToneAdjustments, ColorAdjustments, DetailAdjustments, EffectAdjustments,
};

#[derive(Debug, Clone)]
pub struct EditParams {
    pub basic_tone: BasicToneAdjustments,
    pub color: ColorAdjustments,
    pub detail: DetailAdjustments,
    pub effects: EffectAdjustments,
}

impl Default for EditParams {
    fn default() -> Self {
        Self {
            basic_tone: BasicToneAdjustments::default(),
            color: ColorAdjustments::default(),
            detail: DetailAdjustments::default(),
            effects: EffectAdjustments::default(),
        }
    }
}

impl EditParams {
    pub fn active_adjustment_count(&self) -> usize {
        let mut count = 0;

        count += self.basic_tone.active_count();
        count += self.color.active_count();
        count += self.detail.active_count();
        count += self.effects.active_count();

        count
    }
}
