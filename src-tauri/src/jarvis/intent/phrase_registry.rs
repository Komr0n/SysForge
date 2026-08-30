use std::collections::HashMap;
use super::slot_extractor::SlotSchema;

#[derive(Clone, Debug)]
pub struct PhraseEmbedding {
    pub phrase: String,
    pub vector: Vec<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct PhraseRegistry {
    pub skills: HashMap<String, Vec<PhraseEmbedding>>,
    pub slots: HashMap<String, HashMap<String, SlotSchema>>,
}

impl PhraseRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert_phrase(
        &mut self,
        skill_id: &str,
        phrase: String,
        vector: Vec<f32>,
    ) {
        self.skills
            .entry(skill_id.to_string())
            .or_default()
            .push(PhraseEmbedding { phrase, vector });
    }

    pub fn register_slots(
        &mut self,
        skill_id: &str,
        slots: HashMap<String, SlotSchema>,
    ) {
        self.slots.insert(skill_id.to_string(), slots);
    }

    pub fn get_slot_schema(&self, skill_id: &str) -> HashMap<String, SlotSchema> {
        self.slots.get(skill_id).cloned().unwrap_or_default()
    }

    pub fn remove_skill(&mut self, skill_id: &str) {
        self.skills.remove(skill_id);
        self.slots.remove(skill_id);
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, &Vec<PhraseEmbedding>)> {
        self.skills.iter()
    }
}
