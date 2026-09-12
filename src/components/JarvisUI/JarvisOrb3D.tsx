// src/components/JarvisUI/JarvisOrb3D.tsx
// Отложенная загрузка 3D-сферы Джарвиса для сохранения code-splitting

import { lazy, Suspense } from 'react';
import type { JarvisState } from '../../lib/jarvis/voice-service';

const JarvisOrb3DImpl = lazy(() => import('./JarvisOrb3DImpl'));

interface JarvisOrb3DProps {
  state: JarvisState;
  size?: number;
  isFollowUp?: boolean;
}

export function JarvisOrb3D({ state, size = 64, isFollowUp = false }: JarvisOrb3DProps) {
  return (
    <Suspense fallback={
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(0, 255, 136, 0.05)',
        border: '1px dashed rgba(0, 255, 136, 0.2)',
      }} />
    }>
      <JarvisOrb3DImpl state={state} size={size} isFollowUp={isFollowUp} />
    </Suspense>
  );
}
