pub mod image;
pub mod params;

use crate::pipeline::Pipeline;
use image::ImageDocument;
use params::EditParams;

#[derive(Debug, Clone)]
pub struct EditorSession {
    pub document: ImageDocument,
    pub params: EditParams,
    pub pipeline: Pipeline,
}

impl EditorSession {
    pub fn new() -> Self {
        Self {
            document: ImageDocument::empty(),
            params: EditParams::default(),
            pipeline: Pipeline::default(),
        }
    }

    pub fn describe(&self) -> String {
        format!(
            "RAW Photo Editor session ready. Active adjustments: {}",
            self.params.active_adjustment_count()
        )
    }
}
