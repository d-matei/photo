use eframe::egui;
use image::imageops::FilterType;
use image::{DynamicImage, ImageBuffer, Rgb, RgbImage};
use raw_photo_editor::pipeline::clarity::{apply_clarity_rgb, ClarityConfig};
use raw_photo_editor::pipeline::color::RgbPixel;
use raw_photo_editor::pipeline::contrast::{adjust_contrast_value, ContrastConfig};
use raw_photo_editor::pipeline::dehaze::{apply_dehaze_rgb, DehazeConfig};
use raw_photo_editor::pipeline::exposure::adjust_exposure_value;
use raw_photo_editor::pipeline::saturation::adjust_saturation_pixel;
use raw_photo_editor::pipeline::tonal_ranges::{adjust_tonal_ranges_pixel, TonalRangeAdjustments};
use rfd::FileDialog;
use std::ops::RangeInclusive;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};

const PREVIEW_MAX_SIDE: u32 = 1600;
const SLIDER_LABEL_WIDTH: f32 = 150.0;
const SLIDER_VALUE_WIDTH: f32 = 72.0;

pub fn run() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1480.0, 920.0])
            .with_min_inner_size([1100.0, 760.0])
            .with_maximized(true),
        ..Default::default()
    };

    eframe::run_native(
        "Raw Photo Editor Tester",
        options,
        Box::new(|cc| Ok(Box::new(TesterApp::new(cc)))),
    )
}

#[derive(Debug, Clone, PartialEq)]
struct UiParams {
    exposure: f32,
    whites: f32,
    highlights: f32,
    shadows: f32,
    blacks: f32,
    saturation: f32,
    contrast: f32,
    dehaze: f32,
    clarity: f32,
    contrast_reference: f32,
    contrast_gamma: f32,
    dehaze_block_size: usize,
    dehaze_negative_reference_offset: f32,
    dehaze_positive_saturation_boost: f32,
    clarity_block_size: usize,
    clarity_negative_reference_offset: f32,
    clarity_positive_saturation_compensation: f32,
    clarity_negative_saturation_compensation: f32,
}

impl Default for UiParams {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            whites: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            blacks: 0.0,
            saturation: 0.0,
            contrast: 0.0,
            dehaze: 0.0,
            clarity: 0.0,
            contrast_reference: 128.0,
            contrast_gamma: 0.5,
            dehaze_block_size: 16,
            dehaze_negative_reference_offset: 28.0,
            dehaze_positive_saturation_boost: 1.0,
            clarity_block_size: 16,
            clarity_negative_reference_offset: 28.0,
            clarity_positive_saturation_compensation: 0.38,
            clarity_negative_saturation_compensation: 0.72,
        }
    }
}

struct LoadedImage {
    path: PathBuf,
    full_res: RgbImage,
    preview_res: RgbImage,
}

struct RenderedImage {
    pixels: Vec<RgbPixel>,
    width: usize,
    height: usize,
}

struct TesterApp {
    params: UiParams,
    loaded_image: Option<LoadedImage>,
    use_full_resolution_preview: bool,
    show_original_while_holding: bool,
    preview_texture: Option<egui::TextureHandle>,
    original_texture: Option<egui::TextureHandle>,
    last_preview_signature: Option<(UiParams, bool, PathBuf)>,
    export_status: String,
    render_error: Option<String>,
}

