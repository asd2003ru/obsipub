#!/bin/sh
set -e

# Verify we're running from an Obsidian vault
if [ ! -d ".obsidian" ]; then
    echo "Error: not run from an Obsidian vault (current directory missing .obsidian)" >&2
    exit 1
fi

# Verify required tools
if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required but not installed" >&2
    exit 1
fi
if ! command -v tar >/dev/null 2>&1; then
    echo "Error: tar is required but not installed" >&2
    exit 1
fi
if ! command -v mktemp >/dev/null 2>&1; then
    echo "Error: mktemp is required but not installed" >&2
    exit 1
fi

# Validate OBSIPUB_VERSION if set
if [ -n "${OBSIPUB_VERSION:-}" ]; then
    case "${OBSIPUB_VERSION}" in
        *[!a-zA-Z0-9._-]*)
            echo "Error: OBSIPUB_VERSION contains unsafe characters: ${OBSIPUB_VERSION}" >&2
            exit 1
            ;;
    esac
fi

REPO="asd2003ru/obsipub"
API_BASE="https://api.github.com/repos/${REPO}/releases"

TMPDIR=""
trap 'rm -rf "${TMPDIR}"' EXIT
TMPDIR="$(mktemp -d)"

RELEASE_JSON_FILE="${TMPDIR}/release.json"
ARCHIVE_FILE="${TMPDIR}/archive.tar.gz"
ARCHIVE_CONTENTS_FILE="${TMPDIR}/archive_contents.txt"

# Determine release endpoint
if [ -n "${OBSIPUB_VERSION:-}" ]; then
    RELEASE_URL="${API_BASE}/tags/${OBSIPUB_VERSION}"
else
    RELEASE_URL="${API_BASE}/latest"
fi

# Download release metadata
HTTP_CODE="$(curl -sL -o "${RELEASE_JSON_FILE}" -w "%{http_code}" "${RELEASE_URL}" 2>/dev/null || echo "000")"

if [ "${HTTP_CODE}" != "200" ]; then
    echo "Error: GitHub Releases API returned HTTP ${HTTP_CODE}" >&2
    exit 1
fi

# Check for API errors
MSG=""
MSG="$(grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' "${RELEASE_JSON_FILE}" 2>/dev/null | head -n 1 | sed 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)"
if [ -n "${MSG}" ]; then
    echo "Error: GitHub Releases API error: ${MSG}" >&2
    exit 1
fi

# Verify release is not a draft
IS_DRAFT="$(grep -o '"draft"[[:space:]]*:[[:space:]]*true' "${RELEASE_JSON_FILE}" 2>/dev/null | head -n 1 || true)"
if [ -n "${IS_DRAFT}" ]; then
    echo "Error: the selected release is marked as a draft" >&2
    exit 1
fi

# Find the linux-x64 archive download URL from assets
DOWNLOAD_URL="$(sed -n 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"\([^"]*linux-x64\.tar\.gz\)".*/\1/p' "${RELEASE_JSON_FILE}" | head -n 1)"

if [ -z "${DOWNLOAD_URL}" ]; then
    echo "Error: no linux-x64 archive (linux-x64.tar.gz) found in release assets" >&2
    exit 1
fi

# Download archive
HTTP_CODE="$(curl -sL -o "${ARCHIVE_FILE}" -w "%{http_code}" "${DOWNLOAD_URL}" 2>/dev/null || echo "000")"
if [ "${HTTP_CODE}" != "200" ]; then
    echo "Error: archive download returned HTTP ${HTTP_CODE}" >&2
    exit 1
fi

# Verify archive contents and extract expected plugin files
if ! tar -tzf "${ARCHIVE_FILE}" > "${ARCHIVE_CONTENTS_FILE}" 2>/dev/null; then
    echo "Error: archive is malformed or not a valid tar.gz" >&2
    exit 1
fi

MAIN_JS_PATH="$(grep 'plugin/main\.js$' "${ARCHIVE_CONTENTS_FILE}" | head -n 1 || true)"
MANIFEST_PATH="$(grep 'plugin/manifest\.json$' "${ARCHIVE_CONTENTS_FILE}" | head -n 1 || true)"
STYLES_PATH="$(grep 'plugin/styles\.css$' "${ARCHIVE_CONTENTS_FILE}" | head -n 1 || true)"

if [ -z "${MAIN_JS_PATH}" ] || [ -z "${MANIFEST_PATH}" ] || [ -z "${STYLES_PATH}" ]; then
    echo "Error: archive missing expected plugin files (plugin/main.js, plugin/manifest.json, plugin/styles.css)" >&2
    exit 1
fi

# Create installation directory
INSTALL_DIR=".obsidian/plugins/obsipub"
mkdir -p "${INSTALL_DIR}"

# Extract only the three plugin files into a temporary subdir, then install
# We extract directly to a sub-temp to keep paths clean
EXTRACT_DIR="${TMPDIR}/plugin"
mkdir -p "${EXTRACT_DIR}"

tar -xzf "${ARCHIVE_FILE}" -C "${TMPDIR}" "${MAIN_JS_PATH}" "${MANIFEST_PATH}" "${STYLES_PATH}" 2>/dev/null || {
    echo "Error: failed to extract plugin files from archive" >&2
    exit 1
}

# The archive uses paths like ./plugin/main.js; verify extracted paths
# and copy them to the install directory
if [ -f "${TMPDIR}/${MAIN_JS_PATH}" ]; then
    cp "${TMPDIR}/${MAIN_JS_PATH}" "${INSTALL_DIR}/main.js"
else
    echo "Error: extracted file not found at ${TMPDIR}/${MAIN_JS_PATH}" >&2
    exit 1
fi

if [ -f "${TMPDIR}/${MANIFEST_PATH}" ]; then
    cp "${TMPDIR}/${MANIFEST_PATH}" "${INSTALL_DIR}/manifest.json"
else
    echo "Error: extracted file not found at ${TMPDIR}/${MANIFEST_PATH}" >&2
    exit 1
fi

if [ -f "${TMPDIR}/${STYLES_PATH}" ]; then
    cp "${TMPDIR}/${STYLES_PATH}" "${INSTALL_DIR}/styles.css"
else
    echo "Error: extracted file not found at ${TMPDIR}/${STYLES_PATH}" >&2
    exit 1
fi

echo "Installed obsipub plugin to .obsidian/plugins/obsipub/"
echo "Installed files: main.js, manifest.json, styles.css"
