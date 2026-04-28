const test = require("node:test");
const assert = require("node:assert/strict");
const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");

const ROOT = path.join(__dirname, "..");
const CLI = path.join(ROOT, "bin", "hacker-bob.js");
const PACKAGE_VERSION = require("../package.json").version;
const execFileAsync = promisify(execFile);

test("CLI help explains per-project installs and global CLI behavior", () => {
  const output = execFileSync(process.execPath, [CLI, "--help"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const command of ["install", "update", "check-update", "doctor", "uninstall"]) {
    assert.match(output, new RegExp(`hacker-bob ${command}`));
  }
  assert.match(output, /one Claude Code project directory per command/);
  assert.match(output, /Global npm install only adds this CLI to PATH/);
  assert.match(output, /Uninstall defaults to dry-run/);
});

test("CLI installs into a workspace", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-install-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  try {
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });

    assert.equal(fs.readFileSync(path.join(workspace, ".claude", "bob", "VERSION"), "utf8").trim(), PACKAGE_VERSION);
    assert.ok(fs.existsSync(path.join(workspace, ".claude", "commands", "bob-update.md")));
    assert.ok(fs.existsSync(path.join(workspace, ".claude", "commands", "bob-egress.md")));
    assert.ok(fs.existsSync(path.join(workspace, ".claude", "hooks", "bob-check-update.js")));
    assert.ok(fs.existsSync(path.join(workspace, ".claude", "hooks", "bob-egress.js")));
    assert.ok(fs.existsSync(path.join(workspace, ".claude", "bob", "egress-profiles.json")));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("CLI check-update emits JSON with mocked registry and changelog URLs", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-update-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(path.join(workspace, ".claude", "bob"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".claude", "bob", "VERSION"), "1.0.0\n");

  const registryPath = path.join(tempRoot, "registry.json");
  const changelogPath = path.join(tempRoot, "CHANGELOG.md");
  fs.writeFileSync(registryPath, JSON.stringify({ "dist-tags": { latest: "1.1.0" } }));
  fs.writeFileSync(changelogPath, "## [1.1.0] - 2026-04-26\n\n- update\n");

  try {
    const output = execFileSync(process.execPath, [CLI, "check-update", workspace, "--json"], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: tempHome,
        HACKER_BOB_REGISTRY_METADATA_URL: pathToFileURL(registryPath).href,
        HACKER_BOB_CHANGELOG_URL: pathToFileURL(changelogPath).href,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const result = JSON.parse(output);
    assert.equal(result.installed_version, "1.0.0");
    assert.equal(result.latest_version, "1.1.0");
    assert.equal(result.update_available, true);
    assert.match(result.changelog, /update/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("CLI doctor passes on a freshly installed workspace", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-doctor-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  try {
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });

    const output = execFileSync(process.execPath, [CLI, "doctor", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(output, /No required problems found/);
    assert.match(output, /OK: mcp_server_loadable/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("CLI doctor --json returns stable machine-readable checks", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-doctor-json-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  try {
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });

    const output = execFileSync(process.execPath, [CLI, "doctor", workspace, "--json"], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const result = JSON.parse(output);
    assert.equal(result.ok, true);
    assert.equal(result.target, workspace);
    for (const id of [
      "node_version",
      "target_directory",
      "installed_version",
      "install_metadata",
      "commands",
      "hook_files",
      "policy_replay",
      "mcp_server_config",
      "settings_hooks",
      "settings_statusline",
      "mcp_server_loadable",
    ]) {
      assert.ok(result.checks.some((check) => check.id === id), `${id} missing`);
    }
    assert.ok(result.checks.every((check) => ["ok", "warn"].includes(check.status)));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("CLI doctor exits 1 when required install state is missing", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-doctor-fail-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  try {
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });
    fs.rmSync(path.join(workspace, ".claude", "bob", "VERSION"), { force: true });

    assert.throws(() => {
      execFileSync(process.execPath, [CLI, "doctor", workspace, "--json"], {
        cwd: ROOT,
        env: { ...process.env, HOME: tempHome },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }, (error) => {
      assert.equal(error.status, 1);
      const result = JSON.parse(error.stdout.toString("utf8"));
      assert.equal(result.ok, false);
      assert.ok(result.checks.some((check) => check.id === "installed_version" && check.status === "error"));
      return true;
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("CLI uninstall dry-run changes nothing", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-uninstall-dry-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  try {
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });
    const versionBefore = fs.readFileSync(path.join(workspace, ".claude", "bob", "VERSION"), "utf8");
    const mcpBefore = fs.readFileSync(path.join(workspace, ".mcp.json"), "utf8");
    const settingsBefore = fs.readFileSync(path.join(workspace, ".claude", "settings.json"), "utf8");

    const output = execFileSync(process.execPath, [CLI, "uninstall", workspace, "--dry-run", "--json"], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const result = JSON.parse(output);
    assert.equal(result.dry_run, true);
    assert.ok(result.actions.length > 0);
    assert.equal(fs.readFileSync(path.join(workspace, ".claude", "bob", "VERSION"), "utf8"), versionBefore);
    assert.equal(fs.readFileSync(path.join(workspace, ".mcp.json"), "utf8"), mcpBefore);
    assert.equal(fs.readFileSync(path.join(workspace, ".claude", "settings.json"), "utf8"), settingsBefore);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("CLI uninstall --yes removes Bob-managed files and preserves unrelated config", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-uninstall-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(path.join(workspace, ".claude"), { recursive: true });

  try {
    fs.writeFileSync(path.join(workspace, ".mcp.json"), `${JSON.stringify({
      mcpServers: {
        existing: { command: "node", args: ["existing.js"] },
      },
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(workspace, ".claude", "settings.json"), `${JSON.stringify({
      permissions: {
        allow: ["custom-tool", "mcp__bountyagent__custom_user_tool"],
      },
      hooks: {
        PreToolUse: [{
          matcher: "Bash",
          hooks: [{ type: "command", command: "echo existing", timeout: 1 }],
        }],
      },
      customSetting: true,
    }, null, 2)}\n`);

    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });
    fs.writeFileSync(path.join(workspace, ".claude", "bob", "egress-profiles.json"), `${JSON.stringify({
      version: 1,
      profiles: [
        { name: "default", proxy_url: null, region: null, description: "Direct", enabled: true },
        { name: "operator", proxy_url: "${BOB_EGRESS_OPERATOR_PROXY}", region: "EU", description: "Operator-owned", enabled: true },
      ],
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(tempHome, "bounty-agent-sessions", "keep.txt"), "keep\n");

    const output = execFileSync(process.execPath, [CLI, "uninstall", workspace, "--yes", "--json"], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const result = JSON.parse(output);
    assert.equal(result.dry_run, false);
    assert.ok(result.actions.some((action) => action.path === path.join(".claude", "bob", "VERSION")));
    assert.ok(!fs.existsSync(path.join(workspace, ".claude", "commands", "bob", "hunt.md")));
    assert.ok(!fs.existsSync(path.join(workspace, ".claude", "hooks", "bob-check-update.js")));
    assert.ok(!fs.existsSync(path.join(workspace, "mcp", "server.js")));
    assert.ok(fs.existsSync(path.join(workspace, ".claude", "bob", "egress-profiles.json")));
    assert.ok(result.skipped.some((item) => item.path === path.join(".claude", "bob", "egress-profiles.json")));

    const mcp = JSON.parse(fs.readFileSync(path.join(workspace, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers.existing);
    assert.ok(!mcp.mcpServers.bountyagent);

    const settings = JSON.parse(fs.readFileSync(path.join(workspace, ".claude", "settings.json"), "utf8"));
    assert.equal(settings.customSetting, true);
    assert.ok(settings.permissions.allow.includes("custom-tool"));
    assert.ok(settings.permissions.allow.includes("mcp__bountyagent__custom_user_tool"));
    assert.ok(!settings.permissions.allow.includes("mcp__bountyagent__bounty_http_scan"));
    assert.ok(!settings.statusLine);
    assert.ok(settings.hooks.PreToolUse.some((entry) => (
      entry.matcher === "Bash" &&
      entry.hooks.some((hook) => hook.command === "echo existing")
    )));
    assert.ok(!settings.hooks.PreToolUse.some((entry) => (
      entry.hooks &&
      entry.hooks.some((hook) => /scope-guard\.sh|session-write-guard\.sh/.test(hook.command))
    )));
    assert.ok(fs.existsSync(path.join(tempHome, "bounty-agent-sessions", "keep.txt")));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("installed bob-egress helper manages profiles and redacts credentials", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-egress-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });

  try {
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });
    const helper = path.join(workspace, ".claude", "hooks", "bob-egress.js");
    const run = (args, env = {}) => execFileSync(process.execPath, [helper, workspace, ...args], {
      cwd: workspace,
      env: { ...process.env, HOME: tempHome, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let listed = JSON.parse(run(["list", "--json"]));
    assert.equal(listed.profiles.length, 1);
    assert.equal(listed.profiles[0].name, "default");

    run(["add", "operator", "--proxy-env", "BOB_EGRESS_OPERATOR_PROXY", "--region", "EU", "--description", "Operator profile", "--json"]);
    listed = JSON.parse(run(["list", "--json"]));
    const operator = listed.profiles.find((profile) => profile.name === "operator");
    assert.equal(operator.enabled, true);
    assert.equal(operator.proxy_configured, true);
    assert.doesNotMatch(JSON.stringify(listed), /BOB_EGRESS_OPERATOR_PROXY|secret|proxy\.example/);

    run(["disable", "operator", "--json"]);
    listed = JSON.parse(run(["list", "--json"]));
    assert.equal(listed.profiles.find((profile) => profile.name === "operator").enabled, false);

    run(["enable", "operator", "--json"]);
    listed = JSON.parse(run(["list", "--json"]));
    assert.equal(listed.profiles.find((profile) => profile.name === "operator").enabled, true);

    run(["remove", "operator", "--yes", "--json"]);
    listed = JSON.parse(run(["list", "--json"]));
    assert.equal(listed.profiles.some((profile) => profile.name === "operator"), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});

test("installed bob-egress test handles default egress against a safe local endpoint", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-egress-test-"));
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "bob-cli-home-"));
  const workspace = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const localServer = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ip: "127.0.0.1" }));
  });

  try {
    await new Promise((resolve) => localServer.listen(0, "127.0.0.1", resolve));
    const port = localServer.address().port;
    execFileSync(process.execPath, [CLI, "install", workspace], {
      cwd: ROOT,
      env: { ...process.env, HOME: tempHome },
      stdio: "pipe",
    });
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(workspace, ".claude", "hooks", "bob-egress.js"),
      workspace,
      "test",
      "default",
      "--url",
      `http://127.0.0.1:${port}/ip`,
      "--json",
    ], {
      cwd: workspace,
      env: { ...process.env, HOME: tempHome },
      encoding: "utf8",
    });
    const result = JSON.parse(stdout);
    assert.equal(result.profile.name, "default");
    assert.equal(result.profile.proxy_configured, false);
    assert.equal(result.observed.status, 200);
    assert.equal(result.observed.ip, "127.0.0.1");
  } finally {
    await new Promise((resolve) => localServer.close(resolve));
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
});
