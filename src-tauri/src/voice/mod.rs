// Voice module for future native STT/TTS bridges
// Web Speech API is currently the primary front-end provider

#[tauri::command]
pub fn check_voice_availability() -> bool {
    true
}
