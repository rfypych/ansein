const fs = require('fs');

function replace(file, search, replacement) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(search)) {
    content = content.replace(search, replacement);
    fs.writeFileSync(file, content);
    console.log('Fixed ' + file);
  }
}

replace('src/components/ansein/command-palette.tsx', 'icon: Home', 'icon: House');
replace('src/app/app/settings/page.tsx', 'icon: Radar', 'icon: Broadcast');
replace('src/app/app/page.tsx', '|| Activity', '|| Waveform');
replace('src/app/app/audit/page.tsx', '|| Activity', '|| Waveform');
replace('src/app/app/investigations/[id]/page.tsx', '|| Activity', '|| Waveform');
