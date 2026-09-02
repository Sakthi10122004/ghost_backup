const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const tar = require('tar');
const pathResolver = require('./pathResolver');

const TEMP_BASE = process.env.GHOST_BACKUP_TMP || '/tmp';
const MAX_UPLOAD_BYTES = parseInt(process.env.GHOST_BACKUP_MAX_UPLOAD_MB || '500', 10) * 1024 * 1024;

/**
 * Restore a Ghost site from an uploaded .tar.gz archive.
 * Supports both SQLite3 (development) and MySQL (production).
 */
async function restoreBackup(req) {
    const uuid = crypto.randomBytes(8).toString('hex');
    const archivePath = path.join(TEMP_BASE, `ghost-backup-import-${uuid}.tar.gz`);
    const extractDir = path.join(TEMP_BASE, `ghost-backup-import-${uuid}`);

    try {
        // 1. Stream the upload to a temp file (zero memory buffering)
        console.log('[ghost-backup] Receiving uploaded archive...');
        await saveUploadStream(req, archivePath);

        const archiveStats = fs.statSync(archivePath);
        console.log(`[ghost-backup] Archive received (${(archiveStats.size / 1024 / 1024).toFixed(2)} MB)`);

        if (archiveStats.size > MAX_UPLOAD_BYTES) {
            throw new Error(`Archive exceeds maximum upload size of ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
        }

        // 2. Extract the archive to an isolated temp directory
        fs.mkdirSync(extractDir, { recursive: true });
        console.log('[ghost-backup] Extracting archive...');
        
        await tar.extract({
            file: archivePath,
            cwd: extractDir,
            // Path traversal defense: reject any entries that escape the extract root
            filter: (entryPath) => {
                const resolvedExtractDir = path.resolve(extractDir);
                const resolved = path.resolve(resolvedExtractDir, entryPath);
                if (!resolved.startsWith(resolvedExtractDir)) {
                    console.error(`[ghost-backup] SECURITY: Path traversal blocked: ${entryPath}`);
                    return false;
                }
                return true;
            }
        });

        // 3. Validate manifest.json
        const manifestPath = path.join(extractDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            throw new Error('Invalid backup archive: manifest.json not found.');
        }

        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        } catch (e) {
            throw new Error('Invalid backup archive: manifest.json is corrupted.');
        }

        if (!manifest.dbClient || !manifest.dbFilename) {
            throw new Error('Invalid backup archive: manifest is missing required database metadata.');
        }

        console.log(`[ghost-backup] Manifest validated. Backup from: ${manifest.timestamp}, DB: ${manifest.dbClient}, Ghost: ${manifest.ghostVersion}`);

        // 4. Validate DB Format
        if (manifest.dbFormat !== 'json') {
            // Fallback for legacy SQL backups
            const currentDbConfig = pathResolver.resolveDbConfig();
            const isBackupSqlite = manifest.dbClient === 'sqlite3' || manifest.dbClient === 'better-sqlite3';
            const isCurrentSqlite = currentDbConfig.client === 'sqlite3' || currentDbConfig.client === 'better-sqlite3';

            if (isBackupSqlite !== isCurrentSqlite) {
                throw new Error(
                    `Database engine mismatch: legacy backup uses "${manifest.dbClient}" but this Ghost instance uses "${currentDbConfig.client}". ` +
                    `Cross-engine restoration is only supported for backups created with the newer engine-agnostic format.`
                );
            }
        }

        // 5. Verify the dump file exists in the extracted archive
        const dumpFilePath = path.join(extractDir, manifest.dbFilename);
        if (!fs.existsSync(dumpFilePath)) {
            throw new Error(`Invalid backup archive: database dump file "${manifest.dbFilename}" not found.`);
        }

        // 6. Restore the database
        if (manifest.dbFormat === 'json') {
            const { getGhostPath } = require('./utils');
            const dataImporterPath = getGhostPath('core/server/data/importer/importers/data/data-importer');
            if (!dataImporterPath) {
                throw new Error('Could not locate Ghost native DataImporter module.');
            }
            
            const DataImporter = require(dataImporterPath);
            console.log(`[ghost-backup] Parsing engine-agnostic JSON database dump...`);
            let importData = { data: JSON.parse(fs.readFileSync(dumpFilePath, 'utf8')) };
            
            console.log(`[ghost-backup] Starting engine-agnostic JSON import...`);
            importData = await DataImporter.preProcess(importData);
            await DataImporter.doImport(importData, { returnImportedData: true });
        } else {
            // Legacy SQL Restore
            const currentDbConfig = pathResolver.resolveDbConfig();
            const isCurrentSqlite = currentDbConfig.client === 'sqlite3' || currentDbConfig.client === 'better-sqlite3';
            if (isCurrentSqlite) {
                await restoreSqlite(currentDbConfig, dumpFilePath);
            } else {
                await restoreMysql(currentDbConfig, dumpFilePath);
            }
        }

        // 7. Restore media assets
        const contentPath = pathResolver.resolveContentPath();
        if (contentPath) {
            const extractedContentDir = path.join(extractDir, 'content');
            if (fs.existsSync(extractedContentDir)) {
                await restoreMediaDirs(extractedContentDir, contentPath);
            } else {
                console.log('[ghost-backup] No content directory in archive — skipping media restore.');
            }
        } else {
            console.warn('[ghost-backup] Could not resolve content path — skipping media restore.');
        }

        console.log('[ghost-backup] Restore completed successfully.');

        return {
            ok: true,
            message: 'Backup restored successfully.',
            details: {
                dbClient: manifest.dbClient,
                ghostVersion: manifest.ghostVersion,
                backupTimestamp: manifest.timestamp,
                mediaDirs: manifest.mediaDirs || []
            }
        };

    } finally {
        // Guaranteed cleanup
        cleanupFile(archivePath);
        cleanupDir(extractDir);
    }
}

/**
 * Pipe the raw request body to a file on disk without loading it into memory.
 */
function saveUploadStream(req, destPath) {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(destPath);
        let bytesReceived = 0;

        req.on('data', (chunk) => {
            bytesReceived += chunk.length;
            if (bytesReceived > MAX_UPLOAD_BYTES) {
                req.destroy();
                writeStream.destroy();
                cleanupFile(destPath);
                reject(new Error(`Upload exceeds maximum size of ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`));
            }
        });

        req.pipe(writeStream);

        writeStream.on('finish', resolve);
        writeStream.on('error', (err) => {
            cleanupFile(destPath);
            reject(new Error(`Failed to save uploaded file: ${err.message}`));
        });
        req.on('error', (err) => {
            writeStream.destroy();
            cleanupFile(destPath);
            reject(new Error(`Upload stream error: ${err.message}`));
        });
    });
}

/**
 * SQLite3 restore: Replace the current database file with the backup.
 * Creates a .pre-restore backup of the original first.
 */
async function restoreSqlite(dbConfig, dumpFilePath) {
    const targetDbPath = dbConfig.connection.filename;

    if (!targetDbPath) {
        throw new Error('SQLite database filename not resolved. Restore aborted.');
    }

    // Create a safety backup of the current database
    if (fs.existsSync(targetDbPath)) {
        const backupPath = targetDbPath + '.pre-restore';
        fs.copyFileSync(targetDbPath, backupPath);
        console.log(`[ghost-backup] Safety backup of current DB created: ${backupPath}`);
    }

    // Overwrite with the backup file
    fs.copyFileSync(dumpFilePath, targetDbPath);
    const stats = fs.statSync(targetDbPath);
    console.log(`[ghost-backup] SQLite database restored (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

/**
 * MySQL restore: Execute the SQL dump via the mysql CLI client.
 */
function restoreMysql(dbConfig, dumpFilePath) {
    return new Promise((resolve, reject) => {
        const conn = dbConfig.connection;

        const args = [
            '--binary-mode',
            '-h', conn.host,
            '-P', String(conn.port),
            '-u', conn.user,
            conn.database
        ];

        const env = { ...process.env };
        if (conn.password) {
            env.MYSQL_PWD = conn.password;
        }

        console.log(`[ghost-backup] Restoring MySQL database: ${conn.database}@${conn.host}:${conn.port}`);

        const inputStream = fs.createReadStream(dumpFilePath);
        const proc = spawn('mysql', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

        let stderrData = '';
        proc.stderr.on('data', (chunk) => { stderrData += chunk.toString(); });

        inputStream.pipe(proc.stdin);

        proc.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`mysql restore exited with code ${code}: ${stderrData.trim()}`));
            }
            console.log('[ghost-backup] MySQL database restored successfully.');
            resolve();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to spawn mysql client: ${err.message}. Is the mysql CLI installed?`));
        });

        inputStream.on('error', (err) => {
            proc.kill();
            reject(new Error(`Failed to read dump file: ${err.message}`));
        });
    });
}

/**
 * Copy restored media directories back into the Ghost content path.
 * Preserves directory structure and file permissions.
 */
async function restoreMediaDirs(extractedContentDir, targetContentDir) {
    const entries = fs.readdirSync(extractedContentDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const srcDir = path.join(extractedContentDir, entry.name);
        const destDir = path.join(targetContentDir, entry.name);

        console.log(`[ghost-backup] Restoring media directory: ${entry.name}/`);
        copyDirRecursive(srcDir, destDir);
    }

    console.log('[ghost-backup] Media assets restored successfully.');
}

/**
 * Recursively copy a directory preserving structure and permissions.
 */
function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src) && !fs.lstatSync(src, { throwIfNoEntry: false })) return;
    try {
        fs.cpSync(src, dest, { recursive: true, force: true, dereference: false, preserveTimestamps: true });
    } catch (err) {
        console.warn(`[ghost-backup] Warning: Could not fully restore ${src}: ${err.message}`);
    }
}

/**
 * Safely remove a single file.
 */
function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        console.error(`[ghost-backup] Failed to cleanup file ${filePath}:`, e.message);
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

module.exports = { restoreBackup };
