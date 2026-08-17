const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const tar = require('tar');
const pathResolver = require('./pathResolver');

const TEMP_BASE = process.env.GHOST_BACKUP_TMP || '/tmp';

/**
 * Create a full-system backup archive (.tar.gz) and stream it to the HTTP response.
 * Supports both SQLite3 (development) and MySQL (production).
 */
async function createBackup(res) {
    const uuid = crypto.randomBytes(8).toString('hex');
    const tmpDir = path.join(TEMP_BASE, `ghost-backup-${uuid}`);

    try {
        // 1. Resolve all paths dynamically
        const contentPath = pathResolver.resolveContentPath();
        if (!contentPath) {
            throw new Error('Could not resolve Ghost content directory. Backup aborted.');
        }

        const dbConfig = pathResolver.resolveDbConfig();
        if (!dbConfig) {
            throw new Error('Could not resolve database configuration. Backup aborted.');
        }

        const mediaDirs = pathResolver.discoverMediaDirs(contentPath);
        const ghostVersion = pathResolver.getGhostVersion();

        console.log(`[ghost-backup] Starting export. DB: ${dbConfig.client}, Content: ${contentPath}`);
        console.log(`[ghost-backup] Media directories found: ${mediaDirs.join(', ') || 'none'}`);

        // 2. Create staging directory
        fs.mkdirSync(tmpDir, { recursive: true });

        // 3. Dump the database using Ghost's native JSON exporter
        const { getGhostPath } = require('./utils');
        const ghostExporterPath = getGhostPath('core/server/data/exporter');
        if (!ghostExporterPath) {
            throw new Error('Could not locate Ghost native exporter module.');
        }
        
        const ghostExporter = require(ghostExporterPath);
        console.log(`[ghost-backup] Generating engine-agnostic JSON database dump...`);
        const exportData = await ghostExporter.doExport();
        fs.writeFileSync(path.join(tmpDir, 'ghost-backup.json'), JSON.stringify(exportData));

        // 4. Copy media directories into staging area
        const contentStagingDir = path.join(tmpDir, 'content');
        fs.mkdirSync(contentStagingDir, { recursive: true });

        for (const dir of mediaDirs) {
            const src = path.join(contentPath, dir);
            const dest = path.join(contentStagingDir, dir);
            copyDirRecursive(src, dest);
        }

        // 5. Write manifest.json
        const manifest = {
            version: '2.0.0', // Bump version for cross-engine support
            timestamp: new Date().toISOString(),
            ghostVersion,
            nodeVersion: process.version,
            dbClient: 'engine-agnostic',
            dbFormat: 'json',
            dbFilename: 'ghost-backup.json',
            contentPath,
            mediaDirs
        };
        fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        // 5.5 Copy config files (for reference, not restored automatically)
        const ghostRoot = process.env.INIT_CWD || process.cwd();
        const configFiles = ['config.production.json', 'config.development.json'];
        for (const file of configFiles) {
            const configPath = path.join(ghostRoot, file);
            if (fs.existsSync(configPath)) {
                fs.copyFileSync(configPath, path.join(tmpDir, file));
            }
        }

        // 6. Collect all entries for the tar archive
        const entries = ['manifest.json', manifest.dbFilename];
        if (fs.existsSync(contentStagingDir) && fs.readdirSync(contentStagingDir).length > 0) {
            entries.push('content');
        }
        for (const file of configFiles) {
            if (fs.existsSync(path.join(tmpDir, file))) {
                entries.push(file);
            }
        }

        // 7. Stream tar.gz directly to HTTP response
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `ghost-backup-${timestamp}.tar.gz`;

        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');

        const tarStream = tar.create(
            { gzip: true, cwd: tmpDir, portable: true },
            entries
        );

        tarStream.on('error', (err) => {
            console.error('[ghost-backup] Tar stream error:', err.message);
            cleanupDir(tmpDir);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create backup archive.' });
            }
        });

        tarStream.on('end', () => {
            console.log('[ghost-backup] Backup archive streamed successfully.');
            cleanupDir(tmpDir);
        });

        tarStream.pipe(res);

    } catch (err) {
        cleanupDir(tmpDir);
        throw err;
    }
}


/**
 * Recursively copy a directory preserving structure and permissions.
 */
function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src) && !fs.lstatSync(src, { throwIfNoEntry: false })) return;
    try {
        fs.cpSync(src, dest, { recursive: true, force: true, dereference: false, preserveTimestamps: true });
    } catch (err) {
        console.warn(`[ghost-backup] Warning: Could not fully copy ${src}: ${err.message}`);
    }
}

/**
 * Safely remove a temporary directory and all its contents.
 */
function cleanupDir(dirPath) {
    try {
        if (dirPath && fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            console.log(`[ghost-backup] Cleaned up temp directory: ${dirPath}`);
        }
    } catch (e) {
        console.error(`[ghost-backup] Failed to cleanup ${dirPath}:`, e.message);
    }
}

module.exports = { createBackup };
