const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const router       = express.Router();
const { getGhostPath } = require('./utils');
const pathResolver = require('./pathResolver');
const exporter     = require('./exporter');
const importer     = require('./importer');

const INTERNAL_REQUEST_HEADER = 'x-ghost-backup-request';

// ── Dynamic Ghost Config Loading ──────────────────────────────────

// Load Ghost's core session service dynamically
let getSession = null;
try {
  const sessionPath = getGhostPath('core/server/services/auth/session/express-session');
  if (sessionPath) {
    getSession = require(sessionPath).getSession;
  }
} catch (err) {
  console.error('[ghost-backup Auth] Failed to load Ghost session service:', err.message);
}

// Load Ghost models dynamically
let models = null;
try {
  const modelsPath = getGhostPath('core/server/models');
  if (modelsPath) {
    models = require(modelsPath);
  }
} catch (err) {
  console.error('[ghost-backup Auth] Failed to load Ghost models:', err.message);
}

// Load Ghost's core config service dynamically to get URLs
let ghostUrl = null;
let ghostAdminUrl = null;
try {
  const configPath = getGhostPath('core/shared/config');
  if (configPath) {
    const ghostConfig = require(configPath);
    if (ghostConfig && typeof ghostConfig.get === 'function') {
      ghostUrl = ghostConfig.get('url');
      const adminObj = ghostConfig.get('admin');
      if (adminObj && typeof adminObj === 'object') {
        ghostAdminUrl = adminObj.url;
      } else {
        ghostAdminUrl = ghostConfig.get('admin:url');
      }
    }
  }
} catch (e) {
  console.error('[ghost-backup Auth] Failed to load Ghost URL config:', e.message);
}

// ── Security Helpers ──────────────────────────────────────────────

function buildAllowedHosts(host) {
  const allowedHosts = new Set();
  if (host) {
    allowedHosts.add(host.toLowerCase());
  }
  if (ghostAdminUrl) {
    try { allowedHosts.add(new URL(ghostAdminUrl).host.toLowerCase()); } catch (e) {}
  }
  if (ghostUrl) {
    try { allowedHosts.add(new URL(ghostUrl).host.toLowerCase()); } catch (e) {}
  }
  return allowedHosts;
}

function isHostAllowed(urlStr, allowedHosts) {
  try {
    const u = new URL(urlStr);
    return allowedHosts.has(u.host.toLowerCase());
  } catch (e) {
    return false;
  }
}

function validateSameOrigin(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const allowedHosts = buildAllowedHosts(req.headers.host);

  if (origin) {
    return isHostAllowed(origin, allowedHosts) ? null : 'Forbidden. Origin mismatch.';
  }
  if (referer) {
    return isHostAllowed(referer, allowedHosts) ? null : 'Forbidden. Referer mismatch.';
  }
  return 'Forbidden. Missing Origin or Referer header.';
}

function isExpectedFetchDestination(req, allowedDestinations) {
  const destination = req.headers['sec-fetch-dest'];
  if (!destination) return true;
  return allowedDestinations.includes(String(destination).toLowerCase());
}

function requireFetchDestination(allowedDestinations) {
  return function(req, res, next) {
    if (!isExpectedFetchDestination(req, allowedDestinations)) {
      return res.status(404).send('Not Found');
    }
    next();
  };
}

function requireInternalRequest(req, res, next) {
  if (req.get(INTERNAL_REQUEST_HEADER) !== '1') {
    return res.status(404).send('Not Found');
  }
  next();
}

// ── Authentication Middleware ─────────────────────────────────────

async function requireAdminAuth(req, res, next) {
  if (getSession) {
    try {
      const sessionObj = await getSession(req, res);
      if (sessionObj && sessionObj.user_id) {
        if (models && models.User) {
          const user = await models.User.findOne({ id: sessionObj.user_id }, { withRelated: ['roles'] });
          if (user) {
            const roles = user.related('roles').models.map(r => r.get('name'));
            const isAdminOrOwner = roles.includes('Administrator') || roles.includes('Owner');
            if (isAdminOrOwner) {
              return next();
            }
          }
        }
      }
    } catch (err) {
      console.error('[ghost-backup Auth] Error verifying session:', err.message);
    }
  }

  if (req.accepts('html') && !req.path.startsWith('/api')) {
    return res.redirect('/ghost/#/signin');
  }

  res.status(401).json({ error: 'Unauthorized. Ghost Admin session required.' });
}

