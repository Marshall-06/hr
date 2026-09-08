using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace KerwenLauncher
{
    static class Program
    {
        const int HttpPort = 8000;
        const string StartUrl = "http://localhost:8000/admin/login.html";
        static string InstallDir()
        {
            return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        }

        static string MutexNameForInstall()
        {
            string folder = Path.GetFileName(InstallDir());
            if (string.IsNullOrEmpty(folder)) folder = "KerwenKadr";
            return "Local\\" + folder + "Launcher";
        }

        [STAThread]
        static void Main(string[] args)
        {
            bool serverOnly = false;
            bool silent = false;
            foreach (var a in args)
            {
                var s = (a ?? "").Trim().ToLowerInvariant();
                if (s == "--server-only" || s == "--autostart") serverOnly = true;
                if (s == "--silent") silent = true;
            }

            bool ownsMutex = false;
            using (var mutex = new Mutex(false, MutexNameForInstall()))
            try
            {
                try { ownsMutex = mutex.WaitOne(0, false); } catch { ownsMutex = true; }

                // Başga launcher eýýäm serweri başlaýar: gaýtadan Node açma.
                if (!ownsMutex)
                {
                    Log("Başga launcher işleýär — port garaşylýar");
                    int waitOther = serverOnly ? 45000 : 90000;
                    if (WaitForPort(HttpPort, waitOther) && !serverOnly)
                        OpenBrowser();
                    return;
                }

                string root = ResolveProjectRoot();
                if (string.IsNullOrEmpty(root) || !File.Exists(Path.Combine(root, "src", "server.js")))
                {
                    Log("Proýekt tapylmady. root=" + (root ?? "(null)"));
                    if (!silent)
                    {
                        MessageBox.Show(
                            "Proýekt tapylmady.\nIlki tools\\install-kerwen.ps1 işlediň.",
                            "Panel",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    }
                    return;
                }

                string node = FindNode();
                if (string.IsNullOrEmpty(node))
                {
                    Log("Node.js tapylmady");
                    if (!silent)
                    {
                        MessageBox.Show(
                            "Node.js tapylmady.\nhttps://nodejs.org sahypasyndan gurnap, soň ýene synanyň.",
                            "Panel",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    }
                    return;
                }

                Log("root=" + root + " node=" + node + " serverOnly=" + serverOnly);

                TryEnsureLanAccess();
                TryStartPostgresServices();

                // Awtostart: çalt synanyş (öňki 4×3min = 5–10 min soň başlaýardy)
                // Panel: 2 synanyş; awtostart: 12 synanyş × ~25s = ~5 min içinde durnukly
                int attempts = serverOnly ? 12 : 2;
                bool ok = false;
                for (int attempt = 1; attempt <= attempts; attempt++)
                {
                    Log("Synanyş " + attempt + "/" + attempts);

                    if (!WaitForProjectReady(root, serverOnly ? 20000 : 30000))
                    {
                        Log("Proýekt faýllary taýýar däl (OneDrive?): " + root);
                        if (attempt < attempts)
                        {
                            Thread.Sleep(serverOnly ? 3000 : 10000);
                            continue;
                        }
                        if (!silent)
                        {
                            MessageBox.Show(
                                "Proýekt faýllary tapylmady.\nOneDrive açykmy? Papkany «Always keep on this device» ediň.\n\n" + root +
                                "\n\nLog: " + GetLogPath(),
                                "Panel",
                                MessageBoxButtons.OK,
                                MessageBoxIcon.Warning);
                        }
                        return;
                    }

                    if (attempt == 1 || attempt % 3 == 0)
                        TryStartPostgresServices();

                    int dbPort = FindOpenDbPort(root);
                    if (dbPort > 0)
                    {
                        // Gysga garaş — Node özi 90s Postgres synaýar; bu ýerde uzak saklama
                        int dbWait = serverOnly ? 8000 : 20000;
                        Log("PostgreSQL garaşylýar (port " + dbPort + ", max " + (dbWait / 1000) + "s)...");
                        if (!WaitForPort(dbPort, dbWait))
                            Log("PostgreSQL henizem ýok — Node başladylýar (özi garaşar)...");
                        else
                            Log("PostgreSQL taýýar");
                    }

                    // Awtostart: Node derrew başla, 45s garaş; şowsuz bolsa 3s soň täzeden
                    int timeoutMs = serverOnly ? 45000 : 90000;
                    if (EnsureServer(node, root, timeoutMs))
                    {
                        ok = true;
                        break;
                    }

                    Log("Serwer başlamady (port " + HttpPort + ") — synanyş " + attempt);
                    LogServerStderr(root);
                    if (attempt < attempts) Thread.Sleep(serverOnly ? 3000 : 12000);
                }

                if (!ok)
                {
                    if (!silent)
                    {
                        MessageBox.Show(
                            "Serwer başlamady (port 8000).\n\n1) PostgreSQL Service Automaticmy?\n2) OneDrive papkasy açykmy (Always keep on this device)?\n3) tools\\fix-autostart.bat işlediň.\n\nProýekt: " + root +
                            "\n\nLog: " + GetLogPath(),
                            "Panel",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning);
                    }
                    return;
                }

                Log("Serwer OK — http://localhost:" + HttpPort);
                if (!serverOnly)
                    OpenBrowser();
            }
            catch (Exception ex)
            {
                Log("EXCEPTION: " + ex);
                if (!silent)
                    MessageBox.Show(ex.Message, "Panel ýalňyşlyk", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                if (ownsMutex)
                {
                    try { mutex.ReleaseMutex(); } catch { }
                }
            }
        }

        static void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo { FileName = StartUrl, UseShellExecute = true });
            }
            catch
            {
                try { Process.Start("cmd.exe", "/c start \"\" \"" + StartUrl + "\""); } catch { }
            }
        }

        static string ResolveProjectRoot()
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            var list = new System.Collections.Generic.List<string>();

            // 1) kerwen-root.txt — iň ygtybarly (install ýazýar)
            AddRootFromFile(list, Path.Combine(exeDir, "kerwen-root.txt"));
            // Köne Kerwen gurnama (fallback)
            AddRootFromFile(list, Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "KerwenKadr",
                "kerwen-root.txt"));

            // 2) EXE bilen birlikdäki / ýakyn papkalar
            list.Add(exeDir);
            try
            {
                var parent = Directory.GetParent(exeDir);
                if (parent != null) list.Add(parent.FullName);
            }
            catch { }
            list.Add(Path.Combine(exeDir, ".."));
            list.Add(Path.Combine(exeDir, "..", ".."));

            foreach (var c in list)
            {
                if (string.IsNullOrEmpty(c)) continue;
                try
                {
                    string full = Path.GetFullPath(c);
                    if (File.Exists(Path.Combine(full, "src", "server.js")) &&
                        File.Exists(Path.Combine(full, "package.json")))
                        return full;
                }
                catch { }
            }
            return null;
        }

        static void AddRootFromFile(System.Collections.Generic.List<string> list, string cfg)
        {
            try
            {
                if (!File.Exists(cfg)) return;
                string line = File.ReadAllText(cfg, Encoding.UTF8).Trim().Trim('"');
                if (!string.IsNullOrEmpty(line)) list.Add(line);
            }
            catch { }
        }

        static string FindNode()
        {
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) ?? "";
            string[] paths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(localApp, "Programs", "nodejs", "node.exe"),
            };
            foreach (var p in paths)
            {
                if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
            }

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "where.exe",
                    Arguments = "node",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    CreateNoWindow = true,
                };
                using (var p = Process.Start(psi))
                {
                    string o = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(5000);
                    foreach (var line in (o ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                    {
                        if (File.Exists(line.Trim())) return line.Trim();
                    }
                }
            }
            catch { }
            return null;
        }

        /// <summary>
        /// Node-y aýratyn proses hökmünde başlat (launcher ýapylsa hem galýar).
        /// WorkingDirectory = root → kiril / OneDrive ýoly cmd cd-siz.
        /// </summary>
        static void StartServerDetached(string node, string root)
        {
            string installDir = InstallDir();
            try { Directory.CreateDirectory(installDir); } catch { }
            string logDir = Path.Combine(root, "logs");
            try { Directory.CreateDirectory(logDir); } catch { }

            // LocalAppData-da ASCII runner — diňe node ýolyny ýazýar; cd ýok
            string runner = Path.Combine(installDir, "run-server-hidden.cmd");
            var sb = new StringBuilder();
            sb.AppendLine("@echo off");
            sb.AppendLine("\"" + node + "\" --max-old-space-size=4096 src/server.js >> \"logs\\server-stdout.log\" 2>> \"logs\\server-stderr.log\"");
            File.WriteAllText(runner, sb.ToString(), new UTF8Encoding(true));

            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c start \"KerwenServer\" /b \"" + runner + "\"",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            Process.Start(psi);
            Log("Serwer başlady (detached): " + root);
        }

        static bool WaitForProjectReady(string root, int timeoutMs)
        {
            string serverJs = Path.Combine(root, "src", "server.js");
            string pkg = Path.Combine(root, "package.json");
            int waited = 0;
            while (waited < timeoutMs)
            {
                try
                {
                    if (File.Exists(serverJs) && File.Exists(pkg))
                    {
                        // OneDrive placeholder däl — okap bolýarmy
                        using (var fs = File.Open(serverJs, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        {
                            if (fs.Length > 0) return true;
                        }
                    }
                }
                catch { }
                Thread.Sleep(1000);
                waited += 1000;
            }
            try { return File.Exists(serverJs) && File.Exists(pkg); }
            catch { return false; }
        }

        static int ReadDbPort(string root)
        {
            try
            {
                string envPath = Path.Combine(root, ".env");
                if (File.Exists(envPath))
                {
                    foreach (var line in File.ReadAllLines(envPath, Encoding.UTF8))
                    {
                        string t = (line ?? "").Trim();
                        if (t.StartsWith("#") || t.Length == 0) continue;
                        if (t.StartsWith("DB_PORT=", StringComparison.OrdinalIgnoreCase))
                        {
                            string v = t.Substring("DB_PORT=".Length).Trim().Trim('"').Trim('\'');
                            int p;
                            if (int.TryParse(v, out p) && p > 0) return p;
                        }
                    }
                }
            }
            catch { }
            // Täze PostgreSQL adatça 5432 (köne skript 5433 ýazýardy)
            return 5432;
        }

        static int FindOpenDbPort(string root)
        {
            int preferred = ReadDbPort(root);
            if (preferred > 0 && IsPortOpen(preferred)) return preferred;
            int[] tries = new int[] { preferred, 5432, 5433, 5434, 5435 };
            for (int i = 0; i < tries.Length; i++)
            {
                int p = tries[i];
                if (p > 0 && IsPortOpen(p)) return p;
            }
            return preferred > 0 ? preferred : 5432;
        }

        static bool EnsureServer(string node, string root, int timeoutMs)
        {
            if (IsPortOpen(HttpPort))
            {
                Log("Port eýýäm açyk");
                return true;
            }

            int startedAt = -99999;
            int waited = 0;
            while (waited < timeoutMs)
            {
                if (IsPortOpen(HttpPort))
                {
                    Log("Port açyldy (" + waited + " ms)");
                    return true;
                }

                // Her 12 s-de täzeden synanş (öňki 20s — awtostart haýaldy)
                if (waited - startedAt >= 12000)
                {
                    try
                    {
                        StartServerDetached(node, root);
                        startedAt = waited;
                    }
                    catch (Exception ex)
                    {
                        Log("StartServer ýalňyşlyk: " + ex.Message);
                    }
                }

                Thread.Sleep(1000);
                waited += 1000;
            }
            return IsPortOpen(HttpPort);
        }

        static bool IsPortOpen(int port)
        {
            try
            {
                using (var c = new TcpClient())
                {
                    var ar = c.BeginConnect("127.0.0.1", port, null, null);
                    bool ok = ar.AsyncWaitHandle.WaitOne(400);
                    if (!ok) return false;
                    c.EndConnect(ar);
                    return true;
                }
            }
            catch { return false; }
        }

        static bool WaitForPort(int port, int timeoutMs)
        {
            int waited = 0;
            while (waited < timeoutMs)
            {
                if (IsPortOpen(port)) return true;
                Thread.Sleep(400);
                waited += 400;
            }
            return false;
        }

        /// <summary>
        /// Wi-Fi Public / Firewall ýapylan bolsa — Task Scheduler üsti bilen düzedýär (UAC ýok).
        /// Ilki bir gezek tools\firewall-acyk.bat ýa-da hemishelik-we-ynamly.bat Task döretmeli.
        /// </summary>
        static void TryEnsureLanAccess()
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = "/Run /TN \"KerwenLanAccess\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };
                using (var p = Process.Start(psi))
                {
                    if (p == null) return;
                    p.WaitForExit(8000);
                    Log(p.ExitCode == 0
                        ? "LAN access Task işledi (KerwenLanAccess)"
                        : "LAN access Task ýok/işlemedi — bir gezek tools\\firewall-acyk.bat işlediň");
                }
            }
            catch (Exception ex)
            {
                Log("LAN access: " + ex.Message);
            }
        }

        static void TryStartPostgresServices()
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -Command \"Get-Service -Name '*postgres*','*pgsql*' -EA SilentlyContinue | ForEach-Object { if ($_.StartType -eq 'Disabled') { try { Set-Service $_.Name -StartupType Automatic -EA SilentlyContinue } catch {} }; if ($_.Status -ne 'Running') { try { Start-Service $_.Name -EA Stop; Write-Output ('started '+$_.Name) } catch { Write-Output ('fail '+$_.Name+': '+$_.Exception.Message) } } else { Write-Output ('already '+$_.Name) } }\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };
                using (var p = Process.Start(psi))
                {
                    if (p == null) return;
                    string o = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(12000);
                    if (!string.IsNullOrWhiteSpace(o))
                        Log("Postgres: " + o.Replace("\r", " ").Replace("\n", " ").Trim());
                }
            }
            catch (Exception ex)
            {
                Log("Postgres start synag: " + ex.Message);
            }
        }

        static void LogServerStderr(string root)
        {
            try
            {
                string err = Path.Combine(root, "logs", "server-stderr.log");
                if (!File.Exists(err)) return;
                var lines = File.ReadAllLines(err, Encoding.UTF8);
                int from = Math.Max(0, lines.Length - 12);
                for (int i = from; i < lines.Length; i++)
                {
                    string t = (lines[i] ?? "").Trim();
                    if (t.Length > 0) Log("stderr: " + t);
                }
            }
            catch { }
        }

        static string GetLogPath()
        {
            return Path.Combine(InstallDir(), "launcher.log");
        }

        static void Log(string msg)
        {
            try
            {
                string dir = InstallDir();
                Directory.CreateDirectory(dir);
                File.AppendAllText(
                    Path.Combine(dir, "launcher.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + msg + Environment.NewLine,
                    Encoding.UTF8);
            }
            catch { }
        }
    }
}
