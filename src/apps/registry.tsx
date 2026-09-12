import type { ComponentType } from 'react';

// Network
import PingMonitor from './network/PingMonitor';
import PortScanner from './network/PortScanner';
import DnsLookup from './network/DnsLookup';
import Traceroute from './network/Traceroute';
import BandwidthMonitor from './network/BandwidthMonitor';
import SSHClient from './network/SSHClient';
import WakeOnLan from './network/WakeOnLan';
import NetworkByProcess from './network/NetworkByProcess';

// Security
import HashTool from './security/HashTool';
import PasswordGenerator from './security/PasswordGenerator';
import SubnetCalc from './security/SubnetCalc';
import JwtDecoder from './security/JwtDecoder';
import CVESearch from './security/CVESearch';
import SSLInspector from './security/SSLInspector';
import IPIntelligence from './security/IPIntelligence';

// System
import SystemOverview from './system/SystemOverview';
import ProcessManager from './system/ProcessManager';
import LogAnalyzer from './system/LogAnalyzer';
import FileHashCheck from './system/FileHashCheck';
import AppScheduler from './system/AppScheduler';

// Developer
import EncoderDecoder from './developer/EncoderDecoder';
import DataFormatter from './developer/DataFormatter';
import RegexTester from './developer/RegexTester';
import DiffViewer from './developer/DiffViewer';
import APITester from './developer/APITester';
import SnippetManager from './developer/SnippetManager';

export const ModuleNotImplemented: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
    MODULE NOT YET IMPLEMENTED
  </div>
);

export const appRegistry: Record<string, ComponentType> = {
  // Network
  'ping': PingMonitor,
  'traceroute': Traceroute,
  'port-scanner': PortScanner,
  'bandwidth': BandwidthMonitor,
  'dns': DnsLookup,
  'ssh': SSHClient,
  'wol': WakeOnLan,
  'net-processes': NetworkByProcess,

  // Security
  'hash': HashTool,
  'ssl': SSLInspector,
  'password': PasswordGenerator,
  'ip-intel': IPIntelligence,
  'subnet': SubnetCalc,
  'jwt': JwtDecoder,
  'cve': CVESearch,

  // System
  'processes': ProcessManager,
  'system-overview': SystemOverview,
  'logs': LogAnalyzer,
  'file-hash': FileHashCheck,
  'app-scheduler': AppScheduler,

  // Developer
  'api-tester': APITester,
  'formatter': DataFormatter,
  'encoder': EncoderDecoder,
  'regex': RegexTester,
  'snippets': SnippetManager,
  'diff': DiffViewer,
};

export function getAppComponent(id: string): ComponentType {
  return appRegistry[id] ?? ModuleNotImplemented;
}