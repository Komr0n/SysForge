import type { ComponentType } from 'react';
import PingMonitor from './network/PingMonitor';
import PortScanner from './network/PortScanner';
import DnsLookup from './network/DnsLookup';
import HashTool from './security/HashTool';
import PasswordGenerator from './security/PasswordGenerator';
import SubnetCalc from './security/SubnetCalc';
import JwtDecoder from './security/JwtDecoder';
import SystemOverview from './system/SystemOverview';
import EncoderDecoder from './developer/EncoderDecoder';

export const appRegistry: Record<string, ComponentType> = {
  'ping': PingMonitor,
  'port-scanner': PortScanner,
  'dns': DnsLookup,
  'hash': HashTool,
  'password': PasswordGenerator,
  'subnet': SubnetCalc,
  'jwt': JwtDecoder,
  'system-overview': SystemOverview,
  'encoder': EncoderDecoder,
};

export function getAppComponent(id: string): ComponentType {
  return appRegistry[id] ?? (() => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
      MODULE NOT YET IMPLEMENTED
    </div>
  ));
}