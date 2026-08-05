import { useEffect, useState, useCallback, useRef } from 'react';

interface BootScreenProps {
  onComplete: () => void;
}

const bootLines = [
  'SYSFORGE v1.0.0 — INITIALIZING...',
  'PERFORMING POWER-ON SELF TEST .............. OK',
  'CPU: 12th Gen Intel Core i7-12700H .............. OK',
  'MEMORY: 32 GB DDR5 .......................... OK',
  'CACHE: L1 1.25 MB · L2 20 MB · L3 25 MB ...... OK',
  'NETWORK INTERFACES: eth0, wlan0, lo .............. OK',
  'DETECTING STORAGE DEVICES .................. OK',
  '  /dev/sda1  SYSTEM  512 GB  NVMe ........... OK',
  '  /dev/sdb1  DATA    1.0 TB  SSD ............ OK',
  'LOADING KERNEL MODULES: [████████░░] 80%',
  'LOADING KERNEL DRIVERS: [██████████] 100%',
  'MOUNTING VIRTUAL FILESYSTEMS .................. OK',
  '  /proc  .................. mounted',
  '  /sys   .................. mounted',
  '  /dev   .................. mounted',
  '  /tmp   .................. mounted',
  'STARTING SECURE CHANNELS ..................... OK',
  'INITIALIZING CRYPTO ENGINE (AES-256) ......... OK',
  'LOADING SYSADMIN TOOLKIT MODULES ............. OK',
  '  network  ............ loaded',
  '  security ............ loaded',
  '  system   ............ loaded',
  '  developer ........... loaded',
  'ESTABLISHING SECURE SHELL .................... OK',
  'CALIBRATING RADAR SUBSYSTEM .................. OK',
  '',
  'SYSTEM READY.',
];

const radarDots = [
  { angle: 0, distance: 80, label: 'KERNEL' },
  { angle: 90, distance: 100, label: 'NETWORK' },
  { angle: 180, distance: 70, label: 'MEMORY' },
  { angle: 270, distance: 90, label: 'DISK I/O' },
];

type Phase = 'booting' | 'awaitingStart' | 'fadingOut';

