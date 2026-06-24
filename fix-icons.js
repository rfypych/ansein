const fs = require('fs');
const path = require('path');

const EXTRA_MAPPING = {
  Activity: 'Waveform',
  CornerDownLeft: 'ArrowBendDownLeft',
  Grid3x3: 'GridNine',
  Home: 'House',
  Mic: 'Microphone',
  MicOff: 'MicrophoneSlash',
  Radar: 'Broadcast',
  ZoomIn: 'MagnifyingGlassPlus',
  ZoomOut: 'MagnifyingGlassMinus',
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

  // Since we already replaced lucide-react with @phosphor-icons/react, 
  // the import looks like: import { ..., Activity, ... } from '@phosphor-icons/react'
  
  const importMatch = content.match(/import\s+{([^}]+)}\s+from\s+['"]@phosphor-icons\/react['"]/);
  if (!importMatch) return;

  let importedIconsStr = importMatch[1];
  let importedIcons = importedIconsStr.split(',').map(s => s.trim()).filter(Boolean);
  
  let changed = false;
  let newImports = [];
  
  importedIcons.forEach(icon => {
    if (icon.startsWith('type ')) {
      newImports.push(icon);
      return;
    }
    
    let localName = icon;
    let importName = icon;
    if (icon.includes(' as ')) {
      [importName, localName] = icon.split(' as ').map(s => s.trim());
    }

    if (EXTRA_MAPPING[importName]) {
      importName = EXTRA_MAPPING[importName];
      changed = true;
      
      // We also need to update the JSX if it was used directly without "as"
      // Wait, if it had "as localName", we don't need to change JSX!
      // If it didn't have "as", then localName === old importName, so we MUST change JSX.
      if (!icon.includes(' as ')) {
        const regex = new RegExp(`<${localName}([\\s>])`, 'g');
        content = content.replace(regex, `<${importName}$1`);
        localName = importName;
      }
    }
    
    if (importName === localName) {
      newImports.push(importName);
    } else {
      newImports.push(`${importName} as ${localName}`);
    }
  });

  if (changed) {
    const newImportsUnique = Array.from(new Set(newImports)).sort();
    const newImportStr = `import { ${newImportsUnique.join(', ')} } from '@phosphor-icons/react'`;
    content = content.replace(/import\s+{([^}]+)}\s+from\s+['"]@phosphor-icons\/react['"]/, newImportStr);
    
    fs.writeFileSync(file, content);
    modifiedFiles++;
  }
});

console.log('Modified ' + modifiedFiles + ' files.');
