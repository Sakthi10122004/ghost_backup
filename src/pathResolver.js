const fs = require('fs');
const path = require('path');
const { getGhostPath } = require('./utils');

const ghostRoot = process.env.INIT_CWD || process.cwd();

/**
 * Dynamically resolve Ghost's active content directory.
 * Priority: env vars → config files → filesystem detection.
 * Never hardcodes paths like /var/lib/ghost/content.
 */
function resolveContentPath() {
    // 1. Environment variable: paths__contentPath
    if (process.env.paths__contentPath) {
        const envPath = path.resolve(process.env.paths__contentPath);
        if (fs.existsSync(envPath)) {
            return envPath;
        }
    }

    // 2. Environment variable: GHOST_CONTENT
    if (process.env.GHOST_CONTENT) {
        const envPath = path.resolve(process.env.GHOST_CONTENT);
        if (fs.existsSync(envPath)) {
            return envPath;
        }
    }

    // 3. Ghost in-memory nconf config (if available at runtime)
    try {
        const configModulePath = getGhostPath('core/shared/config');
        if (configModulePath) {
            const ghostConfig = require(configModulePath);
            if (ghostConfig && typeof ghostConfig.get === 'function') {
                const nconfContentPath = ghostConfig.get('paths:contentPath');
                if (nconfContentPath && fs.existsSync(nconfContentPath)) {
                    return path.resolve(nconfContentPath);
                }
            }
        }
    } catch (e) {}

    // 4. config.production.json → paths.contentPath
    try {
        const prodConfigPath = path.join(ghostRoot, 'config.production.json');
        if (fs.existsSync(prodConfigPath)) {
            const prodConfig = JSON.parse(fs.readFileSync(prodConfigPath, 'utf8'));
            if (prodConfig.paths && prodConfig.paths.contentPath) {
                const resolved = path.resolve(ghostRoot, prodConfig.paths.contentPath);
                if (fs.existsSync(resolved)) return resolved;
            }
        }
    } catch (e) {}

    // 5. config.development.json → paths.contentPath
    try {
        const devConfigPath = path.join(ghostRoot, 'config.development.json');
        if (fs.existsSync(devConfigPath)) {
            const devConfig = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
            if (devConfig.paths && devConfig.paths.contentPath) {
                const resolved = path.resolve(ghostRoot, devConfig.paths.contentPath);
                if (fs.existsSync(resolved)) return resolved;
            }
        }
    } catch (e) {}

    // 6. process.cwd() + /content
    const cwdContent = path.join(ghostRoot, 'content');
    if (fs.existsSync(cwdContent)) {
        return cwdContent;
    }

    // 7. $GHOST_INSTALL + /content
    if (process.env.GHOST_INSTALL) {
        const installContent = path.join(process.env.GHOST_INSTALL, 'content');
        if (fs.existsSync(installContent)) {
            return installContent;
        }
    }

    return null;
}

/**
 * Dynamically resolve database configuration.
 * Returns { client, connection } where:
 *   - client: 'sqlite3' | 'mysql' | 'mysql2'
 *   - connection: { filename } for SQLite, { host, port, user, password, database } for MySQL
 */
function resolveDbConfig() {
    // 1. Try Ghost's in-memory nconf config
    try {
        const configModulePath = getGhostPath('core/shared/config');
        if (configModulePath) {
            const ghostConfig = require(configModulePath);
            if (ghostConfig && typeof ghostConfig.get === 'function') {
                const dbConfig = ghostConfig.get('database');
                if (dbConfig && dbConfig.client) {
                    return normalizeDbConfig(dbConfig);
                }
            }
        }
    } catch (e) {}

    // 2. Fallback: parse config files directly
    const env = process.env.NODE_ENV || 'development';
    const configFiles = [
        `config.${env}.json`,
        'config.production.json',
        'config.development.json'
    ];

    for (const configFile of configFiles) {
        try {
            const configPath = path.join(ghostRoot, configFile);
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.database && config.database.client) {
                    return normalizeDbConfig(config.database);
                }
            }
        } catch (e) {}
    }

    return null;
}

/**
 * Normalize the raw database config into a clean structure.
 */
function normalizeDbConfig(dbConfig) {
    const client = dbConfig.client.toLowerCase();
    const conn = dbConfig.connection || {};

    if (client === 'sqlite3') {
        let filename = conn.filename || '';
        // Resolve relative paths against Ghost root
        if (filename && !path.isAbsolute(filename)) {
            filename = path.resolve(ghostRoot, filename);
        }
        return {
            client: 'sqlite3',
            connection: { filename }
        };
    }

    // MySQL / MySQL2
    return {
        client: client === 'mysql2' ? 'mysql' : client,
        connection: {
            host: conn.host || process.env.database__connection__host || '127.0.0.1',
            port: parseInt(conn.port || process.env.database__connection__port || '3306', 10),
            user: conn.user || process.env.database__connection__user || 'root',
            password: conn.password || process.env.database__connection__password || '',
            database: conn.database || process.env.database__connection__database || 'ghost'
        }
    };
}

/**
 * Scan the content directory and return the list of existing media sub-directories.
 */
function discoverMediaDirs(contentPath) {
    if (!contentPath || !fs.existsSync(contentPath)) return [];
    
    const mediaCandidates = ['images', 'files', 'media', 'themes'];
    const found = [];

    for (const dir of mediaCandidates) {
        const fullPath = path.join(contentPath, dir);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
            found.push(dir);
        }
    }

    return found;
}

/**
 * Detect Ghost version from package.json.
 */
function getGhostVersion() {
    const candidates = [
        path.join(ghostRoot, 'current', 'package.json'),
        path.join(ghostRoot, 'package.json')
    ];

    // Also check versions/* directory
    const versionsDir = path.join(ghostRoot, 'versions');
    if (fs.existsSync(versionsDir)) {
        try {
            const versions = fs.readdirSync(versionsDir).sort().reverse();
            for (const ver of versions) {
                candidates.push(path.join(versionsDir, ver, 'package.json'));
            }
        } catch (e) {}
    }

    for (const pkgPath of candidates) {
        try {
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                if (pkg.name === 'ghost' && pkg.version) {
                    return pkg.version;
                }
            }
        } catch (e) {}
    }

    return 'unknown';
}

module.exports = {
    resolveContentPath,
    resolveDbConfig,
    discoverMediaDirs,
    getGhostVersion
};
