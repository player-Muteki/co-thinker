#!/usr/bin/env bash
# ============================================================
# Co-Thinker 一键安装（Release 用户使用）
#
# 从 GitHub Releases 下载 .whl 后执行:
#   bash install.sh co_thinker-0.0.2-py3-none-any.whl
#
# 安装后 co-thinker 命令全局可用。
# ============================================================
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }
step()  { echo -e "\n${BOLD}▶ $1${NC}"; }

# ── 参数 ────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
    echo "用法: bash install.sh <wheel文件>"
    echo "示例: bash install.sh co_thinker-0.0.2-py3-none-any.whl"
    exit 1
fi

WHEEL="$1"
if [[ ! -f "$WHEEL" ]]; then
    error "找不到文件: $WHEEL"
    exit 1
fi
WHEEL_PATH="$(realpath "$WHEEL")"

# ── 1. 检查 Python ──────────────────────────────────────────
step "检查 Python"
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" --version 2>&1 | grep -oP '\d+\.\d+')
        major="${ver%.*}"
        minor="${ver#*.}"
        if [[ "$major" -ge 3 && "$minor" -ge 10 ]]; then
            PYTHON="$cmd"
            info "Python $("$cmd" --version 2>&1)"
            break
        fi
    fi
done
if [[ -z "$PYTHON" ]]; then
    error "需要 Python >= 3.10"
    exit 1
fi

# ── 2. 安装到专用虚拟环境 ───────────────────────────────────
step "安装 Co-Thinker"

VENV_DIR="$HOME/.co-thinker"
if [[ -d "$VENV_DIR" ]]; then
    warn "已存在 $VENV_DIR，重新安装"
    rm -rf "$VENV_DIR"
fi

"$PYTHON" -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install "$WHEEL_PATH" --quiet
info "已安装到 $VENV_DIR"

# ── 3. 创建 PATH 链接 ──────────────────────────────────────
step "配置系统路径"

# 确保目标 bin 目录存在
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

LINK="$BIN_DIR/co-thinker"
if [[ -L "$LINK" || -f "$LINK" ]]; then
    rm -f "$LINK"
fi
ln -s "$VENV_DIR/bin/co-thinker" "$LINK"
info "已创建链接: $LINK -> $VENV_DIR/bin/co-thinker"

# ── 4. 检查 PATH ────────────────────────────────────────────
step "检查 PATH"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    warn "$BIN_DIR 不在 PATH 中！"
    echo ""
    echo "  将以下内容添加到 ~/.bashrc 或 ~/.zshrc:"
    echo ""
    echo "    export PATH=\"\$PATH:$BIN_DIR\""
    echo ""
    echo "  然后执行: source ~/.zshrc"
    echo ""
else
    info "PATH 已包含 $BIN_DIR"
fi

# ── 完成 ──────────────────────────────────────────────────────
step "✅ 安装完成！"
echo ""
echo "  运行以下命令开始使用："
echo ""
echo "    mkdir my-kb && cd my-kb"
echo "    co-thinker init       # 创建 .env 和运行时目录"
echo "    co-thinker start      # 启动 Web 界面"
echo ""
