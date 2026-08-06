const { getGhostPath } = require('./utils');
const adapter = require('./adapter');

console.log('[ghost-backup] Loaded into memory via scheduling adapter hijack.');

let SchedulingBase;
try {
    const schedulingBasePath = getGhostPath('core/server/adapters/scheduling/scheduling-base');
    if (schedulingBasePath) {
        SchedulingBase = require(schedulingBasePath);
    }
} catch (e) {}

// If we couldn't find SchedulingBase, create a compatible shim
if (!SchedulingBase) {
    SchedulingBase = function() {
        Object.defineProperty(this, 'requiredFns', {
            value: ['schedule', 'unschedule', 'run'],
            writable: false
        });
    };
}

function bootCooperativePlugins(options) {
    try {
        const fs = require('fs');
        const path = require('path');
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (!fs.existsSync(pkgPath)) return;
        
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = Object.keys(pkg.dependencies || {});
        
        global.__bootedGhostPlugins = global.__bootedGhostPlugins || {};
        
        deps.forEach(dep => {
            const isPlugin = dep.startsWith('ghost-') || dep.includes('mailconfig') || dep.startsWith('@sakthi10122004/');
            if (isPlugin && !global.__bootedGhostPlugins[dep]) {
                global.__bootedGhostPlugins[dep] = true;
                try {
                    console.log(`[Cooperative Boot] Loading plugin: ${dep}`);
                    const PluginModule = require(path.join(process.cwd(), 'node_modules', dep));
                    
                    if (typeof PluginModule === 'function') {
                        new PluginModule(options);
                    } else if (PluginModule && typeof PluginModule.init === 'function') {
                        PluginModule.init(options);
                    }
                } catch (err) {
                    console.error(`[Cooperative Boot] Failed to boot plugin ${dep}:`, err.message);
                }
            }
        });
    } catch (e) {
        console.error('[Cooperative Boot] Error during discovery:', e.message);
    }
}

function BackupAdapter(options) {
    SchedulingBase.call(this);
    this.options = options || {};
    
    // Register ourselves first to prevent cyclic loading
    global.__bootedGhostPlugins = global.__bootedGhostPlugins || {};
    global.__bootedGhostPlugins['ghost-backup'] = true;
    
    // Scan and load other installed plugins cooperatively
    bootCooperativePlugins(options);

    this._initBackup();
}

// Inherit from SchedulingBase
Object.setPrototypeOf(BackupAdapter.prototype, SchedulingBase.prototype);
Object.setPrototypeOf(BackupAdapter, SchedulingBase);

BackupAdapter.prototype._initBackup = function() {
    try {
        console.log('[ghost-backup] Booting Hijack Engine...');
        adapter.init();
        
        console.log('\n==================================================');
        console.log('Backup & Restore Engine successfully attached to Ghost.');
        console.log('==================================================\n');
    } catch (err) {
        console.error('[ghost-backup] Failed to initialize:', err);
    }
};

BackupAdapter.prototype.schedule = function(object) {};
BackupAdapter.prototype.unschedule = function(object) {};
BackupAdapter.prototype.run = function() {};
BackupAdapter.prototype.register = function(object) {};

module.exports = BackupAdapter;
