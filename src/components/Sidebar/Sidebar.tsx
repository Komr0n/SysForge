import { useState } from 'react';
import {
  Network,
  Shield,
  Monitor,
  Code2,
  ChevronLeft,
  ChevronRight,
  Radio,
  Search,
  Scan,
  Activity,
  Globe,
  Terminal,
  Zap,
  Hash,
  Lock,
  Key,
  Eye,
  FileText,
  Cpu,
  ScrollText,
  CheckSquare,
  Beaker,
  Braces,
  Image,
  Regex,
  Bookmark,
  GitCompare,
} from 'lucide-react';
import { useWindowStore } from '../../store/windowStore';

interface AppItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  category: string;
}

const categories = [
  { id: 'network', label: 'Network', icon: <Network size={18} /> },
  { id: 'security', label: 'Security', icon: <Shield size={18} /> },
  { id: 'system', label: 'System', icon: <Monitor size={18} /> },
  { id: 'developer', label: 'Developer', icon: <Code2 size={18} /> },
];

const apps: AppItem[] = [
  // Network
  { id: 'ping', title: 'Ping Monitor', icon: <Radio size={16} />, category: 'network' },
  { id: 'traceroute', title: 'Traceroute', icon: <Search size={16} />, category: 'network' },
  { id: 'port-scanner', title: 'Port Scanner', icon: <Scan size={16} />, category: 'network' },
  { id: 'bandwidth', title: 'Bandwidth', icon: <Activity size={16} />, category: 'network' },
  { id: 'dns', title: 'DNS Lookup', icon: <Globe size={16} />, category: 'network' },
  { id: 'ssh', title: 'SSH Client', icon: <Terminal size={16} />, category: 'network' },
  { id: 'wol', title: 'Wake-on-LAN', icon: <Zap size={16} />, category: 'network' },
  // Security
  { id: 'hash', title: 'Hash Tool', icon: <Hash size={16} />, category: 'security' },
  { id: 'ssl', title: 'SSL Inspector', icon: <Lock size={16} />, category: 'security' },
  { id: 'password', title: 'Password Gen', icon: <Key size={16} />, category: 'security' },
  { id: 'ip-intel', title: 'IP Intelligence', icon: <Eye size={16} />, category: 'security' },
  { id: 'subnet', title: 'Subnet Calc', icon: <FileText size={16} />, category: 'security' },
  { id: 'jwt', title: 'JWT Decoder', icon: <Braces size={16} />, category: 'security' },
  { id: 'cve', title: 'CVE Search', icon: <Search size={16} />, category: 'security' },
  // System
  { id: 'processes', title: 'Process Manager', icon: <Cpu size={16} />, category: 'system' },
  { id: 'system-overview', title: 'System Overview', icon: <Monitor size={16} />, category: 'system' },
  { id: 'logs', title: 'Log Analyzer', icon: <ScrollText size={16} />, category: 'system' },
  { id: 'file-hash', title: 'File Hash Check', icon: <CheckSquare size={16} />, category: 'system' },
  // Developer
  { id: 'api-tester', title: 'API Tester', icon: <Beaker size={16} />, category: 'developer' },
  { id: 'formatter', title: 'Data Formatter', icon: <Braces size={16} />, category: 'developer' },
  { id: 'encoder', title: 'Encoder/Decoder', icon: <Image size={16} />, category: 'developer' },
  { id: 'regex', title: 'Regex Tester', icon: <Regex size={16} />, category: 'developer' },
  { id: 'snippets', title: 'Snippet Manager', icon: <Bookmark size={16} />, category: 'developer' },
  { id: 'diff', title: 'Diff Viewer', icon: <GitCompare size={16} />, category: 'developer' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState('network');
  const windows = useWindowStore((s) => s.windows);
  const openWindow = useWindowStore((s) => s.openWindow);
  const closeWindow = useWindowStore((s) => s.closeWindow);

  // Toggle behavior: click once to open, click again to close
  const handleAppClick = (app: AppItem) => {
    if (windows.has(app.id)) {
      closeWindow(app.id);
    } else {
      openWindow(app.id, app.title, '', app.id);
    }
  };

  const filteredApps = apps.filter((a) => a.category === activeCategory);

  return (
    <div className={`sidebar ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      {/* Category tabs */}
      <div style={{ padding: collapsed ? '8px 0' : '8px' }}>
        {categories.map((cat) => (
          <div
            key={cat.id}
            className={`sidebar-item ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '10px 0' : '10px 14px',
            }}
            title={collapsed ? cat.label : undefined}
          >
            <span style={{ color: activeCategory === cat.id ? 'var(--accent-primary)' : undefined }}>
              {cat.icon}
            </span>
            {!collapsed && <span>{cat.label}</span>}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-color)', margin: '0 8px' }} />

      {/* App list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {filteredApps.map((app) => {
          const isOpen = windows.has(app.id);
          return (
            <div
              key={app.id}
              className={`sidebar-item ${isOpen ? 'active' : ''}`}
              onClick={() => handleAppClick(app)}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '8px 0' : '8px 14px',
                borderLeft: isOpen ? '2px solid var(--accent-primary)' : '2px solid transparent',
                background: isOpen ? 'rgba(0, 255, 136, 0.08)' : undefined,
              }}
              title={collapsed ? `${app.title} (${isOpen ? 'Открыто — нажать чтобы закрыть' : 'Нажать чтобы открыть'})` : undefined}
            >
              <span style={{ color: isOpen ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                {app.icon}
              </span>
              {!collapsed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ color: isOpen ? 'var(--accent-primary)' : undefined }}>{app.title}</span>
                  {isOpen && (
                    <span style={{ fontSize: 8, color: 'var(--accent-primary)', opacity: 0.8 }}>●</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <div
        className="sidebar-item"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          justifyContent: 'center',
          borderTop: '1px solid var(--border-color)',
          marginTop: 'auto',
        }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </div>
    </div>
  );
}