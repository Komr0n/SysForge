use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use super::phrase_registry::PhraseRegistry;
use super::slot_extractor::extract_slots;
use fastembed::{EmbeddingModel, TextInitOptions, TextEmbedding};
use once_cell::sync::OnceCell;
use std::sync::Mutex;

static MODEL: OnceCell<Mutex<TextEmbedding>> = OnceCell::new();

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IntentVector {
    pub skill_id: String,
    pub vector: Vec<f32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct IntentMatch {
    pub skill_id: String,
    pub confidence: f32,
    pub extracted_slots: HashMap<String, String>,
}

/// Initialize FastEmbed ONNX model with MultilingualE5Small
pub fn get_or_init_model() -> Option<&'static Mutex<TextEmbedding>> {
    MODEL.get_or_try_init(|| {
        let opts = TextInitOptions::new(EmbeddingModel::MultilingualE5Small)
            .with_show_download_progress(false);
        TextEmbedding::try_new(opts)
            .map(Mutex::new)
            .map_err(|e| format!("FastEmbed init error: {}", e))
    }).ok()
}

/// Compute cosine similarity between two float vectors
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;

    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }

    let denom = norm_a.sqrt() * norm_b.sqrt();
    if denom > 0.0 {
        dot / denom
    } else {
        0.0
    }
}

/// Generate semantic embedding vector using FastEmbed or fallback to n-gram hashing
pub fn embed_text(text: &str) -> Vec<f32> {
    if let Some(model_mutex) = get_or_init_model() {
        if let Ok(mut model) = model_mutex.lock() {
            if let Ok(embeddings) = model.embed(vec![text], None) {
                if let Some(mut first) = embeddings.into_iter().next() {
                    let norm: f32 = first.iter().map(|x| x * x).sum::<f32>().sqrt();
                    if norm > 0.0 {
                        for x in &mut first {
                            *x /= norm;
                        }
                    }
                    return first;
                }
            }
        }
    }

    // Fallback n-gram hash vector (256-dim)
    const DIM: usize = 256;
    let mut vec = vec![0.0f32; DIM];
    let lower = text.to_lowercase();
    let chars: Vec<char> = lower.chars().collect();

    if chars.is_empty() {
        return vec;
    }

    for n in 1..=3 {
        for window in chars.windows(n) {
            let mut h = 0u64;
            for &c in window {
                h = h.wrapping_mul(31).wrapping_add(c as u64);
            }
            let idx = (h as usize) % DIM;
            vec[idx] += 1.0;
        }
    }

    for word in lower.split_whitespace() {
        let mut h = 5381u64;
        for b in word.bytes() {
            h = ((h << 5).wrapping_add(h)).wrapping_add(b as u64);
        }
        let idx = (h as usize) % DIM;
        vec[idx] += 2.0;
    }

    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in &mut vec {
            *x /= norm;
        }
    }

    vec
}

/// Match input text against the phrase registry using cosine similarity and slot extraction
pub fn match_intent(
    input: &str,
    registry: &PhraseRegistry,
    threshold: f32,
) -> Option<IntentMatch> {
    let input_embedding = embed_text(input);
    let mut best_skill: Option<(String, f32)> = None;

    for (skill_id, phrase_embeddings) in registry.iter() {
        for pe in phrase_embeddings {
            let sim = cosine_similarity(&input_embedding, &pe.vector);
            if best_skill.is_none() || sim > best_skill.as_ref().unwrap().1 {
                best_skill = Some((skill_id.clone(), sim));
            }
        }
    }

    if let Some((skill_id, confidence)) = best_skill {
        if confidence >= threshold {
            let slot_schemas = registry.get_slot_schema(&skill_id);
            let extracted_slots = extract_slots(input, &slot_schemas);
            return Some(IntentMatch {
                skill_id,
                confidence,
                extracted_slots,
            });
        }
    }

    None
}