export default function BootScreen({ onComplete }: BootScreenProps) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [showLogo, setShowLogo] = useState(false);
  const [showRadar, setShowRadar] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [phase, setPhase] = useState<Phase>('booting');

  // Refs make the logic immune to re-renders
  const phaseRef = useRef<Phase>('booting');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  // Keep onCompleteRef fresh without retriggering the boot effect
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finishBoot = useCallback(() => {
    // Single entry point — idempotent guard
    if (completedRef.current) return;
    completedRef.current = true;
    phaseRef.current = 'fadingOut';
    setPhase('fadingOut');
    // Hard fallback: even if React state somehow stalls, force completion
    window.setTimeout(() => {
      onCompleteRef.current();
    }, 650);
  }, []);

  const goToStartGate = useCallback(() => {
    if (phaseRef.current !== 'booting') return;
    phaseRef.current = 'awaitingStart';
    setPhase('awaitingStart');
  }, []);

  // Auto-start 4s after reaching the start gate
  useEffect(() => {
    if (phase !== 'awaitingStart') return;
    const timer = window.setTimeout(() => {
      if (phaseRef.current === 'awaitingStart') finishBoot();
    }, 4000);
    return () => clearTimeout(timer);
  }, [phase, finishBoot]);

  useEffect(() => {
    // Stage 1: typewriter text
    let lineIndex = 0;
    const lineInterval = setInterval(() => {
      if (lineIndex < bootLines.length) {
        setVisibleLines((prev) => [...prev, bootLines[lineIndex]]);
        lineIndex++;
      } else {
        clearInterval(lineInterval);
      }
    }, 180);

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    timeouts.push(setTimeout(() => setShowLogo(true), 3000));
    timeouts.push(setTimeout(() => setShowRadar(true), 5500));
    timeouts.push(setTimeout(() => setShowProgress(true), 800));

    // Stage 5: switch to "press to start" gate after full sequence
    timeouts.push(setTimeout(() => goToStartGate(), 9000));

    // EMERGENCY FALLBACK: auto-start no matter what after 13s
    // This makes it impossible to ever get stuck on a blank screen
    timeouts.push(setTimeout(() => finishBoot(), 13000));

    // Global key handler
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (phaseRef.current === 'booting') {
          finishBoot(); // skip everything immediately
        } else if (phaseRef.current === 'awaitingStart') {
          finishBoot();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(lineInterval);
      timeouts.forEach(clearTimeout);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [goToStartGate, finishBoot]);

  const isAwaitingStart = phase === 'awaitingStart';
  const isFadingOut = phase === 'fadingOut';

  return (
    <div
      className="boot-container"
      style={{
        opacity: isFadingOut ? 0 : 1,
        transition: 'opacity 0.6s ease',
      }}
      onClick={() => {
        // Any click: if booting → skip; if awaiting → start
        if (phaseRef.current === 'booting') {
          goToStartGate();
        } else if (phaseRef.current === 'awaitingStart') {
          finishBoot();
        }
      }}
    >
      {/* Stage 1: BIOS-style text scroll */}
      <div className="boot-text">
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className="boot-text-line"
            style={{
              animationDelay: `${i * 0.05}s`,
              width: 'auto',
              opacity: 1,
            }}
          >
            {line}
            {i === visibleLines.length - 1 && line.length > 0 && (
              <span className="animate-pulse">_</span>
            )}
          </div>
        ))}
      </div>

      {/* Stage 2: Logo with glitch effect */}
      {showLogo && (
        <div className="boot-logo" style={{ opacity: 1 }}>
          <div className="boot-logo-text">
            SYSFORGE
            <div className="glitch-layer glitch-layer-r">SYSFORGE</div>
            <div className="glitch-layer glitch-layer-g">SYSFORGE</div>
            <div className="glitch-layer glitch-layer-b">SYSFORGE</div>
          </div>
          <div className="boot-logo-sub">SYSADMIN TOOLKIT v1.0</div>
        </div>
      )}

      {/* Stage 3: Radar sweep ring */}
      {showRadar && (
        <div className="radar-ring" style={{ opacity: 1 }}>
          <div className="radar-sweep" />
          {radarDots.map((dot, i) => {
            const rad = (dot.angle * Math.PI) / 180;
            const x = 150 + dot.distance * Math.cos(rad);
            const y = 150 + dot.distance * Math.sin(rad);
            return (
              <div key={i}>
                <div
                  className="radar-dot"
                  style={{
                    left: x - 2,
                    top: y - 2,
                    animationDelay: `${i * 0.3}s`,
                  }}
                />
                <div
                  className="radar-label"
                  style={{
                    left: x + 8,
                    top: y - 6,
                  }}
                >
                  {dot.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress bar */}
      {showProgress && !isAwaitingStart && (
        <div className="boot-progress">
          <div className="boot-progress-bar">
            <div className="boot-progress-fill" />
          </div>
          <div className="boot-progress-text">INITIALIZING SYSTEM...</div>
        </div>
      )}

      {/* Start gate */}
      {isAwaitingStart && (
        <div className="boot-start-gate">
          <div className="boot-start-title">SYSTEM READY</div>
          <div className="boot-start-hint">
            PRESS <span className="boot-start-key">SPACE</span> OR CLICK TO START
            <span className="animate-pulse">_</span>
          </div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 12, letterSpacing: 1 }}>
            AUTO-START IN 4s...
          </div>
        </div>
      )}

      {!isAwaitingStart && (
        <div className="boot-skip" style={{ opacity: 1 }}>
          Press <span className="boot-start-key">SPACE</span> to skip ▸
        </div>
      )}
    </div>
  );
}
