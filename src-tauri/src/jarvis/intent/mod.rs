pub mod embedding_classifier;
pub mod phrase_registry;
pub mod slot_extractor;

pub use embedding_classifier::{embed_text, match_intent, IntentMatch};
pub use phrase_registry::PhraseRegistry;
pub use slot_extractor::SlotSchema;
