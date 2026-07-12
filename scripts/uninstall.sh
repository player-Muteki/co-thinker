#!/usr/bin/env bash
# Luna 外部安装产物一键卸载
# 运行方式: bash scripts/uninstall.sh
# 说明: 只清理系统级安装产物，不动 code/luna/ 源码目录
set -e

echo "==> 清理 ~/.Luna/（全局虚拟环境）"
rm -rf ~/.Luna/

echo "==> 清理 ~/.lunarc（全局配置）"
rm -f ~/.lunarc

echo "==> 清理 ~/.local/bin/luna（PATH 入口）"
rm -f ~/.local/bin/luna

echo "==> 清理 ~/.cargo/bin/luna"
rm -f ~/.cargo/bin/luna

echo "==> 清理 ~/.cache/luna"
rm -f ~/.cache/luna

echo "==> 清理 PYTHONPATH 环境变量"
unset PYTHONPATH

echo ""
echo "[DONE] 所有外部安装产物已清除，源码目录保持不动"
