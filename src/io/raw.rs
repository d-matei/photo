use crate::engine::image::ImageDocument;
use crate::error::EditorError;

pub fn open_raw(path: &str) -> Result<ImageDocument, EditorError> {
    if path.trim().is_empty() {
        return Err(EditorError::InvalidState(
            "source path cannot be empty".to_string(),
        ));
    }

    Ok(ImageDocument {
        source_path: Some(path.to_string()),
        ..ImageDocument::default()
    })
}
