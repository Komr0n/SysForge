// src/lib/jarvis/whisper-stt.ts
// Быстрая транскрипция аудио через Whisper API (Groq / OpenAI) и Google Gemini

import { CloudProviderProfile } from '../../store/settingsStore';

export async function transcribeAudioBlob(
  audioBlob: Blob,
  providers: CloudProviderProfile[] = []
): Promise<string | null> {
  // 1. Проверяем Groq Whisper (сверхбыстрый, ~300мс)
  const groq = providers.find((p) => p.id === 'groq' && p.enabled && p.apiKey?.trim().length > 0);
  if (groq) {
    const text = await transcribeViaGroqOrOpenAI(audioBlob, groq, true);
    if (text) return text;
  }

  // 2. Проверяем Google Gemini (нативно поддерживает аудио через multimodal inline_data)
  const gemini = providers.find((p) => p.id === 'gemini' && p.enabled && p.apiKey?.trim().length > 0);
  if (gemini) {
    const text = await transcribeViaGemini(audioBlob, gemini);
    if (text) return text;
  }

  // 3. Проверяем OpenAI Whisper
  const openai = providers.find((p) => p.id === 'openai' && p.enabled && p.apiKey?.trim().length > 0);
  if (openai) {
    const text = await transcribeViaGroqOrOpenAI(audioBlob, openai, false);
    if (text) return text;
  }

  return null;
}

async function transcribeViaGemini(audioBlob: Blob, provider: CloudProviderProfile): Promise<string | null> {
  try {
    const buffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    const model = provider.model?.trim() || 'gemini-3.6-flash';
    const cleanModel = model.startsWith('models/') ? model.slice(7) : model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${provider.apiKey.trim()}`;

    const body = {
      contents: [{
        parts: [
          { text: 'Транскрибируй голосовую команду пользователя на русском языке. Верни ТОЛЬКО распознанный текст без кавычек, без лишних слов и без пояснений.' },
          {
            inline_data: {
              mime_type: audioBlob.type || 'audio/webm',
              data: base64Audio,
            }
          }
        ]
      }]
    };

    let responseText = '';
    // Пробуем через Tauri IPC для надёжного обхода любых сетевых/CORS ограничений
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{ status: number; body: string }>('jarvis_llm_request', {
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status >= 200 && res.status < 300) {
          responseText = res.body;
        }
      } catch (err) {
        console.warn('[GeminiSTT] Tauri invoke failed, falling back to fetch:', err);
      }
    }

    if (!responseText) {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        console.warn('[GeminiSTT] API error:', resp.status);
        return null;
      }
      responseText = await resp.text();
    }

    const data = JSON.parse(responseText);
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidate?.trim() || null;
  } catch (err) {
    console.warn('[GeminiSTT] Request failed:', err);
    return null;
  }
}

async function transcribeViaGroqOrOpenAI(audioBlob: Blob, provider: CloudProviderProfile, isGroq: boolean): Promise<string | null> {
  const url = isGroq
    ? 'https://api.groq.com/openai/v1/audio/transcriptions'
    : 'https://api.openai.com/v1/audio/transcriptions';
  const model = isGroq ? 'whisper-large-v3-turbo' : 'whisper-1';

  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', model);
  formData.append('language', 'ru');

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
      console.warn('[WhisperSTT] API error:', response.status);
      return null;
    }

    const data = (await response.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[WhisperSTT] Request failed:', err);
    return null;
  }
}

