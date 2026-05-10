#[derive(Debug, Clone, Default)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub camera_model: Option<String>,
    pub color_space: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ImageDocument {
    pub source_path: Option<String>,
    pub metadata: ImageMetadata,
    pub has_decoded_preview: bool,
}

impl ImageDocument {
    pub fn empty() -> Self {
        Self::default()
    }
}