impl TesterApp {
    fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        Self {
            params: UiParams::default(),
            loaded_image: None,
            use_full_resolution_preview: false,
            show_original_while_holding: false,
            preview_texture: None,
            original_texture: None,
            last_preview_signature: None,
            export_status: String::new(),
            render_error: None,
        }
    }

    fn open_image(&mut self, ctx: &egui::Context) {
        if let Some(path) = FileDialog::new()
            .add_filter(
                "Images",
                &["jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif"],
            )
            .pick_file()
        {
            match load_image(&path) {
                Ok(image) => {
                    self.loaded_image = Some(image);
                    self.export_status.clear();
                    self.render_error = None;
                    self.last_preview_signature = None;
                    self.preview_texture = None;
                    self.original_texture = None;
                    self.refresh_original_texture(ctx);
                }
                Err(error) => {
                    self.render_error = Some(error);
                }
            }
        }
    }

    fn save_current_image(&mut self) {
        let Some(loaded) = &self.loaded_image else {
            return;
        };

        let Some(path) = FileDialog::new()
            .set_file_name("edited-preview.png")
            .add_filter("PNG image", &["png"])
            .save_file()
        else {
            return;
        };

        let full_width = loaded.full_res.width() as usize;
        let full_height = loaded.full_res.height() as usize;
        let original_pixels = rgb_image_to_pixels(&loaded.full_res);
        let rendered = match catch_unwind(AssertUnwindSafe(|| {
            process_pipeline(&original_pixels, full_width, full_height, &self.params)
        })) {
            Ok(rendered) => rendered,
            Err(_) => {
                self.render_error = Some(
                    "The processing pipeline panicked while exporting this image.".to_string(),
                );
                return;
            }
        };
        let image = pixels_to_rgb_image(&rendered.pixels, full_width as u32, full_height as u32);

        match image.save(&path) {
            Ok(()) => {
                self.export_status = format!("Saved full-resolution render to {}", path.display());
                self.render_error = None;
            }
            Err(error) => {
                self.render_error = Some(format!("Failed to save image: {error}"));
            }
        }
    }

    fn refresh_original_texture(&mut self, ctx: &egui::Context) {
        let Some(_loaded) = &self.loaded_image else {
            return;
        };

        let source = self.preview_source_image();
        let color_image = rgb_image_to_color_image(source);
        self.original_texture = Some(ctx.load_texture(
            "original-preview",
            color_image,
            egui::TextureOptions::LINEAR,
        ));
        self.last_preview_signature = None;
    }

    fn refresh_preview_texture(&mut self, ctx: &egui::Context) {
        let Some(loaded) = &self.loaded_image else {
            return;
        };

        let signature = (
            self.params.clone(),
            self.use_full_resolution_preview,
            loaded.path.clone(),
        );
        if self.last_preview_signature.as_ref() == Some(&signature) {
            return;
        }

        let source = self.preview_source_image();
        let width = source.width() as usize;
        let height = source.height() as usize;
        let original_pixels = rgb_image_to_pixels(source);
        let rendered = match catch_unwind(AssertUnwindSafe(|| {
            process_pipeline(&original_pixels, width, height, &self.params)
        })) {
            Ok(rendered) => rendered,
            Err(_) => {
                self.render_error = Some(
                    "The processing pipeline panicked while building the preview.".to_string(),
                );
                return;
            }
        };
        let color_image = color_image_from_rendered(&rendered);

        self.preview_texture = Some(ctx.load_texture(
            "processed-preview",
            color_image,
            egui::TextureOptions::LINEAR,
        ));

        self.last_preview_signature = Some(signature);
        self.render_error = None;
    }

    fn preview_source_image(&self) -> &RgbImage {
        let loaded = self
            .loaded_image
            .as_ref()
            .expect("preview_source_image called without image");
        if self.use_full_resolution_preview {
            &loaded.full_res
        } else {
            &loaded.preview_res
        }
    }

    fn draw_controls(&mut self, ui: &mut egui::Ui, ctx: &egui::Context) {
        ui.spacing_mut().slider_width = 260.0;

        ui.heading("Rust Tester");
        ui.label("Native preview app for tuning the real Rust adjustment pipeline.");
        ui.add_space(8.0);

        if ui.button("Open Image").clicked() {
            self.open_image(ctx);
        }

        let save_enabled = self.loaded_image.is_some();
        if ui
            .add_enabled(save_enabled, egui::Button::new("Export Full Resolution"))
            .clicked()
        {
            self.save_current_image();
        }

        if !self.export_status.is_empty() {
            ui.label(&self.export_status);
        }

        if let Some(error) = &self.render_error {
            ui.colored_label(egui::Color32::from_rgb(210, 90, 90), error);
        }

        ui.add_space(12.0);

        let mut preview_mode_changed = false;
        preview_mode_changed |= ui
            .checkbox(
                &mut self.use_full_resolution_preview,
                "Use full-resolution preview",
            )
            .changed();
        ui.label("When disabled, the preview uses a faster proxy image and export still renders the full photo.");

        ui.add_space(12.0);
        ui.separator();
        ui.add_space(8.0);

        let mut params_changed = false;
        let defaults = UiParams::default();
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.exposure,
            -100.0..=100.0,
            "Exposure",
            defaults.exposure,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.whites,
            -100.0..=100.0,
            "Whites",
            defaults.whites,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.highlights,
            -100.0..=100.0,
            "Highlights",
            defaults.highlights,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.shadows,
            -100.0..=100.0,
            "Shadows",
            defaults.shadows,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.blacks,
            -100.0..=100.0,
            "Blacks",
            defaults.blacks,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.saturation,
            -1.0..=1.0,
            "Saturation",
            defaults.saturation,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.contrast,
            -1.0..=1.0,
            "Contrast",
            defaults.contrast,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.dehaze,
            -1.0..=1.0,
            "Dehaze",
            defaults.dehaze,
        );
        params_changed |= add_precise_slider_f32(
            ui,
            &mut self.params.clarity,
            -1.0..=1.0,
            "Clarity",
            defaults.clarity,
        );

        ui.add_space(10.0);
        ui.collapsing("Advanced Tuning", |ui| {
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.contrast_reference,
                0.0..=255.0,
                "Contrast Midpoint",
                defaults.contrast_reference,
            );
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.contrast_gamma,
                0.1..=2.0,
                "Contrast Gamma",
                defaults.contrast_gamma,
            );
            params_changed |= add_precise_slider_usize(
                ui,
                &mut self.params.dehaze_block_size,
                4..=64,
                4.0,
                "Dehaze Block Size",
                defaults.dehaze_block_size,
            );
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.dehaze_negative_reference_offset,
                0.0..=64.0,
                "Dehaze Negative Ref Lift",
                defaults.dehaze_negative_reference_offset,
            );
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.dehaze_positive_saturation_boost,
                0.0..=2.0,
                "Dehaze Positive Saturation",
                defaults.dehaze_positive_saturation_boost,
            );
            params_changed |= add_precise_slider_usize(
                ui,
                &mut self.params.clarity_block_size,
                4..=64,
                4.0,
                "Clarity Block Size",
                defaults.clarity_block_size,
            );
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.clarity_negative_reference_offset,
                0.0..=64.0,
                "Clarity Negative Ref Lift",
                defaults.clarity_negative_reference_offset,
            );
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.clarity_positive_saturation_compensation,
                0.0..=1.5,
                "Clarity Positive Sat Compensation",
                defaults.clarity_positive_saturation_compensation,
            );
            params_changed |= add_precise_slider_f32(
                ui,
                &mut self.params.clarity_negative_saturation_compensation,
                0.0..=1.5,
                "Clarity Negative Sat Compensation",
                defaults.clarity_negative_saturation_compensation,
            );
        });

        ui.add_space(12.0);
        let button = ui.button("Hold To View Original");
        self.show_original_while_holding = button.is_pointer_button_down_on();
        ui.label("You can also hold Space to preview the original.");

        if params_changed || preview_mode_changed {
            if preview_mode_changed {
                self.refresh_original_texture(ctx);
            }
            self.last_preview_signature = None;
        }
    }

    fn draw_preview(&mut self, ui: &mut egui::Ui) {
        let Some(loaded) = &self.loaded_image else {
            ui.centered_and_justified(|ui| {
                ui.label("Open an image to start testing the Rust pipeline.");
            });
            return;
        };

        let show_original =
            self.show_original_while_holding || ui.input(|input| input.key_down(egui::Key::Space));
        let texture = if show_original {
            self.original_texture.as_ref()
        } else {
            self.preview_texture.as_ref()
        };

        let Some(texture) = texture else {
            ui.centered_and_justified(|ui| {
                ui.label("Preparing preview...");
            });
            return;
        };

        let available = ui.available_size();
        let image_size = texture.size_vec2();
        let scale = (available.x / image_size.x)
            .min(available.y / image_size.y)
            .min(1.0);
        let desired_size = image_size * scale.max(0.1);

        ui.vertical_centered(|ui| {
            if let Some(path) = loaded.path.file_name() {
                ui.label(path.to_string_lossy());
            }
            ui.add_space(8.0);
            ui.add(egui::Image::new((texture.id(), desired_size)));
        });
    }
}

