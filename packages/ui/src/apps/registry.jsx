// SVG icon components — pixel-perfect, theme-aware, no emoji
const icons = {
  files: (
    // Open folder
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5A1.5 1.5 0 013.5 5H7.8a1.5 1.5 0 011.1.48L10.1 6.5H16.5A1.5 1.5 0 0118 8v6.5A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5V6.5z" />
      <path d="M2 8.5h16" />
    </svg>
  ),
  pdf: (
    // PDF document with red accent lines
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.5h6.5L15.5 6.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V3.5a1 1 0 011-1z" />
      <path d="M11.5 2.5V6.5h4" />
      <path d="M7 9.5h6M7 12h6M7 14.5h3.5" />
    </svg>
  ),
  office: (
    // Spreadsheet / table grid
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
      <path d="M2.5 7.5h15M2.5 12.5h15M8 2.5v15" />
    </svg>
  ),
  browser: (
    // Browser window with address bar
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <path d="M2 7h16" />
      <circle cx="5" cy="5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="5" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="5" r="0.75" fill="currentColor" stroke="none" />
      <rect x="12" y="4" width="4" height="2" rx="0.5" />
    </svg>
  ),
  editor: (
    // Code editor with cursor
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="16" height="16" rx="1.5" />
      <path d="M6 7l-2.5 3L6 13M14 7l2.5 3L14 13M9 13l2-6" />
    </svg>
  ),
  terminal: (
    // Terminal with prompt
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <path d="M2 7h16" />
      <path d="M5.5 11l2.5 2-2.5 2" />
      <path d="M10.5 15h4" />
    </svg>
  ),
  settings: (
    // Classic cog — 8-tooth gear outline with centre circle
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  appbuilder: (
    // Magic wand / sparkle builder
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17L12.5 7.5M10 5l1.5 3 3 1.5-3 1.5L10 15l-1.5-3.5L5 10l3.5-1.5L10 5z" />
      <path d="M15 2l.6 1.4L17 4l-1.4.6L15 6l-.6-1.4L13 4l1.4-.6L15 2z" />
    </svg>
  ),
  logs: (
    // Live log / pulse lines
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2.5" width="16" height="15" rx="1.5" />
      <path d="M5 7h3M5 10h6M5 13h4M11.5 13l1.5-1.5 1.5 3 1.5-3 1 1.5" />
    </svg>
  ),
};

// Per-app accent colors for vibrant icon backgrounds
const appColors = {
  files:      { bg: 'rgba(234,179,8,0.18)',    border: 'rgba(234,179,8,0.4)',    icon: '#FCD34D' },
  pdf:        { bg: 'rgba(239,68,68,0.18)',     border: 'rgba(239,68,68,0.4)',    icon: '#FCA5A5' },
  office:     { bg: 'rgba(59,130,246,0.18)',    border: 'rgba(59,130,246,0.4)',   icon: '#93C5FD' },
  browser:    { bg: 'rgba(6,182,212,0.18)',     border: 'rgba(6,182,212,0.4)',    icon: '#67E8F9' },
  editor:     { bg: 'rgba(16,185,129,0.18)',    border: 'rgba(16,185,129,0.4)',   icon: '#6EE7B7' },
  terminal:   { bg: 'rgba(132,204,22,0.15)',    border: 'rgba(132,204,22,0.35)',  icon: '#BEF264' },
  settings:   { bg: 'rgba(148,163,184,0.12)',   border: 'rgba(148,163,184,0.3)', icon: '#CBD5E1' },
  appbuilder: { bg: 'rgba(139,92,246,0.18)',    border: 'rgba(139,92,246,0.4)',  icon: '#C4B5FD' },
  logs:       { bg: 'rgba(20,184,166,0.15)',     border: 'rgba(20,184,166,0.35)', icon: '#5EEAD4' },
};

export { appColors };

export const APP_REGISTRY = [
  {
    id: 'files',
    name: 'Files',
    icon: icons.files,
    color: appColors.files,
    tags: ['file', 'folder', 'explorer', 'manager'],
    component: () => import('./FileManager'),
  },
  {
    id: 'pdf',
    name: 'PDF Viewer',
    icon: icons.pdf,
    color: appColors.pdf,
    tags: ['pdf', 'document', 'reader'],
    component: () => import('./PDFViewer'),
  },
  {
    id: 'office',
    name: 'Office',
    icon: icons.office,
    color: appColors.office,
    tags: ['word', 'excel', 'docx', 'xlsx', 'spreadsheet', 'document'],
    component: () => import('./OfficeViewer'),
  },
  {
    id: 'browser',
    name: 'Browser',
    icon: icons.browser,
    color: appColors.browser,
    tags: ['web', 'internet', 'browse', 'url'],
    component: () => import('./AIBrowser'),
  },
  {
    id: 'editor',
    name: 'Editor',
    icon: icons.editor,
    color: appColors.editor,
    tags: ['code', 'text', 'edit', 'monaco'],
    component: () => import('./TextEditor'),
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: icons.terminal,
    color: appColors.terminal,
    tags: ['shell', 'bash', 'cli', 'console'],
    component: () => import('./Terminal'),
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: icons.settings,
    color: appColors.settings,
    tags: ['config', 'preferences', 'model', 'theme'],
    component: () => import('./Settings'),
  },
  {
    id: 'appbuilder',
    name: 'My Apps',
    icon: icons.appbuilder,
    color: appColors.appbuilder,
    tags: ['apps', 'builder', 'created', 'mini'],
    component: () => import('./AppBuilder'),
  },
  {
    id: 'logs',
    name: 'Logs',
    icon: icons.logs,
    color: appColors.logs,
    tags: ['log', 'debug', 'console', 'daemon', 'system'],
    component: () => import('./Logs'),
  },
];

// Dynamic registry for user-created apps (loaded at runtime)
// appId format: "userapp_{uuid}"
export function resolveApp(appId) {
  const builtin = APP_REGISTRY.find((a) => a.id === appId);
  if (builtin) return builtin;

  if (appId?.startsWith('userapp_')) {
    const id = appId.replace('userapp_', '');
    return {
      id: appId,
      name: 'App',
      icon: '🧩',
      tags: [],
      dynamic: true,
      appDbId: id,
      component: () => import('./UserApp'),
    };
  }
  return null;
}
