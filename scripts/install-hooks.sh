#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/scripts/githooks"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "Installing git hooks..."

# Copy each hook from scripts/githooks to .git/hooks
for hook in "$HOOKS_DIR"/*; do
    if [[ -f "$hook" ]]; then
        hook_name=$(basename "$hook")
        echo "  Copying $hook_name..."
        cp "$hook" "$GIT_HOOKS_DIR/$hook_name"
        chmod +x "$GIT_HOOKS_DIR/$hook_name"
    fi
done

echo "✅ Git hooks installed successfully!"
echo ""
echo "Installed hooks:"
ls -1 "$HOOKS_DIR" 2>/dev/null | sed 's/^/  - /' || echo "  (none)"
echo ""
echo "To skip a hook, use: git commit --no-verify"