fn add_precise_slider_f32(
    ui: &mut egui::Ui,
    value: &mut f32,
    range: RangeInclusive<f32>,
    text: &str,
    reset_value: f32,
) -> bool {
    let min = *range.start();
    let max = *range.end();
    let mut changed = false;
    let desired_width = ui.spacing().slider_width;

    ui.horizontal(|ui| {
        ui.set_height(28.0);
        ui.add_sized(
            [SLIDER_LABEL_WIDTH, 22.0],
            egui::Label::new(text).wrap_mode(egui::TextWrapMode::Truncate),
        );

        let (rect, response) = ui.allocate_exact_size(
            egui::vec2(desired_width, 22.0),
            egui::Sense::click_and_drag(),
        );

        let visuals = ui.style().interact(&response);
        let track_rect = rect.shrink2(egui::vec2(0.0, 7.0));
        let normalized = if (max - min).abs() <= f32::EPSILON {
            0.0
        } else {
            ((*value - min) / (max - min)).clamp(0.0, 1.0)
        };

        paint_slider(ui, track_rect, *visuals, normalized);

        if response.double_clicked() {
            let next_value = reset_value.clamp(min, max);
            if (*value - next_value).abs() > f32::EPSILON {
                *value = next_value;
                changed = true;
            }
        } else if response.is_pointer_button_down_on() || response.dragged() {
            if let Some(pointer) = response.interact_pointer_pos() {
                let t = ((pointer.x - track_rect.left()) / track_rect.width()).clamp(0.0, 1.0);
                let next_value = min + (max - min) * t;
                if (*value - next_value).abs() > f32::EPSILON {
                    *value = next_value;
                    changed = true;
                }
            }
        }

        ui.add_space(8.0);
        ui.add_sized(
            [SLIDER_VALUE_WIDTH, 22.0],
            egui::Label::new(egui::RichText::new(format!("{:.3}", *value)).monospace()),
        );
    });

    changed
}

