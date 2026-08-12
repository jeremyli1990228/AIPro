# GitHub 自动推送守护脚本
# 用法: python auto_git_push.py [--interval 分钟数] [--max-tries 次数]
# 功能: 每隔 N 分钟尝试 git push,成功就退出,失败继续等待重试

import os
import sys
import time
import subprocess
import argparse
from datetime import datetime

REPO_DIR = r"d:\Trae_Pro\AI_Pro"
LOG_FILE = os.path.join(REPO_DIR, "git_push.log")


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    print(line.strip(), flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line)


def run_git_push() -> bool:
    try:
        result = subprocess.run(
            ["git", "push"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            timeout=60,
        )
        stdout = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()
        combined = "\n".join(x for x in [stdout, stderr] if x)
        log(f"git push exit_code={result.returncode}")
        if combined:
            log(f"  output:\n{combined}")
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        log("git push 超时(>60s),放弃这一轮")
        return False
    except Exception as e:
        log(f"git push 异常: {e}")
        return False


def check_need_push() -> bool:
    """判断本地是否还有未推送的 commit"""
    try:
        result = subprocess.run(
            ["git", "status", "-sb"],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            timeout=10,
        )
        status_out = (result.stdout or "").strip()
        log(f"git status: {status_out}")
        return "ahead" in status_out
    except Exception as e:
        log(f"check status 异常: {e}")
        return True  # 保守起见继续尝试


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=10, help="重试间隔(分钟)")
    parser.add_argument("--max-tries", type=int, default=100, help="最大尝试次数")
    args = parser.parse_args()

    interval_sec = args.interval * 60
    log("=" * 50)
    log(f"自动推送守护启动 - 仓库: {REPO_DIR}")
    log(f"间隔 {args.interval} 分钟,最多尝试 {args.max_tries} 次")
    log("=" * 50)

    for i in range(1, args.max_tries + 1):
        log(f"--- 第 {i}/{args.max_tries} 轮尝试 ---")

        if not check_need_push():
            log("✅ 本地已与远程同步,无需再 push,退出守护")
            return 0

        ok = run_git_push()
        if ok:
            log("🎉 git push 成功!所有更新已推送到 GitHub")
            # 再确认一次状态
            check_need_push()
            return 0

        next_time = datetime.fromtimestamp(time.time() + interval_sec)
        log(f"⏳ 本轮失败,{args.interval} 分钟后重试(下次约 {next_time.strftime('%H:%M:%S')})")
        time.sleep(interval_sec)

    log(f"❌ 已达到最大尝试次数({args.max_tries}次),请手动检查网络后执行 git push")
    return 1


if __name__ == "__main__":
    sys.exit(main())