"""Launch the prebuilt local workspace without an npm process."""
import os
from pathlib import Path
import socket
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def available_port():
    for port in range(int(os.environ.get("PORT", "8000")), int(os.environ.get("PORT", "8000")) + 10):
        with socket.socket() as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("没有可用端口，请关闭旧服务或设置 PORT。")


if __name__ == "__main__":
    if not (ROOT / "frontend" / "dist" / "index.html").exists():
        raise SystemExit("前端构建缺失。请在 frontend 执行 npm install 和 npm run build。")
    import uvicorn
    port = available_port()
    print(f"AdInsight Agent: http://127.0.0.1:{port}/", flush=True)
    uvicorn.run("main:app", host="127.0.0.1", port=port)