fn add_precise_slider_usize(
    ui: &mut egui::Ui,
    value: &mut usize,
    range: RangeInclusive<usize>,
    step_by: f64,
    text: &str,
    reset_value: usize,
) -> bool {
    let step = step_by as usize;
    let min = *range.start();
    let max = *range.end();
    let mut changed = false;
    let desired_width = ui.spacing().slider_width;

    ui.horizontal(|ui| {
        ui.set_height(28.0);
        ui.add_sized(
            [SLIDER_LABEL_WIDTH, 22.0],
            egui::Label::new(text).wrap_mode(egui::TextWrapMode::Truncate),
        );

        let (rect, response) = ui.allocate_exact_size(
            egui::vec2(desired_width, 22.0),
            egui::Sense::click_and_drag(),
        );

        let visuals = ui.style().interact(&response);
        let track_rect = rect.shrink2(egui::vec2(0.0, 7.0));
        let min_f = min as f32;
        let max_f = max as f32;
        let current_f = *value as f32;
        let normalized = if (max_f - min_f).abs() <= f32::EPSILON {
            0.0
        } else {
            ((current_f - min_f) / (max_f - min_f)).clamp(0.0, 1.0)
        };

        paint_slider(ui, track_rect, *visuals, normalized);

        if response.hovered() || response.dragged() {
            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
        }

        if response.double_clicked() {
            let next_value = reset_value.clamp(min, max);
            if *value != next_value {
                *value = next_value;
                changed = true;
            }
        } else if response.is_pointer_button_down_on() || response.dragged() {
            if let Some(pointer) = response.interact_pointer_pos() {
                let t = ((pointer.x - track_rect.left()) / track_rect.width()).clamp(0.0, 1.0);
                let raw_value = min as f32 + (max as f32 - min as f32) * t;
                let stepped = if step <= 1 {
                    raw_value.round() as usize
                } else {
                    let stepped_index = ((raw_value - min as f32) / step as f32).round() as usize;
                    min + stepped_index * step
                };
                let next_value = stepped.clamp(min, max);
                if *value != next_value {
                    *value = next_value;
                    changed = true;
                }
            }
        }

        ui.add_space(8.0);
        ui.add_sized(
            [SLIDER_VALUE_WIDTH, 22.0],
            egui::Label::new(egui::RichText::new(value.to_string()).monospace()),
        );
    });

    changed
}

