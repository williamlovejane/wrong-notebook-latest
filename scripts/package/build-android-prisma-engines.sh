#!/usr/bin/env bash
# 为安卓单机版交叉编译 Prisma 引擎（arm64-v8a）
#
#   bash scripts/package/build-android-prisma-engines.sh <输出目录>
#
# Prisma 不提供安卓引擎，这里按项目安装的 Prisma 版本（node_modules/@prisma/engines-version）
# 下载对应提交的 prisma-engines 源码，用 Android NDK 编译：
#   - libquery_engine.so：查询引擎（Node-API 库），运行时由 PRISMA_QUERY_ENGINE_LIBRARY 指定
#   - schema-engine：迁移引擎，启动时执行 prisma migrate deploy
#
# 依赖：rustup、Android NDK（ANDROID_NDK_HOME 或 ANDROID_NDK_ROOT）、curl、perl、make。
# 编译约需 15–30 分钟，CI 按引擎提交缓存结果（见 .github/workflows/packages.yml）。
set -euo pipefail

out="${1:?用法：build-android-prisma-engines.sh <输出目录>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
ndk="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-${ANDROID_NDK_LATEST_HOME:-}}}"
if [ -z "$ndk" ] || [ ! -d "$ndk/toolchains/llvm/prebuilt" ]; then
    echo "未找到 Android NDK，请设置 ANDROID_NDK_HOME" >&2
    exit 1
fi
commit="$(node -p "require('$root/node_modules/@prisma/engines-version/package.json').prisma.enginesVersion")"
target=aarch64-linux-android
api=24

work="${PRISMA_ENGINES_WORK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/prisma-engines.XXXXXX")}"
mkdir -p "$work" "$out"
out="$(cd "$out" && pwd)"
src="$work/prisma-engines-$commit"
if [ ! -d "$src" ]; then
    echo "[engines] 下载 prisma-engines@$commit"
    curl -fsSL "https://github.com/prisma/prisma-engines/archive/$commit.tar.gz" | tar xz -C "$work"
fi

# prisma-engines 把安卓视为 React Native 目标，关闭了 Node-API 的错误转换；单机版在安卓上运行的是 Node.js，需要恢复
error_rs="$src/libs/query-engine-common/src/error.rs"
sed -i.bak 's/#\[cfg(not(any(target_os = "android", target_os = "ios")))\]/#[cfg(not(target_os = "ios"))]/' "$error_rs"
grep -q '#\[cfg(not(target_os = "ios"))\]' "$error_rs" || { echo "补丁未生效：$error_rs" >&2; exit 1; }

toolchain="$(sed -n 's/^channel *= *"\(.*\)"/\1/p' "$src/rust-toolchain.toml")"
rustup toolchain install "$toolchain" --profile minimal --target "$target"

bin="$(echo "$ndk"/toolchains/llvm/prebuilt/*/bin)"
export RUSTUP_TOOLCHAIN="$toolchain"
export CC_aarch64_linux_android="$bin/$target$api-clang"
export CXX_aarch64_linux_android="$bin/$target$api-clang++"
export AR_aarch64_linux_android="$bin/llvm-ar"
export RANLIB_aarch64_linux_android="$bin/llvm-ranlib"
export RANLIB="$bin/llvm-ranlib"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$bin/$target$api-clang"
export GIT_HASH="$commit"
export CARGO_TARGET_DIR="$work/target"

cd "$src"
echo "[engines] 编译查询引擎和迁移引擎（Rust ${toolchain}，${target}）"
cargo build --release --target "$target" --features vendored-openssl -p query-engine-node-api
cargo build --release --target "$target" --features vendored-openssl -p schema-engine-cli

cp "$CARGO_TARGET_DIR/$target/release/libquery_engine.so" "$out/libquery_engine.so"
cp "$CARGO_TARGET_DIR/$target/release/schema-engine" "$out/schema-engine"
cp "$src/LICENSE" "$out/LICENSE"
echo "$commit" > "$out/COMMIT"
echo "[engines] 已输出到 $out"
