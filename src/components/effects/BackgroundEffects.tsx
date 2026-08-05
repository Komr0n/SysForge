import { useSettingsStore, BackgroundType } from '../../store/settingsStore';
import MatrixRain from './MatrixRain';
import StarField from './StarField';
import ParticleNetwork from './ParticleNetwork';
import NebulaEffect from './NebulaEffect';
import ElectricStorm from './ElectricStorm';
import CircuitBoard from './CircuitBoard';
import HexagonGrid from './HexagonGrid';
import AuroraEffect from './AuroraEffect';
import PlasmaEffect from './PlasmaEffect';

const BG_LABELS: { value: BackgroundType; label: string }[] = [
  { value: 'matrix', label: 'Matrix Rain' },
  { value: 'particles', label: 'Particle Net' },
  { value: 'stars', label: 'Star Field' },
  { value: 'nebula', label: 'Nebula' },
  { value: 'storm', label: 'Electric Storm' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'hexagon', label: 'Hex Grid' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'plasma', label: 'Plasma' },
  { value: 'grid', label: 'Cyber Grid' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'none', label: 'None' },
];

export default function BackgroundEffects() {
  const background = useSettingsStore((s) => s.background);
  const lowPowerMode = useSettingsStore((s) => s.performance.lowPowerMode);

  // In low-power mode, always fall back to a static gradient.
  if (lowPowerMode) {
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
      {/* Layer 1: Static gradient base (always present for depth) */}
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

      {/* Layer 2: chosen background effect */}
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

      {/* Scanline overlay for CRT feel */}
      <div className="scanline-overlay" />

      {/* Vignette overlay for cinematic depth */}
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
