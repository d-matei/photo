use std::io::{Cursor, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};

use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
use raw_photo_editor::pipeline::color::RgbPixel;
use raw_photo_editor::pipeline::color_mixer::COLOR_MIXER_ZONE_COUNT;
use raw_photo_editor::pipeline::masking::{
    BrushMask, BrushStroke, LinearGradientMask, MaskDefinition, MaskShape, RadialGradientMask,
};
use raw_photo_editor::pipeline::render::{render_rgb, AdjustmentValues, RenderParams};
use serde::Deserialize;

const ADDRESS: &str = "127.0.0.1:7878";

pub fn run() -> std::io::Result<()> {
    let listener = TcpListener::bind(ADDRESS)?;
    println!("Frontend + Rust backend running at http://{ADDRESS}");
    println!("Press Ctrl+C here when you want to stop the app.");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => handle_connection(stream),
            Err(error) => eprintln!("Connection failed: {error}"),
        }
    }

    Ok(())
}

fn handle_connection(mut stream: TcpStream) {
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            let _ = write_response(&mut stream, 400, "text/plain", error.as_bytes());
            return;
        }
    };

    let response = if request.method == "POST" && request.path == "/api/render" {
        render_endpoint(&request.body)
    } else if request.method == "GET" {
        static_endpoint(&request.path)
    } else {
        Err(ServerError::new(405, "Method not allowed"))
    };

    match response {
        Ok(response) => {
            let _ = write_response(
                &mut stream,
                response.status,
                &response.content_type,
                &response.body,
            );
        }
        Err(error) => {
            let _ = write_response(
                &mut stream,
                error.status,
                "application/json",
                format!(r#"{{"error":"{}"}}"#, escape_json(&error.message)).as_bytes(),
            );
        }
    }
}

fn render_endpoint(body: &[u8]) -> Result<HttpResponse, ServerError> {
    let request: RenderRequest = serde_json::from_slice(body)
        .map_err(|error| ServerError::new(400, format!("Invalid render JSON: {error}")))?;
    let image_bytes = decode_data_url(&request.image_data_url)?;
    let image = image::load_from_memory(&image_bytes)
        .map_err(|error| ServerError::new(400, format!("Could not decode image: {error}")))?
        .to_rgb8();

    let (width, height) = image.dimensions();
    let pixels = image
        .pixels()
        .map(|pixel| RgbPixel::new(pixel[0], pixel[1], pixel[2]))
        .collect::<Vec<_>>();
    let params = request.params.into_render_params();
    let rendered = render_rgb(&pixels, width as usize, height as usize, &params);
    let output = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_fn(width, height, |x, y| {
        let pixel = rendered.pixels[y as usize * rendered.width + x as usize];
        Rgb([pixel.r, pixel.g, pixel.b])
    });

    let mut encoded = Cursor::new(Vec::new());
    DynamicImage::ImageRgb8(output)
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|error| ServerError::new(500, format!("Could not encode preview: {error}")))?;

    let json = format!(
        r#"{{"image_data_url":"data:image/png;base64,{}"}}"#,
        encode_base64(encoded.get_ref())
    );

    Ok(HttpResponse {
        status: 200,
        content_type: "application/json".to_string(),
        body: json.into_bytes(),
    })
}

fn static_endpoint(path: &str) -> Result<HttpResponse, ServerError> {
    let relative_path = match path {
        "/" | "/index.html" => PathBuf::from("frontend/index.html"),
        "/src/app.js" => PathBuf::from("frontend/src/app.js"),
        "/src/styles.css" => PathBuf::from("frontend/src/styles.css"),
        _ => return Err(ServerError::new(404, "Not found")),
    };

    let body = std::fs::read(&relative_path)
        .map_err(|error| ServerError::new(404, format!("Could not read static file: {error}")))?;
    let content_type = content_type_for(&relative_path).to_string();

    Ok(HttpResponse {
        status: 200,
        content_type,
        body,
    })
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = Vec::new();
    let mut temp = [0; 8192];
    let header_end;

    loop {
        let read = stream.read(&mut temp).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("Empty request".to_string());
        }

        buffer.extend_from_slice(&temp[..read]);
        if let Some(index) = find_header_end(&buffer) {
            header_end = index;
            break;
        }
    }

    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = headers.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Missing request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "Missing method".to_string())?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| "Missing path".to_string())?
        .to_string();
    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find_map(|(name, value)| {
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);

    let body_start = header_end + 4;
    let mut body = buffer[body_start..].to_vec();
    while body.len() < content_length {
        let read = stream.read(&mut temp).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&temp[..read]);
    }
    body.truncate(content_length);

    Ok(HttpRequest { method, path, body })
}

fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Internal Server Error",
    };
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    stream.write_all(headers.as_bytes())?;
    stream.write_all(body)
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_type_for(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, ServerError> {
    let encoded = data_url
        .split_once(',')
        .map(|(_, payload)| payload)
        .unwrap_or(data_url);
    decode_base64(encoded.trim())
}

fn decode_base64(input: &str) -> Result<Vec<u8>, ServerError> {
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let mut chunk = [0u8; 4];
    let mut chunk_len = 0;

    for byte in input.bytes().filter(|byte| !byte.is_ascii_whitespace()) {
        chunk[chunk_len] = byte;
        chunk_len += 1;

        if chunk_len == 4 {
            decode_base64_chunk(chunk, &mut output)?;
            chunk_len = 0;
        }
    }

    if chunk_len != 0 {
        return Err(ServerError::new(400, "Invalid base64 image payload"));
    }

    Ok(output)
}

fn decode_base64_chunk(chunk: [u8; 4], output: &mut Vec<u8>) -> Result<(), ServerError> {
    let values = [
        base64_value(chunk[0])?,
        base64_value(chunk[1])?,
        if chunk[2] == b'=' {
            64
        } else {
            base64_value(chunk[2])?
        },
        if chunk[3] == b'=' {
            64
        } else {
            base64_value(chunk[3])?
        },
    ];

    output.push((values[0] << 2) | (values[1] >> 4));
    if values[2] != 64 {
        output.push((values[1] << 4) | (values[2] >> 2));
    }
    if values[3] != 64 {
        output.push((values[2] << 6) | values[3]);
    }

    Ok(())
}

fn base64_value(byte: u8) -> Result<u8, ServerError> {
    match byte {
        b'A'..=b'Z' => Ok(byte - b'A'),
        b'a'..=b'z' => Ok(byte - b'a' + 26),
        b'0'..=b'9' => Ok(byte - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        _ => Err(ServerError::new(400, "Invalid base64 image payload")),
    }
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(third & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }

    output
}

fn escape_json(message: &str) -> String {
    message.replace('\\', "\\\\").replace('"', "\\\"")
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

struct HttpResponse {
    status: u16,
    content_type: String,
    body: Vec<u8>,
}

#[derive(Debug)]
struct ServerError {
    status: u16,
    message: String,
}

impl ServerError {
    fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct RenderRequest {
    image_data_url: String,
    params: RenderParamsDto,
}

#[derive(Debug, Deserialize)]
struct RenderParamsDto {
    global: AdjustmentValuesDto,
    #[serde(default)]
    masks: Vec<MaskDefinitionDto>,
}

impl RenderParamsDto {
    fn into_render_params(self) -> RenderParams {
        RenderParams {
            global: self.global.into_adjustment_values(),
            masks: self
                .masks
                .into_iter()
                .filter_map(MaskDefinitionDto::into_mask_definition)
                .collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct MaskDefinitionDto {
    id: String,
    name: String,
    enabled: bool,
    density: f32,
    inverted: bool,
    shape: MaskShapeDto,
    adjustments: AdjustmentValuesDto,
}

impl MaskDefinitionDto {
    fn into_mask_definition(self) -> Option<MaskDefinition<AdjustmentValues>> {
        Some(MaskDefinition {
            id: self.id,
            name: self.name,
            enabled: self.enabled,
            density: self.density,
            inverted: self.inverted,
            shape: self.shape.into_mask_shape()?,
            adjustments: self.adjustments.into_adjustment_values(),
        })
    }
}

#[derive(Debug, Deserialize)]
struct MaskShapeDto {
    linear_gradient: Option<LinearGradientMask>,
    radial_gradient: Option<RadialGradientMask>,
    brush: Option<BrushMaskDto>,
}

impl MaskShapeDto {
    fn into_mask_shape(self) -> Option<MaskShape> {
        if let Some(mask) = self.linear_gradient {
            return Some(MaskShape::LinearGradient(mask));
        }
        if let Some(mask) = self.radial_gradient {
            return Some(MaskShape::RadialGradient(mask));
        }
        self.brush
            .map(|mask| MaskShape::Brush(mask.into_brush_mask()))
    }
}

#[derive(Debug, Deserialize)]
struct BrushMaskDto {
    #[serde(default)]
    strokes: Vec<BrushStroke>,
}

impl BrushMaskDto {
    fn into_brush_mask(self) -> BrushMask {
        BrushMask {
            strokes: self.strokes,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct AdjustmentValuesDto {
    #[serde(default)]
    exposure: f32,
    #[serde(default)]
    whites: f32,
    #[serde(default)]
    highlights: f32,
    #[serde(default)]
    shadows: f32,
    #[serde(default)]
    blacks: f32,
    #[serde(default)]
    temperature: f32,
    #[serde(default)]
    tint: f32,
    #[serde(default = "default_global_hue")]
    global_grading_hue: f32,
    #[serde(default)]
    global_grading_intensity: f32,
    #[serde(default = "default_shadows_hue")]
    shadows_grading_hue: f32,
    #[serde(default)]
    shadows_grading_intensity: f32,
    #[serde(default = "default_midtones_hue")]
    midtones_grading_hue: f32,
    #[serde(default)]
    midtones_grading_intensity: f32,
    #[serde(default = "default_highlights_hue")]
    highlights_grading_hue: f32,
    #[serde(default)]
    highlights_grading_intensity: f32,
    #[serde(default)]
    color_grading_reference: f32,
    #[serde(default)]
    mixer_hue: Vec<f32>,
    #[serde(default)]
    mixer_saturation: Vec<f32>,
    #[serde(default)]
    mixer_luminance: Vec<f32>,
    #[serde(default)]
    saturation: f32,
    #[serde(default)]
    contrast: f32,
    #[serde(default)]
    dehaze: f32,
    #[serde(default)]
    clarity: f32,
    #[serde(default = "default_contrast_reference")]
    contrast_reference: f32,
    #[serde(default = "default_contrast_gamma")]
    contrast_gamma: f32,
    #[serde(default = "default_dehaze_block_size")]
    dehaze_block_size: usize,
    #[serde(default = "default_reference_offset")]
    dehaze_negative_reference_offset: f32,
    #[serde(default = "default_positive_saturation_boost")]
    dehaze_positive_saturation_boost: f32,
    #[serde(default = "default_clarity_block_size")]
    clarity_block_size: usize,
    #[serde(default = "default_reference_offset")]
    clarity_negative_reference_offset: f32,
    #[serde(default = "default_clarity_positive_saturation_compensation")]
    clarity_positive_saturation_compensation: f32,
    #[serde(default = "default_clarity_negative_saturation_compensation")]
    clarity_negative_saturation_compensation: f32,
}

impl AdjustmentValuesDto {
    fn into_adjustment_values(self) -> AdjustmentValues {
        AdjustmentValues {
            exposure: self.exposure,
            whites: self.whites,
            highlights: self.highlights,
            shadows: self.shadows,
            blacks: self.blacks,
            temperature: self.temperature,
            tint: self.tint,
            global_grading_hue: self.global_grading_hue,
            global_grading_intensity: self.global_grading_intensity,
            shadows_grading_hue: self.shadows_grading_hue,
            shadows_grading_intensity: self.shadows_grading_intensity,
            midtones_grading_hue: self.midtones_grading_hue,
            midtones_grading_intensity: self.midtones_grading_intensity,
            highlights_grading_hue: self.highlights_grading_hue,
            highlights_grading_intensity: self.highlights_grading_intensity,
            color_grading_reference: self.color_grading_reference,
            mixer_hue: fixed_mixer_values(&self.mixer_hue),
            mixer_saturation: fixed_mixer_values(&self.mixer_saturation),
            mixer_luminance: fixed_mixer_values(&self.mixer_luminance),
            saturation: self.saturation,
            contrast: self.contrast,
            dehaze: self.dehaze,
            clarity: self.clarity,
            contrast_reference: self.contrast_reference,
            contrast_gamma: self.contrast_gamma,
            dehaze_block_size: self.dehaze_block_size,
            dehaze_negative_reference_offset: self.dehaze_negative_reference_offset,
            dehaze_positive_saturation_boost: self.dehaze_positive_saturation_boost,
            clarity_block_size: self.clarity_block_size,
            clarity_negative_reference_offset: self.clarity_negative_reference_offset,
            clarity_positive_saturation_compensation: self.clarity_positive_saturation_compensation,
            clarity_negative_saturation_compensation: self.clarity_negative_saturation_compensation,
        }
    }
}

fn fixed_mixer_values(values: &[f32]) -> [f32; COLOR_MIXER_ZONE_COUNT] {
    let mut fixed = [0.0; COLOR_MIXER_ZONE_COUNT];
    for (index, value) in values
        .iter()
        .copied()
        .take(COLOR_MIXER_ZONE_COUNT)
        .enumerate()
    {
        fixed[index] = value;
    }
    fixed
}

fn default_global_hue() -> f32 {
    AdjustmentValues::default().global_grading_hue
}

fn default_shadows_hue() -> f32 {
    AdjustmentValues::default().shadows_grading_hue
}

fn default_midtones_hue() -> f32 {
    AdjustmentValues::default().midtones_grading_hue
}

fn default_highlights_hue() -> f32 {
    AdjustmentValues::default().highlights_grading_hue
}

fn default_contrast_reference() -> f32 {
    AdjustmentValues::default().contrast_reference
}

fn default_contrast_gamma() -> f32 {
    AdjustmentValues::default().contrast_gamma
}

fn default_dehaze_block_size() -> usize {
    AdjustmentValues::default().dehaze_block_size
}

fn default_clarity_block_size() -> usize {
    AdjustmentValues::default().clarity_block_size
}

fn default_reference_offset() -> f32 {
    AdjustmentValues::default().dehaze_negative_reference_offset
}

fn default_positive_saturation_boost() -> f32 {
    AdjustmentValues::default().dehaze_positive_saturation_boost
}

fn default_clarity_positive_saturation_compensation() -> f32 {
    AdjustmentValues::default().clarity_positive_saturation_compensation
}

fn default_clarity_negative_saturation_compensation() -> f32 {
    AdjustmentValues::default().clarity_negative_saturation_compensation
}
