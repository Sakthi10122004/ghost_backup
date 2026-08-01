const fs = require('fs');
const path = require('path');

function getGhostPath(relativePath) {
    const ghostRoot = process.env.INIT_CWD || process.cwd();
    const extensions = ['', '.js', '.json'];
    
    // Strategy 1: Check in current/ symlink
    for (const ext of extensions) {
        let candidate = path.join(ghostRoot, 'current', relativePath + ext);
        if (fs.existsSync(candidate)) return path.join(ghostRoot, 'current', relativePath);
    }
    
    // Strategy 2: Check directly in ghostRoot
    for (const ext of extensions) {
        let candidate = path.join(ghostRoot, relativePath + ext);
        if (fs.existsSync(candidate)) return path.join(ghostRoot, relativePath);
    }
    
    // Strategy 3: Check inside versions/*/
    const versionsDir = path.join(ghostRoot, 'versions');
    if (fs.existsSync(versionsDir)) {
        try {
            const versions = fs.readdirSync(versionsDir);
            for (const ver of versions) {
                for (const ext of extensions) {
                    let candidate = path.join(versionsDir, ver, relativePath + ext);
                    if (fs.existsSync(candidate)) return path.join(versionsDir, ver, relativePath);
                }
            }
        } catch (e) {}
    }
    
    return null;
}

module.exports = { getGhostPath };
