/*!
Saved Dehaze Variants

This file is an archive/reference only. It is not part of the active pipeline.
It exists so we can recover older dehaze ideas later without depending on chat
history or trying to reverse-engineer them from memory.

What is saved here:
1. The current negative dehaze algorithm as a behavior snapshot.
2. The older positive dehaze variant from before we switched positive dehaze
   to a unified/global reference baseline.

These notes intentionally preserve the idea and the important constants rather
than trying to be a drop-in compiled copy of the whole active module.
*/

/// --------------------------------------------------------------------------
/// Variant A
/// Current negative dehaze behavior snapshot
/// --------------------------------------------------------------------------
///
/// Key idea:
/// - Analyze the original image in overlapping local windows.
/// - Use the local mean luminance of each window and the sum of absolute
///   luminance deltas from that mean to compute a haze/flatness score.
/// - Lower local contrast score -> stronger negative dehaze influence.
/// - Negative dehaze keeps the base block size (currently 16px).
/// - No nearby non-covering zones are included on the negative side.
/// - Each pixel gets a weighted blend of:
///   * local boost
///   * local reference
///   from the overlapping windows that cover it.
/// - Apply negative contrast per RGB channel.
/// - Raise the internal contrast reference by +28 to favor brighter glow in
///   highlights.
/// - Apply a positive saturation compensation afterward to counter washout.
///
/// Important constants:
/// - base block size: 16
/// - overlap stride: block_size / 4
/// - signed response: -abs(amount)^0.75
/// - local boost response: boost^0.7
/// - contrast multiplier: 1.45
/// - contrast boost: 0.9
/// - negative contrast reference offset: +28
/// - negative saturation compensation: +0.72 * abs(local_strength)
/// - local reference offset parabola: from -3 in dark zones to +5 in bright
///   zones, blended in mainly above the standard reference
///
/// Sketch of the behavior:
///
/// ```rust,ignore
/// let signed_amount = -amount.abs().powf(0.75);
/// let local_strength = signed_amount * boost.powf(0.7);
/// let contrast_slider = local_strength * 0.9 * 1.45;
///
/// let standard_reference = blended_local_reference;
/// let curved_reference =
///     standard_reference + local_reference_offset_parabola(standard_reference);
///
/// let reference_for_channel =
///     blended_reference_for_value(channel_value, standard_reference, curved_reference);
/// let lifted_reference = (reference_for_channel + 28.0).clamp(0.0, 255.0);
///
/// let r = adjust_contrast(r, contrast_slider, lifted_reference, gamma);
/// let g = adjust_contrast(g, contrast_slider, lifted_reference, gamma);
/// let b = adjust_contrast(b, contrast_slider, lifted_reference, gamma);
///
/// let saturation_fix = local_strength.abs() * 0.72;
/// let pixel = adjust_saturation_pixel(RgbPixel { r, g, b }, saturation_fix);
/// ```

/// --------------------------------------------------------------------------
/// Variant B
/// Older positive dehaze before the global-reference experiment
/// --------------------------------------------------------------------------
///
/// Key idea:
/// - Same local haze-score logic as the main dehaze concept.
/// - Positive dehaze used the larger positive block size (32px when the base
///   block size was 16).
/// - Nearby non-covering zones were already included on the positive side:
///   * radius scale: 1.75
///   * weak extra weight: 0.35
/// - But unlike the later global-reference experiment, the reference baseline
///   still came from the blended local window means.
/// - In other words:
///   * positive dehaze score/boost was local
///   * positive dehaze reference was also local
///   * no whole-image mean reference override yet
/// - Contrast was applied per RGB channel.
/// - At that checkpoint, we were still using reverse saturation compensation
///   rather than the newer positive saturation-lift idea.
///
/// Important constants at that checkpoint:
/// - positive block size: base block size * 2 (typically 32)
/// - overlap stride: block_size / 4
/// - nearby non-covering zone radius scale: 1.75
/// - nearby non-covering zone weight scale: 0.35
/// - signed response: amount^0.58
/// - local boost response: boost^0.7
/// - contrast multiplier: 1.45
/// - contrast boost: 0.9
/// - positive saturation compensation:
///   -0.38 * abs(local_strength)
/// - local reference offset parabola: from -3 in dark zones to +5 in bright
///   zones, blended in mainly above the standard reference
///
/// What made this version distinct:
/// - Positive dehaze still adapted its reference from local overlapping zones.
/// - It had not yet been unified to the whole-image mean luminance.
/// - That made it more locally tone-shaped and less globally normalized.
///
/// Sketch of the behavior:
///
/// ```rust,ignore
/// let signed_amount = amount.powf(0.58);
/// let local_strength = signed_amount * boost.powf(0.7);
/// let contrast_slider = local_strength * 0.9 * 1.45;
///
/// // Important: local reference, not global image mean.
/// let standard_reference = blended_local_reference;
/// let curved_reference =
///     standard_reference + local_reference_offset_parabola(standard_reference);
///
/// let reference_for_r =
///     blended_reference_for_value(r as f32, standard_reference, curved_reference);
/// let reference_for_g =
///     blended_reference_for_value(g as f32, standard_reference, curved_reference);
/// let reference_for_b =
///     blended_reference_for_value(b as f32, standard_reference, curved_reference);
///
/// let r = adjust_contrast(r, contrast_slider, reference_for_r, gamma);
/// let g = adjust_contrast(g, contrast_slider, reference_for_g, gamma);
/// let b = adjust_contrast(b, contrast_slider, reference_for_b, gamma);
///
/// // Old reverse compensation approach.
/// let saturation_fix = -local_strength.abs() * 0.38;
/// let pixel = adjust_saturation_pixel(RgbPixel { r, g, b }, saturation_fix);
/// ```

/// --------------------------------------------------------------------------
/// Shared helper ideas used by both variants
/// --------------------------------------------------------------------------
///
/// Shared local score idea:
/// - compute mean luminance in each window
/// - score = sum(abs(pixel_luminance - mean_luminance)) / (count * 255)
/// - local boost = 1 - score
///
/// Shared selective reference idea:
/// - standard reference = blended local mean reference
/// - curved reference = standard reference + parabola(-3 -> +5)
/// - blend between them with smoothstep over a 24-value transition window
/// - the curved reference influences brighter-above-reference tones more than
///   darker-below-reference tones
///
/// Shared zone weighting idea:
/// - weight = 1 / (1 + distance^2 * 0.55)
/// - closer window centers matter more
/// - farther window centers matter less
///
/// Shared overlap idea:
/// - overlap is 75%
/// - stride = block_size / 4
/// - this gives dense, soft local blending rather than isolated squares