fn paint_slider(
    ui: &mut egui::Ui,
    track_rect: egui::Rect,
    visuals: egui::style::WidgetVisuals,
    normalized: f32,
) {
    ui.painter()
        .rect_filled(track_rect, 6.0, visuals.bg_fill.gamma_multiply(0.55));

    let fill_rect = egui::Rect::from_min_max(
        track_rect.left_top(),
        egui::pos2(
            egui::lerp(track_rect.x_range(), normalized),
            track_rect.bottom(),
        ),
    );
    ui.painter()
        .rect_filled(fill_rect, 6.0, visuals.bg_fill.gamma_multiply(1.15));

    let handle_center = egui::pos2(
        egui::lerp(track_rect.x_range(), normalized),
        track_rect.center().y,
    );
    ui.painter()
        .circle_filled(handle_center, 7.0, visuals.fg_stroke.color);

    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
}

impl eframe::App for TesterApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if self.loaded_image.is_some() {
            self.refresh_preview_texture(ctx);
        }

        egui::SidePanel::left("controls")
            .resizable(true)
            .default_width(340.0)
            .min_width(300.0)
            .show(ctx, |ui| self.draw_controls(ui, ctx));

        egui::CentralPanel::default().show(ctx, |ui| self.draw_preview(ui));
    }
}

fn load_image(path: &Path) -> Result<LoadedImage, String> {
    let dynamic_image =
        image::open(path).map_err(|error| format!("Failed to open {}: {error}", path.display()))?;
    let full_res = dynamic_image.to_rgb8();
    let preview_res = build_preview_image(&dynamic_image);

    Ok(LoadedImage {
        path: path.to_path_buf(),
        full_res,
        preview_res,
    })
}

fn build_preview_image(image: &DynamicImage) -> RgbImage {
    let rgb = image.to_rgb8();
    let width = rgb.width();
    let height = rgb.height();
    let longest_side = width.max(height);

    if longest_side <= PREVIEW_MAX_SIDE {
        rgb
    } else {
        let scale = PREVIEW_MAX_SIDE as f32 / longest_side as f32;
        let preview_width = ((width as f32 * scale).round() as u32).max(1);
        let preview_height = ((height as f32 * scale).round() as u32).max(1);
        image::imageops::resize(&rgb, preview_width, preview_height, FilterType::Lanczos3)
    }
}

