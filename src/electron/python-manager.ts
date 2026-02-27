import { spawn, ChildProcess } from "child_process";
import path from "path";

export class PythonManager {
  private process: ChildProcess | null = null;
  private port: number = 8976;
  private isDev: boolean;

  constructor(isDev: boolean) {
    this.isDev = isDev;
  }

  async start(): Promise<void> {
    // Check if backend is already running (e.g. started by concurrently in dev)
    if (await this.isBackendReady()) {
      console.log("[PythonManager] Backend already running, skipping spawn");
      return;
    }

    const cwd = path.join(__dirname, "../../");

    let cmd: string;
    let args: string[];

    if (this.isDev) {
      // In dev, use `uv run` to ensure the package is installed in the venv
      cmd = "uv";
      args = ["run", "python", "-m", "backend.main"];
    } else {
      // In production, use bundled python
      cmd = path.join(process.resourcesPath || "", "python", "bin", "python");
      args = ["-m", "backend.main"];
    }

    console.log(`[PythonManager] Starting: ${cmd} ${args.join(" ")}`);
    console.log(`[PythonManager] CWD: ${cwd}`);

    this.process = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: this.isDev, // shell needed for `uv` to be found on PATH
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      console.log(`[Python] ${data.toString().trim()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.error(`[Python] ${data.toString().trim()}`);
    });

    this.process.on("exit", (code) => {
      console.log(`[PythonManager] Python process exited with code ${code}`);
      this.process = null;
    });

    await this.waitForReady();
    console.log("[PythonManager] Backend is ready");
  }

  private async isBackendReady(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/docs`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForReady(timeout = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.isBackendReady()) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(
      `Python backend failed to start within ${timeout / 1000}s`
    );
  }

  stop(): void {
    if (this.process) {
      console.log("[PythonManager] Stopping backend");
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  get isRunning(): boolean {
    return this.process !== null;
  }
}
