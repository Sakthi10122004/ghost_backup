const fs = require('fs');
const path = require('path');

console.log('\n[+] ghost-backup: Running safe teardown...\n');

let ghostRoot = null;
let currentDir = process.env.INIT_CWD || process.cwd();
for (let i = 0; i < 5; i++) {
  if (fs.existsSync(path.join(currentDir, 'config.production.json')) || 
      fs.existsSync(path.join(currentDir, 'config.development.json'))) {
    ghostRoot = currentDir;
    break;
  }
  currentDir = path.resolve(currentDir, '..');
}

if (!ghostRoot) {
  console.log('[ghost-backup] Could not locate Ghost root. Assuming manual cleanup is required.');
  process.exit(0);
}

const cooperativePlugins = ['ghost-formbuilder', '@sakthi10122004/mailconfig', 'mailconfig'];

['config.development.json', 'config.production.json'].forEach(configFile => {
    const configPath = path.join(ghostRoot, configFile);
    if (fs.existsSync(configPath)) {
        try {
            let configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (configData.scheduling) {
                let modified = false;

                // Remove our own scheduling entry
                if (configData.scheduling['ghost-backup']) {
                    delete configData.scheduling['ghost-backup'];
                    modified = true;
                }

                // If we held the active slot, transfer to a sibling or remove
                if (configData.scheduling.active === 'ghost-backup') {
                    let fallback = null;
                    const pkgPath = path.join(ghostRoot, 'package.json');
                    if (fs.existsSync(pkgPath)) {
                        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                        const deps = Object.keys(pkg.dependencies || {});
                        fallback = deps.find(d => cooperativePlugins.includes(d));
                    }

                    if (fallback) {
                        configData.scheduling.active = fallback;
                        console.log(`[ghost-backup] Safely transferred scheduling pointer to ${fallback}`);
                    } else {
                        delete configData.scheduling.active;
                        console.log('[ghost-backup] Safely removed active scheduling pointer');
                    }
                    modified = true;
                }

                // Clean up empty scheduling block
                if (Object.keys(configData.scheduling).length === 0) {
                    delete configData.scheduling;
                    modified = true;
                }
                
                if (modified) {
                    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
                }
            }
        } catch (err) {
            console.error(`[ghost-backup] Error parsing ${configFile}:`, err.message);
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
        console.log('[+] ghost-backup: Triggered supervisor hot-reload to complete teardown');
    }
}
triggerRestart(ghostRoot);

console.log('[+] ghost-backup: Teardown complete.\n');
