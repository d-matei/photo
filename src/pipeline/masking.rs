#[derive(Debug, Clone)]
pub enum MaskKind {
    Brush,
    LinearGradient,
    RadialGradient,
    LuminanceRange,
    ColorRange,
    Subject,
    Sky,
}

#[derive(Debug, Clone)]
pub struct MaskDefinition {
    pub id: String,
    pub name: String,
    pub kind: MaskKind,
    pub enabled: bool,
}
