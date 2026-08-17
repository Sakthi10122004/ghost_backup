const fs = require('fs');
const path = require('path');
const localExpress = require('express');
let ghostExpress;
try {
    ghostExpress = require(path.join(process.cwd(), 'current/core/shared/express'))._express;
} catch (e) {
    ghostExpress = localExpress;
}
const http = require('http');
const router = require('./router');
const { getGhostPath } = require('./utils');

const cachedIndexHtmlByPath = new Map();

module.exports = {
    init: () => {
        console.log('[ghost-backup] Initializing Hijack Engine...');

        // Register our script for cooperative injection
        global.__ghostCooperativeScripts = global.__ghostCooperativeScripts || [];
        if (!global.__ghostCooperativeScripts.includes('/ghost/backup/inject.js')) {
            global.__ghostCooperativeScripts.push('/ghost/backup/inject.js');
        }

        let expressLib;
        try {
            expressLib = require(path.join(process.cwd(), 'current/core/shared/express'))._express || require('express');
        } catch (e) {
            expressLib = localExpress;
        }

        if (expressLib && expressLib.response) {
            // Hook res.send cooperatively (idempotent — checks flag)
            if (!expressLib.response._cooperativeSendHooked) {
                const originalSend = expressLib.response.send;
                expressLib.response.send = function(body) {
                    const contentEncoding = this.getHeader('content-encoding');
                    const hasEncoding = contentEncoding && contentEncoding !== 'identity';
                    
                    const contentType = this.getHeader('content-type') || '';
                    const isHtml = !hasEncoding && typeof body === 'string' && (contentType.includes('text/html') || /^\s*(<!DOCTYPE|html)/i.test(body));
                    if (isHtml && body.includes('</head>')) {
                        const scripts = global.__ghostCooperativeScripts || [];
                        let modified = false;
                        scripts.forEach(src => {
                            const tag = `<script src="${src}"></script>`;
                            if (!body.includes(src)) {
                                body = body.replace('</head>', `  ${tag}\n  </head>`);
                                modified = true;
                            }
                        });
                        if (modified) {
                            this.removeHeader('Content-Length');
                        }
                    }
                    return originalSend.call(this, body);
                };
                expressLib.response._cooperativeSendHooked = true;
            }

            // Hook res.sendFile cooperatively (idempotent — checks flag)
            if (!expressLib.response._cooperativeSendFileHooked) {
                const originalSendFile = expressLib.response.sendFile;
                expressLib.response.sendFile = function(filePath) {
                    if (filePath && typeof filePath === 'string' && filePath.endsWith('index.html')) {
                        try {
                            const content = fs.readFileSync(filePath, 'utf8');
                            this.removeHeader('ETag');
                            this.removeHeader('Content-Length');
                            return this.send(content);
                        } catch (e) {
                            console.error('[ghost-backup] Cooperative sendFile error:', e);
                        }
                    }
                    return originalSendFile.apply(this, arguments);
                };
                expressLib.response._cooperativeSendFileHooked = true;
            }
        }

        // 1. Create internal Express app for our routes
        const internalApp = localExpress();
        internalApp.use('/ghost/backup', router);

        // Serve frontend inject script
        internalApp.get('/ghost/backup/inject.js', (req, res) => {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.sendFile(path.join(__dirname, 'frontend-inject.js'));
        });

        // 2. Monkey-Patch http.Server.prototype.emit to intercept our routes
        const originalEmit = http.Server.prototype.emit;
        http.Server.prototype.emit = function(type, req, res) {
            if (type === 'request' && req.url) {
                if (req.url.startsWith('/ghost/backup')) {
                    internalApp(req, res);
                    return true;
                }
            }
            return originalEmit.apply(this, arguments);
        };

        console.log('[ghost-backup] ✅ HTTP Server Hijack established cooperatively.');
    }
};
