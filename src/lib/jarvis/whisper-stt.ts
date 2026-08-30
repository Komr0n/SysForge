// src/lib/jarvis/whisper-stt.ts
// Быстрая транскрипция аудио через Whisper API (Groq / OpenAI)

import { CloudProviderProfile } from '../../store/settingsStore';

export async function transcribeAudioBlob(
  audioBlob: Blob,
  providers: CloudProviderProfile[] = []
): Promise<string | null> {
  // Ищем провайдер Groq или OpenAI с активным API ключом
  const groq = providers.find((p) => p.id === 'groq' && p.enabled && p.apiKey?.trim().length > 0);
  const openai = providers.find((p) => p.id === 'openai' && p.enabled && p.apiKey?.trim().length > 0);
  const provider = groq || openai;

  if (!provider) return null;

  const isGroq = provider.id === 'groq';
  const url = isGroq
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';
  const model = isGroq ? 'whisper-large-v3-turbo' : 'whisper-1';

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', model);
  formData.append('language', 'ru'); // русский с авто-детектом

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey.trim()}`,
      },
      body: formData,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn('[WhisperSTT] API error:', response.status, await response.text().catch(() => ''));
      return null;
    }

    const data = (await response.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[WhisperSTT] Request failed:', err);
    return null;
  }
}
