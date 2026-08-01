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

        // 3. Dump the database
        if (dbConfig.client === 'sqlite3') {
            await dumpSqlite(dbConfig, tmpDir);
        } else {
            await dumpMysql(dbConfig, tmpDir);
        }

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
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            ghostVersion,
            nodeVersion: process.version,
            dbClient: dbConfig.client,
            dbFilename: dbConfig.client === 'sqlite3' ? 'db_dump.sqlite3' : 'db_dump.sql',
            contentPath,
            mediaDirs
        };
        fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        // 6. Collect all entries for the tar archive
        const entries = ['manifest.json', manifest.dbFilename];
        if (fs.existsSync(contentStagingDir) && fs.readdirSync(contentStagingDir).length > 0) {
            entries.push('content');
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
 * SQLite3: Copy the database file directly into the staging directory.
 */
function dumpSqlite(dbConfig, tmpDir) {
    return new Promise((resolve, reject) => {
        const dbFilePath = dbConfig.connection.filename;

        if (!dbFilePath || !fs.existsSync(dbFilePath)) {
            return reject(new Error(`SQLite database file not found: ${dbFilePath}`));
        }

        const destPath = path.join(tmpDir, 'db_dump.sqlite3');

        try {
            fs.copyFileSync(dbFilePath, destPath);
            const stats = fs.statSync(destPath);
            console.log(`[ghost-backup] SQLite database copied (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            resolve();
        } catch (err) {
            reject(new Error(`Failed to copy SQLite database: ${err.message}`));
        }
    });
}

/**
 * MySQL: Spawn mysqldump and write the output to db_dump.sql in the staging directory.
 */
function dumpMysql(dbConfig, tmpDir) {
    return new Promise((resolve, reject) => {
        const conn = dbConfig.connection;
        const destPath = path.join(tmpDir, 'db_dump.sql');
        const outStream = fs.createWriteStream(destPath);

        const args = [
            '--single-transaction',
            '--routines',
            '--triggers',
            '--quick',
            '-h', conn.host,
            '-P', String(conn.port),
            '-u', conn.user,
            conn.database
        ];

        const env = { ...process.env };
        if (conn.password) {
            env.MYSQL_PWD = conn.password;
        }

        console.log(`[ghost-backup] Running mysqldump for database: ${conn.database}@${conn.host}:${conn.port}`);

        const proc = spawn('mysqldump', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

        let stderrData = '';
        proc.stderr.on('data', (chunk) => { stderrData += chunk.toString(); });

        proc.stdout.pipe(outStream);

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`mysqldump exited with code ${code}: ${stderrData.trim()}`));
            }
            const stats = fs.statSync(destPath);
            console.log(`[ghost-backup] MySQL dump completed (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            resolve();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn mysqldump: ${err.message}. Is mysqldump installed?`));
        });
    });
}

/**
 * Recursively copy a directory preserving structure and permissions.
 */
function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            fs.copyFileSync(srcPath, destPath);
        }
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
