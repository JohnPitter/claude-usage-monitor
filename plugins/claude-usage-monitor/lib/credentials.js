/**
 * Credential storage adapter — reads and writes Claude Code OAuth credentials
 * from the platform-appropriate location.
 *
 *   macOS    → Keychain item "Claude Code-credentials" (account = $USER)
 *   Windows  → Credential Manager target "Claude Code-credentials" via cmdkey/PowerShell
 *   Linux    → ~/.claude/.credentials.json
 *
 * On macOS and Windows we still fall back to the file path if the secure store
 * lookup fails (e.g. a user manually maintaining ~/.claude/.credentials.json
 * for tooling reasons), so callers always get whichever copy is present.
 *
 * Errors are swallowed and surfaced as `null` so the monitor never blocks
 * session start.
 */

const { execFile } = require("child_process");
const { readFile, writeFile } = require("fs/promises");
const { homedir, userInfo } = require("os");
const { join } = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const FILE_PATH = join(homedir(), ".claude", ".credentials.json");
const SERVICE_NAME = "Claude Code-credentials";
const PLATFORM = process.platform;

// ─── macOS Keychain ─────────────────────────────────────────

async function readFromKeychainMac() {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-s",
      SERVICE_NAME,
      "-a",
      userInfo().username,
      "-w",
    ]);
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

async function writeToKeychainMac(creds) {
  try {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE_NAME,
      "-a",
      userInfo().username,
      "-w",
      JSON.stringify(creds),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ─── Windows Credential Manager ─────────────────────────────
// Claude Code on Windows stores OAuth credentials as a generic credential
// targeted by the same name as the macOS Keychain service. We read/write via
// PowerShell + the CredentialManager .NET classes since `cmdkey` cannot
// retrieve secrets, only metadata.

async function runPowerShell(script) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true }
  );
  return stdout;
}

async function readFromCredentialManagerWin() {
  try {
    const script = `
      $cred = (New-Object -TypeName System.Management.Automation.PSCredential -ArgumentList 'placeholder', (ConvertTo-SecureString 'placeholder' -AsPlainText -Force));
      Add-Type -AssemblyName System.Web;
      $sig = @"
        [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
        public static extern bool CredRead(string target, int type, int flags, out IntPtr CredentialPtr);
        [DllImport("advapi32.dll", SetLastError=true)]
        public static extern void CredFree(IntPtr cred);
        [StructLayout(LayoutKind.Sequential)]
        public struct CREDENTIAL {
          public int Flags; public int Type; public IntPtr TargetName;
          public IntPtr Comment; public long LastWritten;
          public int CredentialBlobSize; public IntPtr CredentialBlob;
          public int Persist; public int AttributeCount; public IntPtr Attributes;
          public IntPtr TargetAlias; public IntPtr UserName;
        }
"@;
      Add-Type -MemberDefinition $sig -Name Win32Cred -Namespace Native -UsingNamespace System.Runtime.InteropServices;
      $ptr = [IntPtr]::Zero;
      if ([Native.Win32Cred]::CredRead('${SERVICE_NAME}', 1, 0, [ref]$ptr)) {
        $c = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Native.Win32Cred+CREDENTIAL]);
        $bytes = New-Object byte[] $c.CredentialBlobSize;
        [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $c.CredentialBlobSize);
        [Native.Win32Cred]::CredFree($ptr);
        Write-Output ([System.Text.Encoding]::Unicode.GetString($bytes));
      }
    `;
    const stdout = await runPowerShell(script);
    const trimmed = stdout.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function writeToCredentialManagerWin(creds) {
  try {
    const json = JSON.stringify(creds).replace(/'/g, "''");
    const script = `
      $secret = '${json}';
      cmdkey /generic:${SERVICE_NAME} /user:${userInfo().username} /pass:$secret | Out-Null;
    `;
    await runPowerShell(script);
    return true;
  } catch {
    return false;
  }
}

// ─── File backend (Linux + universal fallback) ──────────────

async function readFromFile() {
  try {
    return JSON.parse(await readFile(FILE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

async function writeToFile(creds) {
  try {
    await writeFile(FILE_PATH, JSON.stringify(creds, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ─────────────────────────────────────────────

async function readCredentials() {
  if (PLATFORM === "darwin") {
    const fromKeychain = await readFromKeychainMac();
    if (fromKeychain) return fromKeychain;
  } else if (PLATFORM === "win32") {
    const fromCredMgr = await readFromCredentialManagerWin();
    if (fromCredMgr) return fromCredMgr;
  }
  return readFromFile();
}

async function writeCredentials(creds) {
  if (PLATFORM === "darwin") {
    if (await writeToKeychainMac(creds)) return true;
  } else if (PLATFORM === "win32") {
    if (await writeToCredentialManagerWin(creds)) return true;
  }
  return writeToFile(creds);
}

module.exports = { readCredentials, writeCredentials };
