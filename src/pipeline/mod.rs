pub mod adjustments;
pub mod clarity;
pub mod color;
pub mod contrast;
pub mod dehaze;
pub mod exposure;
pub mod masking;
pub mod saturation;

#[derive(Debug, Clone)]
pub struct Pipeline {
    pub stages: Vec<PipelineStage>,
}

impl Default for Pipeline {
    fn default() -> Self {
        Self {
            stages: vec![
                PipelineStage::Decode,
                PipelineStage::Linearize,
                PipelineStage::Demosaic,
                PipelineStage::ApplyGlobalAdjustments,
                PipelineStage::ApplyMasks,
                PipelineStage::ApplyColorGrading,
                PipelineStage::RenderPreview,
                PipelineStage::Export,
            ],
        }
    }
}

#[derive(Debug, Clone)]
pub enum PipelineStage {
    Decode,
    Linearize,
    Demosaic,
    ApplyGlobalAdjustments,
    ApplyMasks,
    ApplyColorGrading,
    RenderPreview,
    Export,
}
