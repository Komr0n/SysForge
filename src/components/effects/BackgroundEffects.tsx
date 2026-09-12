import { Suspense, lazy } from 'react';
import { useSettingsStore, BackgroundType } from '../../store/settingsStore';

// Code-split all heavy background effect components
const MatrixRain = lazy(() => import('./MatrixRain'));
const StarField = lazy(() => import('./StarField'));
const ParticleNetwork = lazy(() => import('./ParticleNetwork'));
const NebulaEffect = lazy(() => import('./NebulaEffect'));
const ElectricStorm = lazy(() => import('./ElectricStorm'));
const CircuitBoard = lazy(() => import('./CircuitBoard'));
const HexagonGrid = lazy(() => import('./HexagonGrid'));
const AuroraEffect = lazy(() => import('./AuroraEffect'));
const PlasmaEffect = lazy(() => import('./PlasmaEffect'));

const BG_LABELS: { value: BackgroundType; label: string }[] = [
  { value: 'grid', label: 'Cyber Grid (Default)' },
  { value: 'matrix', label: 'Matrix Rain' },
  { value: 'particles', label: 'Particle Net' },
  { value: 'none', label: 'Clean / None' },
  { value: 'stars', label: 'Star Field (Exp)' },
  { value: 'nebula', label: 'Nebula (Exp)' },
  { value: 'storm', label: 'Electric Storm (Exp)' },
  { value: 'circuit', label: 'Circuit (Exp)' },
  { value: 'hexagon', label: 'Hex Grid (Exp)' },
  { value: 'aurora', label: 'Aurora (Exp)' },
  { value: 'plasma', label: 'Plasma (Exp)' },
  { value: 'gradient', label: 'Gradient (Exp)' },
];

export default function BackgroundEffects() {
  const background = useSettingsStore((s) => s.background);
  const lowPowerMode = useSettingsStore((s) => s.performance.lowPowerMode);
  const reduceMotion = useSettingsStore((s) => s.performance.reduceMotion);

  if (lowPowerMode || reduceMotion) {
    return (
      <div
        className="animated-gradient"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />
    );
  }

  return (
    <>
      {/* Layer 1: Static gradient base */}
      <div
        className="animated-gradient"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Layer 2: Chosen background effect with Suspense */}
      <Suspense fallback={null}>
        {background === 'grid' && (
          <div
            className="animated-grid"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />
        )}

        {background === 'matrix' && <MatrixRain />}
        {background === 'stars' && <StarField />}
        {background === 'particles' && <ParticleNetwork />}
        {background === 'nebula' && <NebulaEffect />}
        {background === 'storm' && <ElectricStorm />}
        {background === 'circuit' && <CircuitBoard />}
        {background === 'hexagon' && <HexagonGrid />}
        {background === 'aurora' && <AuroraEffect />}
        {background === 'plasma' && <PlasmaEffect />}
      </Suspense>

      {/* CRT Scanline overlay */}
      <div className="scanline-overlay" />

      {/* Vignette overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.4) 100%)',
        }}
      />
    </>
  );
}

export { BG_LABELS };
