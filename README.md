# Ghost Backup & Restore Plugin

**Ghost Backup** is a powerful, enterprise-ready side-car plugin for Ghost CMS that provides one-click full-system backup and restore capabilities directly from the native Ghost Admin panel—without ever altering a single line of Ghost's core source code.

This plugin exports your database and media content into a single compressed `.tar.gz` archive. It uses Ghost's native engine-agnostic JSON export format, meaning you can flawlessly migrate between SQLite3 and MySQL instances without ever breaking your site or experiencing database engine conflicts.

---

## Architecture & Security Highlights

- **Zero Core Modifications**: Operates strictly within Ghost's native security perimeter. No core files are touched.
- **Flawless Cross-Engine Migration**: Replaces fragile `mysqldump` and file copying with Ghost's native JSON data export. You can seamlessly backup a MySQL production server and restore it to a local SQLite development environment (and vice versa).
- **Dynamic Path Resolution**: Zero hardcoded paths. Resolves Ghost's content directory and database configuration through environment variables, config files, and filesystem detection.
- **Streaming I/O**: Export and import operations use streaming pipelines — `tar.create()` streams directly to the HTTP response to prevent memory exhaustion.
- **Container Hardened**: All temporary file processing uses `/tmp`, so the plugin operates flawlessly inside hardened Kubernetes environments with `readOnlyRootFilesystem: true`.
- **Same-Origin & RBAC Security**: Full Ghost session authentication, Administrator/Owner role-based access control, and Same-Origin request validation on all endpoints.
- **Active Theme Protection**: Purposefully excludes the `themes/` directory during export and configuration files during import to prevent "missing theme" errors and database corruption on the target instance.
- **Idempotent Lifecycle & Multi-Plugin Coexistence**: Safe cooperative install/uninstall alongside Ghost MailConfig and Ghost FormBuilder.

---

## 🚀 Deployment & Installation

### 1. Local / Bare-Metal Environments (Ghost-CLI)
If you are running Ghost locally or on a standard VM using the Ghost-CLI:

**Install:**
```bash
# Run this inside your Ghost root directory
npm install ghost-backup
```
*Note: The automated installer will detect your `.ghost-cli` environment and automatically run `ghost restart` in the background for you!*

**Uninstall:**
```bash
node "node_modules/ghost-backup/scripts/uninstall.js"
npm uninstall ghost-backup
```

### 2. Standard Docker Containers
To support zero-downtime hot-reloads inside Docker without killing the container, you must use the **Supervisor Pattern**.

**Custom Dockerfile:**
```dockerfile
FROM ghost:5-alpine
WORKDIR /var/lib/ghost

# Copy the supervisor script (see documentation for script contents)
COPY ghost-supervisor.js /var/lib/ghost/ghost-supervisor.js

# Pre-install the plugin
RUN npm install ghost-backup

USER node
# Override default CMD to use the Supervisor
CMD ["node", "ghost-supervisor.js"]
```

### 3. Highly Restricted Kubernetes / Helm (Production)
For enterprise clusters enforcing `readOnlyRootFilesystem: true`, ensure your `config.production.json` is symlinked to your persistent volume using an `initContainer`.

**Example Helm Security Context:**
```yaml
securityContext:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  runAsUser: 1000
  runAsGroup: 1000
  runAsNonRoot: true
  capabilities:
    drop: ["ALL"]
```

---

## Usage

1. Open your Ghost Admin interface.
2. Open your **Settings** sidebar.
3. Click the newly injected **Installed Plugins** option near the bottom of the navigation pane.
4. Select the **Backup & Restore** plugin and hit **Configure**.
5. Use the **Create Backup** button to generate and download a full `.tar.gz` snapshot.
6. Use the **Restore from Backup** panel to upload a previously exported archive and restore your entire site.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GHOST_BACKUP_TMP` | `/tmp` | Temporary directory for staging backup/restore operations |
| `GHOST_BACKUP_MAX_UPLOAD_MB` | `500` | Maximum upload size in megabytes for import operations |

---

## What's Included in a Backup

| Component | Format & Location | Description |
|---|---|---|
| **Database** | `ghost-backup.json` | Engine-agnostic database dump (Posts, Users, Tags, Settings) |
| **Media Assets** | `content/images/`, `media/`, `files/` | Uploaded images, videos, audio, and documents |
| **Routing & Config** | `content/settings/` | `routes.yaml` and `redirects.yaml` |
| **Logs** | `content/logs/` | Runtime application logs |
| **Root Configs** | `config.*.json` | Captured for reference within the archive (safely bypassed on restore) |
| **Manifest** | `manifest.json` | Backup metadata and versioning |

*(Note: The `themes/` folder is intentionally excluded to ensure your active theme isn't disrupted during migration).*
