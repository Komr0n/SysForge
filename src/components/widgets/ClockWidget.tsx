import { useEffect, useState } from 'react';

interface ClockWidgetProps {
  style?: React.CSSProperties;
}

export default function ClockWidget({ style }: ClockWidgetProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('en-US', { hour12: false });
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="clock-widget" style={style}>
      <div className="clock-time">{formatTime(time)}</div>
      <div className="clock-date">{formatDate(time)}</div>
      <div className="clock-tz">{tz}</div>
    </div>
  );
}