// ── Apply global middleware ───────────────────────────────────────

router.use(requireAdminAuth);

// ── Routes ────────────────────────────────────────────────────────

// UI Dashboard — served as iframe content
router.get('/', requireFetchDestination(['iframe', 'frame', 'document']), (req, res) => {
  res.sendFile(path.join(__dirname, '../ui/index.html'));
});

// Load Ghost's core knex connection dynamically for DB stats
let ghostKnex = null;
try {
  const knexPath = getGhostPath('core/server/data/db/connection');
  if (knexPath) {
    ghostKnex = require(knexPath);
  }
} catch (e) {
  console.error('[ghost-backup] Failed to load Ghost knex connection:', e.message);
}

// GET /api/status — Returns system info: resolved paths, DB config (masked), Ghost version, and DB stats
router.get('/api/status', requireInternalRequest, async (req, res) => {
  try {
    const contentPath = pathResolver.resolveContentPath();
    const dbConfig = pathResolver.resolveDbConfig();
    const mediaDirs = contentPath ? pathResolver.discoverMediaDirs(contentPath) : [];
    const ghostVersion = pathResolver.getGhostVersion();

    // Mask sensitive credentials
    let maskedConnection = {};
    if (dbConfig) {
      if (dbConfig.client === 'sqlite3') {
        maskedConnection = { filename: dbConfig.connection.filename };
      } else {
        maskedConnection = {
          host: dbConfig.connection.host,
          port: dbConfig.connection.port,
          user: dbConfig.connection.user,
          password: '••••••••',
          database: dbConfig.connection.database
        };
      }
    }
    
    // Gather database statistics
    let stats = { posts: 0, pages: 0, tags: 0, members: 0, users: 0 };
    if (ghostKnex) {
      try {
        const fetchCount = async (table, condition) => {
          let q = ghostKnex(table);
          if (condition) q = q.where(condition);
          const res = await q.count('* as count').first();
          return parseInt(res.count || 0, 10);
        };
        stats.posts = await fetchCount('posts', { type: 'post' });
        stats.pages = await fetchCount('posts', { type: 'page' });
        stats.tags = await fetchCount('tags');
        
        // Members table might not exist in extremely old Ghost versions, wrap safely
        try { stats.members = await fetchCount('members'); } catch(e) {}
        try { stats.users = await fetchCount('users'); } catch(e) {}
      } catch (e) {
        console.warn('[ghost-backup] Failed to fetch database stats:', e.message);
      }
    }

    res.json({
      ghostVersion,
      nodeVersion: process.version,
      contentPath: contentPath || 'NOT RESOLVED',
      dbClient: dbConfig ? dbConfig.client : 'NOT RESOLVED',
      dbConnection: maskedConnection,
      mediaDirs,
      stats,
      maxUploadMB: parseInt(process.env.GHOST_BACKUP_MAX_UPLOAD_MB || '500', 10)
    });
  } catch (err) {
    console.error('[ghost-backup] Status error:', err.message);
    res.status(500).json({ error: 'Failed to resolve system status.' });
  }
});

// POST /api/export — Streaming backup download
router.post('/api/export', requireInternalRequest, async (req, res) => {
  // Same-Origin check
  const sameOriginError = validateSameOrigin(req);
  if (sameOriginError) {
    return res.status(403).json({ error: sameOriginError });
  }

  try {
    await exporter.createBackup(res);
  } catch (err) {
    console.error('[ghost-backup] Export error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// POST /api/import — Upload and restore from .tar.gz archive
router.post('/api/import', requireInternalRequest, async (req, res) => {
  // Same-Origin check
  const sameOriginError = validateSameOrigin(req);
  if (sameOriginError) {
    return res.status(403).json({ error: sameOriginError });
  }

  // Validate content type
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/gzip') && 
      !contentType.includes('application/x-gzip') &&
      !contentType.includes('application/octet-stream') &&
      !contentType.includes('application/x-tar')) {
    return res.status(400).json({ error: 'Invalid content type. Expected application/gzip or application/octet-stream.' });
  }

  try {
    const result = await importer.restoreBackup(req);
    res.json(result);
  } catch (err) {
    console.error('[ghost-backup] Import error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

module.exports = router;
