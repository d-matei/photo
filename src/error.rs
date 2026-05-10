use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum EditorError {
    UnsupportedFormat(String),
    InvalidState(String),
    Io(String),
}

impl Display for EditorError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedFormat(msg) => write!(f, "unsupported format: {msg}"),
            Self::InvalidState(msg) => write!(f, "invalid state: {msg}"),
            Self::Io(msg) => write!(f, "io error: {msg}"),
        }
    }
}

impl Error for EditorError {}