fn process_pipeline(
    original_pixels: &[RgbPixel],
    width: usize,
    height: usize,
    params: &UiParams,
) -> RenderedImage {
    let mut pixels = original_pixels.to_vec();

    if params.exposure != 0.0 {
        pixels.iter_mut().for_each(|pixel| {
            pixel.r = adjust_exposure_value(pixel.r, params.exposure);
            pixel.g = adjust_exposure_value(pixel.g, params.exposure);
            pixel.b = adjust_exposure_value(pixel.b, params.exposure);
        });
    }

    let tonal_adjustments = TonalRangeAdjustments {
        whites: params.whites,
        highlights: params.highlights,
        shadows: params.shadows,
        blacks: params.blacks,
    };
    if tonal_adjustments != TonalRangeAdjustments::default() {
        pixels.iter_mut().for_each(|pixel| {
            *pixel = adjust_tonal_ranges_pixel(*pixel, tonal_adjustments);
        });
    }

    if params.saturation != 0.0 {
        pixels = pixels
            .into_iter()
            .map(|pixel| adjust_saturation_pixel(pixel, params.saturation))
            .collect();
    }

    let contrast_config = ContrastConfig {
        reference: params.contrast_reference,
        gamma: params.contrast_gamma,
        max_shift: ContrastConfig::default().max_shift,
    };

    if params.contrast != 0.0 {
        pixels.iter_mut().for_each(|pixel| {
            pixel.r = adjust_contrast_value(pixel.r, params.contrast, contrast_config);
            pixel.g = adjust_contrast_value(pixel.g, params.contrast, contrast_config);
            pixel.b = adjust_contrast_value(pixel.b, params.contrast, contrast_config);
        });
    }

    if params.dehaze != 0.0 {
        pixels = apply_dehaze_rgb(
            &pixels,
            original_pixels,
            width,
            height,
            params.dehaze,
            DehazeConfig {
                block_size: params.dehaze_block_size,
                contrast_boost: DehazeConfig::default().contrast_boost,
                negative_contrast_reference_offset: params.dehaze_negative_reference_offset,
                positive_saturation_boost: params.dehaze_positive_saturation_boost,
                positive_uses_global_reference: DehazeConfig::default()
                    .positive_uses_global_reference,
            },
            contrast_config,
        );
    }

    if params.clarity != 0.0 {
        pixels = apply_clarity_rgb(
            &pixels,
            original_pixels,
            width,
            height,
            params.clarity,
            ClarityConfig {
                block_size: params.clarity_block_size,
                contrast_boost: ClarityConfig::default().contrast_boost,
                negative_contrast_reference_offset: params.clarity_negative_reference_offset,
                positive_saturation_compensation: params.clarity_positive_saturation_compensation,
                negative_saturation_compensation: params.clarity_negative_saturation_compensation,
            },
            contrast_config,
        );
    }

    RenderedImage {
        pixels,
        width,
        height,
    }
}

fn rgb_image_to_pixels(image: &RgbImage) -> Vec<RgbPixel> {
    image
        .pixels()
        .map(|pixel| {
            let [r, g, b] = pixel.0;
            RgbPixel::new(r, g, b)
        })
        .collect()
}

fn pixels_to_rgb_image(pixels: &[RgbPixel], width: u32, height: u32) -> RgbImage {
    ImageBuffer::from_fn(width, height, |x, y| {
        let index = y as usize * width as usize + x as usize;
        let pixel = pixels
            .get(index)
            .copied()
            .unwrap_or_else(|| RgbPixel::new(0, 0, 0));
        Rgb([pixel.r, pixel.g, pixel.b])
    })
}

fn rgb_image_to_color_image(image: &RgbImage) -> egui::ColorImage {
    egui::ColorImage::from_rgb(
        [image.width() as usize, image.height() as usize],
        image.as_raw(),
    )
}

fn color_image_from_rendered(rendered: &RenderedImage) -> egui::ColorImage {
    let bytes: Vec<u8> = rendered
        .pixels
        .iter()
        .flat_map(|pixel| [pixel.r, pixel.g, pixel.b])
        .collect();

    egui::ColorImage::from_rgb([rendered.width, rendered.height], &bytes)
}
