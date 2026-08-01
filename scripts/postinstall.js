const fs = require('fs');
const path = require('path');

console.log('\n[+] ghost-backup: Running postinstall setup...\n');

// Find Ghost Root
let ghostRoot = null;
let currentDir = process.env.INIT_CWD || process.cwd();
for (let i = 0; i < 5; i++) {
  if (fs.existsSync(path.join(currentDir, '.ghost-cli')) || 
      fs.existsSync(path.join(currentDir, 'config.development.json')) ||
      fs.existsSync(path.join(currentDir, 'config.production.json'))) {
    ghostRoot = currentDir;
    break;
  }
  currentDir = path.resolve(currentDir, '..');
}
if (!ghostRoot) {
  const nodeModulesParent = path.resolve(__dirname, '../../../');
  if (fs.existsSync(path.join(nodeModulesParent, '.ghost-cli'))) {
    ghostRoot = nodeModulesParent;
  }
}
if (!ghostRoot) {
  console.warn('\x1b[31m%s\x1b[0m', '[!] Error: You must run `npm install ghost-backup` inside a valid Ghost installation directory.');
  process.exit(1);
}

console.log('\x1b[32m%s\x1b[0m', '✅ Ghost ecosystem discovered. Injecting startup adapter pointers...');

const cooperativePlugins = ['ghost-backup', 'ghost-formbuilder', '@sakthi10122004/mailconfig', 'mailconfig'];

// Attempt to patch both dev and prod configs
['config.development.json', 'config.production.json'].forEach(configFile => {
    const filePath = path.join(ghostRoot, configFile);
    if (fs.existsSync(filePath)) {
        try {
            let conf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!conf.scheduling) conf.scheduling = {};
            
            const currentActive = conf.scheduling.active;
            // If there's an active cooperative plugin, let it be. Otherwise, set ourselves.
            if (!currentActive || !cooperativePlugins.includes(currentActive)) {
                conf.scheduling.active = 'ghost-backup';
            }
            
            conf.scheduling['ghost-backup'] = {};
            fs.writeFileSync(filePath, JSON.stringify(conf, null, 2));
            console.log(`[ghost-backup] Hijack pointer injected successfully into ${configFile}`);
        } catch (err) {
            console.error(`[ghost-backup] Failed to modify ${configFile}:`, err);
        }
    }
});

function triggerRestart(ghostRoot) {
    const cp = require('child_process');
    if (fs.existsSync(path.join(ghostRoot, '.ghost-cli'))) {
        console.log('[+] Triggering local Ghost CLI restart...');
        try {
            const child = cp.spawn('ghost', ['restart'], { cwd: ghostRoot, detached: true, stdio: 'ignore' });
            child.unref();
            console.log('[+] Local ghost restart initiated in background.');
            return;
        } catch (e) { }
    }
    const contentDataPath = path.join(ghostRoot, 'content', 'data');
    if (fs.existsSync(contentDataPath)) {
        const triggerFile = path.join(contentDataPath, '.reload-trigger');
        fs.writeFileSync(triggerFile, Date.now().toString());
        console.log('\x1b[32m%s\x1b[0m', '[+] ghost-backup: Triggered supervisor hot-reload via .reload-trigger');
    }
}
triggerRestart(ghostRoot);

console.log('\n==================================================');
console.log('\x1b[32m%s\x1b[0m', '[+] ghost-backup: Postinstall complete!');
console.log('==================================================\n');
