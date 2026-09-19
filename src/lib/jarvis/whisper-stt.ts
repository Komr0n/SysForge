// src/lib/jarvis/whisper-stt.ts
// Быстрая транскрипция аудио через Whisper API (Groq / OpenAI) и Google Gemini
// Все API-запросы проксируются через Rust Tauri backend для обхода CORS

import { CloudProviderProfile } from '../../store/settingsStore';

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** Конвертирует Blob в base64-строку */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function transcribeAudioBlob(
  audioBlob: Blob,
  providers: CloudProviderProfile[] = [],
  language = 'ru'
): Promise<string | null> {
  // 1. Проверяем Groq Whisper (сверхбыстрый, ~300мс)
  const groq = providers.find((p) => p.id === 'groq' && p.enabled && p.apiKey?.trim().length > 0);
  if (groq) {
    const text = await transcribeViaWhisperAPI(audioBlob, groq, true, language);
    if (text) return text;
  }

  // 2. Проверяем Google Gemini (нативно поддерживает аудио через multimodal inline_data)
  const gemini = providers.find((p) => p.id === 'gemini' && p.enabled && p.apiKey?.trim().length > 0);
  if (gemini) {
    const text = await transcribeViaGemini(audioBlob, gemini, language);
    if (text) return text;
  }

  // 3. Проверяем OpenAI Whisper
  const openai = providers.find((p) => p.id === 'openai' && p.enabled && p.apiKey?.trim().length > 0);
  if (openai) {
    const text = await transcribeViaWhisperAPI(audioBlob, openai, false, language);
    if (text) return text;
  }

  return null;
}

async function transcribeViaGemini(
  audioBlob: Blob,
  provider: CloudProviderProfile,
  language: string
): Promise<string | null> {
  try {
    const base64Audio = await blobToBase64(audioBlob);

    const model = provider.model?.trim() || 'gemini-3.6-flash';
    const cleanModel = model.startsWith('models/') ? model.slice(7) : model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${provider.apiKey.trim()}`;

    const langPrompt = language.startsWith('en')
      ? 'Transcribe the user\'s voice command in English. Return ONLY the recognized text without quotes, extra words or explanations.'
      : 'Транскрибируй голосовую команду пользователя на русском языке. Верни ТОЛЬКО распознанный текст без кавычек, без лишних слов и без пояснений.';

    const body = {
      contents: [{
        parts: [
          { text: langPrompt },
          {
            inline_data: {
              mime_type: audioBlob.type || 'audio/webm',
              data: base64Audio,
            }
          }
        ]
      }]
    };

    let responseData: any = null;

    // Через Tauri IPC (обход CORS)
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        responseData = await invoke('jarvis_llm_request', {
          req: {
            url,
            headers: { 'Content-Type': 'application/json' },
            body,
          },
        });
      } catch (err) {
        console.warn('[GeminiSTT] Tauri invoke failed, falling back to fetch:', err);
      }
    }

    // Fallback через fetch (браузерная среда)
    if (!responseData) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) {
        console.warn('[GeminiSTT] API error:', resp.status);
        return null;
      }
      responseData = await resp.json();
    }

    const candidate = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidate?.trim() || null;
  } catch (err) {
    console.warn('[GeminiSTT] Request failed:', err);
    return null;
  }
}

async function transcribeViaWhisperAPI(
  audioBlob: Blob,
  provider: CloudProviderProfile,
  isGroq: boolean,
  language: string
): Promise<string | null> {
  const url = isGroq
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';
  const model = isGroq ? 'whisper-large-v3-turbo' : 'whisper-1';
  const apiKey = provider.apiKey.trim();

  // Через Tauri backend (обход CORS, multipart через Rust)
  if (isTauri) {
    try {
      const base64Audio = await blobToBase64(audioBlob);
      const mimeType = audioBlob.type || 'audio/webm';
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';

      const { invoke } = await import('@tauri-apps/api/core');
      const text = await invoke<string>('jarvis_whisper_transcribe', {
        req: {
          url,
          api_key: apiKey,
          model,
          language,
          audio_base64: base64Audio,
          file_name: `audio.${ext}`,
          mime_type: mimeType,
        },
      });
      if (text && text.trim()) return text.trim();
    } catch (err) {
      console.warn(`[WhisperSTT] Tauri proxy failed for ${isGroq ? 'Groq' : 'OpenAI'}:`, err);
    }
  }

  // Fallback через fetch (только для браузерной среды, не в Tauri)
  try {
    const formData = new FormData();
    const mimeType = audioBlob.type || 'audio/webm';
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
    formData.append('file', audioBlob, `audio.${ext}`);
    formData.append('model', model);
    formData.append('language', language);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      console.warn('[WhisperSTT] API error:', response.status);
      return null;
    }

    const data = (await response.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[WhisperSTT] Fetch request failed:', err);
    return null;
  }
}
