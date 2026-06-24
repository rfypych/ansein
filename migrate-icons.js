const fs = require('fs');
const path = require('path');

const MAPPING = {
  Activity: 'Activity', AlertCircle: 'WarningCircle', AlertTriangle: 'Warning', ArrowDownToLine: 'DownloadSimple',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', BarChart3: 'ChartBar', Bell: 'Bell', Bot: 'Robot',
  Bug: 'Bug', Calendar: 'Calendar', Check: 'Check', CheckCircle2: 'CheckCircle', CheckSquare: 'CheckSquare',
  ChevronDown: 'CaretDown', ChevronLeft: 'CaretLeft', ChevronRight: 'CaretRight', Circle: 'Circle',
  ClipboardList: 'ClipboardText', Clock: 'Clock', Code: 'Code', Command: 'Command', Copy: 'Copy',
  CopyPlus: 'Copy', Cpu: 'Cpu', CreditCard: 'CreditCard', Crosshair: 'Crosshair', Crown: 'Crown',
  Download: 'Download', ExternalLink: 'ArrowSquareOut', Eye: 'Eye', EyeOff: 'EyeClosed', FileCode: 'FileCode',
  FileDown: 'FileArrowDown', FileJson: 'FileText', FileSearch: 'FileSearch', FileText: 'FileText',
  Filter: 'Funnel', FlaskConical: 'Flask', FolderSearch: 'Folder', Globe: 'Globe', GripVertical: 'DotsSixVertical',
  Hash: 'Hash', History: 'ClockCounterClockwise', Info: 'Info', KeyRound: 'Key', Keyboard: 'Keyboard',
  LayoutDashboard: 'SquaresFour', LayoutGrid: 'GridFour', Lightbulb: 'Lightbulb', Link: 'Link', Link2: 'LinkSimple',
  Loader2: 'CircleNotch', Lock: 'Lock', LogOut: 'SignOut', Mail: 'Envelope', MapPin: 'MapPin',
  Maximize2: 'CornersOut', Menu: 'List', MessageSquare: 'ChatCircle', Network: 'Graph', Pencil: 'Pencil',
  Pin: 'PushPin', PinOff: 'PushPinSlash', Play: 'Play', Plus: 'Plus', Power: 'Power', Radar: 'Radar',
  Save: 'FloppyDisk', Search: 'MagnifyingGlass', Send: 'PaperPlaneRight', Settings: 'Gear', Share2: 'ShareNetwork',
  Shield: 'Shield', ShieldAlert: 'ShieldWarning', ShieldCheck: 'ShieldCheck', Sparkles: 'Sparkle',
  Square: 'Square', Star: 'Star', StickyNote: 'Note', Table: 'Table', Tag: 'Tag', Target: 'Target',
  Terminal: 'Terminal', Trash2: 'Trash', TrendingUp: 'TrendUp', Upload: 'Upload', User: 'User',
  UserMinus: 'UserMinus', UserPlus: 'UserPlus', Users: 'Users', Webhook: 'Plugs', Workflow: 'TreeStructure',
  Wrench: 'Wrench', X: 'X', XCircle: 'XCircle', Zap: 'Lightning', Robot: 'Robot',
  'Command as CommandIcon': 'Command as CommandIcon', 'Keyboard as KeyboardIcon': 'Keyboard as KeyboardIcon', 
  'Link as LinkIcon': 'Link as LinkIcon', 'Settings as SettingsIcon': 'Gear as SettingsIcon', 
  'Table as TableIcon': 'Table as TableIcon', 'User as UserIcon': 'User as UserIcon', 'X as XIcon': 'X as XIcon'
};

const dirsToScan = ['src/app/app', 'src/components/ansein', 'src/components/graph'];
let modifiedFiles = 0;

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  fs.readdirSync(dir).forEach(file => {
    file = path.join(dir, file);
    if (fs.statSync(file).isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

let files = [];
dirsToScan.forEach(d => files = files.concat(walk(d)));

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Find lucide-react import
  const importMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]lucide-react['"]/);
  if (!importMatch) return;

  const importedIconsStr = importMatch[1];
  const importedIcons = importedIconsStr.split(',').map(s => s.trim()).filter(Boolean);
  
  let newImports = [];
  let nameMapping = {}; 

  importedIcons.forEach(icon => {
    if (icon.startsWith('type ')) return; 
    let localName = icon;
    let importName = icon;
    if (icon.includes(' as ')) {
      [importName, localName] = icon.split(' as ').map(s => s.trim());
    }

    const phosphorName = MAPPING[importName] || importName;
    
    nameMapping[localName] = phosphorName;
    
    if (localName === phosphorName) {
      newImports.push(phosphorName);
    } else {
      newImports.push(`${phosphorName} as ${localName}`);
    }
  });

  if (newImports.length > 0) {
    const newImportsUnique = Array.from(new Set(newImports)).sort();
    const newImportStr = `import { ${newImportsUnique.join(', ')} } from '@phosphor-icons/react'`;
    content = content.replace(/import\s+{([^}]+)}\s+from\s+['"]lucide-react['"]/, newImportStr);
    
    Object.keys(nameMapping).forEach(localName => {
      // Find all self-closing tags and opening tags
      const tagRegex = new RegExp(`(<${localName})([\\s>])`, 'g');
      content = content.replace(tagRegex, (match, p1, p2) => {
        return `${p1} weight="duotone"${p2}`;
      });

      // Avoid double weight
      content = content.replace(/weight="duotone"\s+weight="duotone"/g, 'weight="duotone"');
    });

    if (content !== originalContent) {
      fs.writeFileSync(file, content);
      modifiedFiles++;
    }
  }
});

console.log('Modified ' + modifiedFiles + ' files.');
