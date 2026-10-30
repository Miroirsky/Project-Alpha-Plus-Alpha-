using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

[assembly: AssemblyTitle("Project Alpha Plus Downloader & Installer")]
[assembly: AssemblyDescription("Standalone Windows Downloader and Setup Wizard for Project Alpha Plus")]
[assembly: AssemblyCompany("Project Alpha Plus Team")]
[assembly: AssemblyProduct("Project Alpha Plus")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace ProjectAlphaPlusInstaller
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool AttachConsole(int dwProcessId);

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | (SecurityProtocolType)12288 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
            }
            catch { }

            // Support headless CLI installation for automated end-to-end verification tests
            if (args != null && args.Length >= 2 && string.Equals(args[0], "--headless-install", StringComparison.OrdinalIgnoreCase))
            {
                try { AttachConsole(-1); } catch { }
                string targetDir = args[1];
                string customShortcutDir = null;
                bool createShortcut = true;

                for (int i = 2; i < args.Length; i++)
                {
                    if (string.Equals(args[i], "--shortcut-dir", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                    {
                        customShortcutDir = args[++i];
                    }
                    else if (string.Equals(args[i], "--no-shortcut", StringComparison.OrdinalIgnoreCase))
                    {
                        createShortcut = false;
                    }
                }

                return RunHeadlessInstall(targetDir, createShortcut, customShortcutDir);
            }

            try
            {
                SetProcessDPIAware();
            }
            catch { }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
            return 0;
        }

        private static int RunHeadlessInstall(string targetDir, bool createShortcut, string customShortcutDir)
        {
            try
            {
                Console.WriteLine("[PAPLUS-Downloader] Starting headless installation to: " + targetDir);
                var engine = new InstallerEngine();
                engine.OnLog += (msg) => Console.WriteLine("[LOG] " + msg);
                engine.OnProgress += (pct, phase, detail) =>
                {
                    if (pct % 20 == 0 || pct == 100)
                    {
                        Console.WriteLine(string.Format("[PROGRESS {0}%] {1} - {2}", pct, phase, detail));
                    }
                };

                engine.InstallAsync(
                    targetDir,
                    createShortcut,
                    false,
                    customShortcutDir,
                    CancellationToken.None
                ).GetAwaiter().GetResult();

                Console.WriteLine("[PAPLUS-Downloader] Headless installation succeeded!");
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[PAPLUS-Downloader] ERROR: " + ex.Message);
                return 1;
            }
        }
    }

    /// <summary>
    /// Core Download, Extraction, Verification, and Shortcut Creation Engine.
    /// </summary>
    internal sealed class InstallerEngine
    {
        public event Action<string> OnLog;
        public event Action<int, string, string> OnProgress;

        // Baked-in fallback workspace paths so PAPLUS-Downloader.exe works even when moved to Downloads folder
        private static readonly string WorkspaceRootFallback = @"G:\AI Projects\Project-Alpha-Plus-Alpha-";

        private void Log(string message)
        {
            if (OnLog != null)
            {
                OnLog(string.Format("[{0:HH:mm:ss}] {1}", DateTime.Now, message));
            }
        }

        private void ReportProgress(int percent, string phase, string detail)
        {
            int clamped = Math.Max(0, Math.Min(100, percent));
            if (OnProgress != null)
            {
                OnProgress(clamped, phase, detail);
            }
        }

        public async Task<string> InstallAsync(
            string installDir,
            bool createDesktopShortcut,
            bool createStartMenuShortcut,
            string overrideDesktopDir,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(installDir))
            {
                throw new ArgumentException("Please select a valid installation folder.");
            }

            installDir = Path.GetFullPath(installDir.Trim());
            Log("Preparing installation directory: " + installDir);
            ReportProgress(2, "Initializing setup...", "Validating target directory & disk space");

            // Pre-check free disk space on the target installation drive (at least 250 MB required)
            string root = Path.GetPathRoot(installDir);
            if (!string.IsNullOrEmpty(root))
            {
                try
                {
                    DriveInfo dInfo = new DriveInfo(root);
                    if (dInfo.IsReady && dInfo.AvailableFreeSpace < 250L * 1024 * 1024)
                    {
                        throw new IOException(string.Format(
                            "Insufficient free disk space on drive {0}. Project Alpha Plus requires at least 250 MB free, but only {1:0.0} MB is available. Please select a different installation drive with more free space.",
                            root,
                            dInfo.AvailableFreeSpace / (1024.0 * 1024.0)
                        ));
                    }
                }
                catch (IOException) { throw; }
                catch { }
            }

            try
            {
                if (!Directory.Exists(installDir))
                {
                    Directory.CreateDirectory(installDir);
                }

                // Verify write permissions
                string probeFile = Path.Combine(installDir, ".paplus_write_test.tmp");
                File.WriteAllText(probeFile, "ok");
                File.Delete(probeFile);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Cannot write to installation folder '" + installDir + "': " + ex.Message);
            }

            ct.ThrowIfCancellationRequested();

            // Select staging directory that has sufficient disk space
            string tempBaseDir = Path.GetTempPath();
            try
            {
                DriveInfo targetDrive = new DriveInfo(root);
                DriveInfo sysTempDrive = new DriveInfo(Path.GetPathRoot(tempBaseDir));
                if (targetDrive.IsReady && sysTempDrive.IsReady && targetDrive.AvailableFreeSpace > sysTempDrive.AvailableFreeSpace)
                {
                    tempBaseDir = Path.Combine(installDir, ".paplus_setup_staging");
                }
            }
            catch { }

            string tempWorkDir = Path.Combine(tempBaseDir, "PAPLUS_Setup_" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(tempWorkDir);
            string stagedZipPath = Path.Combine(tempWorkDir, "ProjectAlphaPlus-Win64.zip");

            try
            {
                // Phase 1: Download / Stream Game Package (0% -> 50%)
                string packageZipPath = await AcquireGamePackageAsync(stagedZipPath, ct);

                ct.ThrowIfCancellationRequested();

                // Phase 2: Extract & Install Game Files (50% -> 94%)
                if (!string.IsNullOrEmpty(packageZipPath) && File.Exists(packageZipPath))
                {
                    await ExtractZipPackageWithProgressAsync(packageZipPath, installDir, ct);
                }
                else
                {
                    string unpackedSource = FindUnpackedSourceDirectory();
                    if (string.IsNullOrEmpty(unpackedSource))
                    {
                        throw new FileNotFoundException(
                            "Could not download or locate the Project Alpha Plus game package archive (ProjectAlphaPlus-Win64.zip).\n\n" +
                            "To fix this:\n" +
                            "1. Ensure 'ProjectAlphaPlus-Win64.zip' is published on GitHub Releases:\n" +
                            "   https://github.com/Miroirsky/Project-Alpha-Plus-Alpha-/releases\n" +
                            "2. Or place 'ProjectAlphaPlus-Win64.zip' in the same folder as PAPLUS-Downloader.exe for offline installation."
                        );
                    }
                    await CopyUnpackedBuildWithProgressAsync(unpackedSource, installDir, ct);
                }

                ct.ThrowIfCancellationRequested();

                // Check if Project Alpha Plus.exe was extracted directly or into a subfolder
                string installedExe = Path.Combine(installDir, "Project Alpha Plus.exe");
                if (!File.Exists(installedExe))
                {
                    // Check subdirectories in case the archive had an inner folder (e.g. win-unpacked/)
                    string[] candidateExes = Directory.GetFiles(installDir, "Project Alpha Plus.exe", SearchOption.AllDirectories);
                    if (candidateExes != null && candidateExes.Length > 0)
                    {
                        string innerDir = Path.GetDirectoryName(candidateExes[0]);
                        if (!string.Equals(innerDir, installDir, StringComparison.OrdinalIgnoreCase))
                        {
                            Log("Moving game files from nested folder to install root: " + innerDir);
                            MoveDirectoryContents(innerDir, installDir);
                        }
                    }
                }

                string installedAsar = Path.Combine(installDir, "resources", "app.asar");

                if (!File.Exists(installedExe))
                {
                    BuildStandaloneDesktopLauncher(installDir, installedExe);
                }

                if (!File.Exists(installedExe))
                {
                    throw new FileNotFoundException(
                        "Installation verification failed: 'Project Alpha Plus.exe' was not found in " + installDir + ".\n\n" +
                        "The downloaded package did not contain the standalone game executable. " +
                        "Please verify that 'ProjectAlphaPlus-Win64.zip' published on GitHub Releases contains the compiled Electron application."
                    );
                }

                FileInfo exeInfo = new FileInfo(installedExe);
                if (exeInfo.Length < 4096)
                {
                    throw new InvalidDataException("Installed executable appears incomplete or corrupted.");
                }

                Log(string.Format("Verified standalone executable: Project Alpha Plus.exe ({0:0.0} MB)", exeInfo.Length / (1024.0 * 1024.0)));
                if (File.Exists(installedAsar))
                {
                    FileInfo asarInfo = new FileInfo(installedAsar);
                    Log(string.Format("Verified game package archive: resources\\app.asar ({0:0.0} MB)", asarInfo.Length / (1024.0 * 1024.0)));
                }

                // Write installation manifest
                string manifestPath = Path.Combine(installDir, "install-manifest.json");
                string manifestJson = string.Format(
                    "{{\n  \"productName\": \"Project Alpha Plus\",\n  \"version\": \"1.0.0\",\n  \"installedAt\": \"{0:O}\",\n  \"installDir\": \"{1}\",\n  \"executable\": \"{2}\"\n}}",
                    DateTime.UtcNow,
                    installDir.Replace("\\", "\\\\"),
                    installedExe.Replace("\\", "\\\\")
                );
                File.WriteAllText(manifestPath, manifestJson);

                // Phase 3: Create Shortcuts (95% -> 100%)
                ReportProgress(96, "Creating shortcuts...", "Configuring Windows shortcuts");

                if (createDesktopShortcut)
                {
                    string desktopDir = !string.IsNullOrEmpty(overrideDesktopDir)
                        ? overrideDesktopDir
                        : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

                    if (!string.IsNullOrEmpty(desktopDir))
                    {
                        if (!Directory.Exists(desktopDir))
                        {
                            Directory.CreateDirectory(desktopDir);
                        }
                        string shortcutPath = Path.Combine(desktopDir, "Project Alpha Plus.lnk");
                        CreateWindowsShortcut(shortcutPath, installedExe, installDir, "Project Alpha Plus - Precision Rhythm Arcade Game");
                        Log("Created Desktop shortcut: " + shortcutPath);
                    }
                }

                if (createStartMenuShortcut)
                {
                    try
                    {
                        string programsDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                        if (!string.IsNullOrEmpty(programsDir) && Directory.Exists(programsDir))
                        {
                            string startShortcut = Path.Combine(programsDir, "Project Alpha Plus.lnk");
                            CreateWindowsShortcut(startShortcut, installedExe, installDir, "Project Alpha Plus - Precision Rhythm Arcade Game");
                            Log("Created Start Menu shortcut: " + startShortcut);
                        }
                    }
                    catch (Exception smEx)
                    {
                        Log("Note: Start Menu shortcut skipped (" + smEx.Message + ")");
                    }
                }

                ReportProgress(100, "Installation Complete!", "Project Alpha Plus is ready to launch.");
                Log("✓ Project Alpha Plus v1.0.0 installed successfully!");
                return installedExe;
            }
            finally
            {
                try
                {
                    if (Directory.Exists(tempWorkDir))
                    {
                        Directory.Delete(tempWorkDir, true);
                    }
                }
                catch { }
            }
        }

        private async Task<string> AcquireGamePackageAsync(string destinationZipPath, CancellationToken ct)
        {
            // 1. Check candidate HTTP URLs (custom env URL or local distribution server)
            var candidateUrls = new List<string>();
            string envUrl = Environment.GetEnvironmentVariable("PAPLUS_PACKAGE_URL");
            if (!string.IsNullOrWhiteSpace(envUrl))
            {
                candidateUrls.Add(envUrl.Trim());
            }
            candidateUrls.Add("http://127.0.0.1:8080/download/ProjectAlphaPlus-Win64.zip");
            candidateUrls.Add("http://localhost:8080/download/ProjectAlphaPlus-Win64.zip");

            foreach (string url in candidateUrls)
            {
                if (await TryDownloadFromHttpAsync(url, destinationZipPath, ct))
                {
                    return destinationZipPath;
                }
            }

            // 2. Check local package zip candidates (adjacent to downloader, in dist/, working directory, or workspace root)
            string localZipSource = FindLocalZipPackage();
            if (!string.IsNullOrEmpty(localZipSource) && File.Exists(localZipSource))
            {
                Log("Using local repository package archive directly: " + Path.GetFileName(localZipSource));
                ReportProgress(50, "Verified game package...", "Local package archive ready");
                return localZipSource;
            }

            // 3. Local unpacked directory (if present on disk, Phase 2 copies it directly)
            string unpacked = FindUnpackedSourceDirectory();
            if (!string.IsNullOrEmpty(unpacked))
            {
                Log("Found local standalone build package at: " + unpacked);
                ReportProgress(45, "Downloading game package...", "Verified local standalone build assets");
                await Task.Delay(120, ct);
                return null;
            }

            // 4. Remote GitHub Cloud Distribution (works when PAPLUS-Downloader.exe is downloaded from GitHub Pages onto any PC)
            var remoteCloudUrls = new List<string>
            {
                "https://github.com/Miroirsky/Project-Alpha-Plus-Alpha-/releases/latest/download/ProjectAlphaPlus-Win64.zip",
                "https://github.com/Miroirsky/Project-Alpha-Plus-Alpha-/releases/download/v1.0.0/ProjectAlphaPlus-Win64.zip",
                "https://github.com/Miroirsky/Project-Alpha-Plus-Alpha-/releases/download/1.0.0/ProjectAlphaPlus-Win64.zip"
            };

            foreach (string cloudUrl in remoteCloudUrls)
            {
                Log("Connecting to GitHub distribution server: " + cloudUrl);
                if (await TryDownloadFromHttpAsync(cloudUrl, destinationZipPath, ct))
                {
                    return destinationZipPath;
                }
            }

            return null;
        }

        private static void MoveDirectoryContents(string sourceDir, string targetDir)
        {
            try
            {
                foreach (string file in Directory.GetFiles(sourceDir))
                {
                    string dest = Path.Combine(targetDir, Path.GetFileName(file));
                    if (File.Exists(dest))
                    {
                        try { File.Delete(dest); } catch { }
                    }
                    File.Move(file, dest);
                }
                foreach (string subDir in Directory.GetDirectories(sourceDir))
                {
                    string destSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
                    if (!Directory.Exists(destSubDir))
                    {
                        Directory.CreateDirectory(destSubDir);
                    }
                    MoveDirectoryContents(subDir, destSubDir);
                }
                try { Directory.Delete(sourceDir, true); } catch { }
            }
            catch { }
        }

        private async Task<bool> TryDownloadFromHttpAsync(string url, string destinationFile, CancellationToken ct)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "GET";
                req.UserAgent = "PAPLUS-Downloader/1.0";
                req.AllowAutoRedirect = true;
                bool isLocal = url.IndexOf("127.0.0.1", StringComparison.OrdinalIgnoreCase) >= 0 ||
                               url.IndexOf("localhost", StringComparison.OrdinalIgnoreCase) >= 0;
                req.Timeout = isLocal ? 2500 : 15000;
                req.ReadWriteTimeout = 60000;

                using (WebResponse resp = await req.GetResponseAsync())
                {
                    HttpWebResponse httpResp = resp as HttpWebResponse;
                    if (httpResp != null && httpResp.StatusCode != HttpStatusCode.OK)
                    {
                        return false;
                    }

                    long totalBytes = resp.ContentLength;
                    Log(string.Format("Connected to distribution server ({0})", url));

                    using (Stream netStream = resp.GetResponseStream())
                    using (FileStream outStream = new FileStream(destinationFile, FileMode.Create, FileAccess.Write, FileShare.None, 262144, true))
                    {
                        byte[] buffer = new byte[262144];
                        long received = 0;
                        Stopwatch sw = Stopwatch.StartNew();
                        long lastReportMs = 0;

                        int read;
                        while ((read = await netStream.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
                        {
                            ct.ThrowIfCancellationRequested();
                            await outStream.WriteAsync(buffer, 0, read, ct);
                            received += read;

                            if (sw.ElapsedMilliseconds - lastReportMs >= 60 || received == totalBytes)
                            {
                                lastReportMs = sw.ElapsedMilliseconds;
                                double mbReceived = received / (1024.0 * 1024.0);
                                double sec = Math.Max(0.1, sw.Elapsed.TotalSeconds);
                                double speedMb = mbReceived / sec;

                                if (totalBytes > 0)
                                {
                                    double ratio = (double)received / totalBytes;
                                    int pct = 4 + (int)Math.Round(ratio * 46.0);
                                    double mbTotal = totalBytes / (1024.0 * 1024.0);
                                    ReportProgress(
                                        pct,
                                        "Downloading game package...",
                                        string.Format("{0:0.0} MB / {1:0.0} MB ({2:0.0} MB/s)", mbReceived, mbTotal, speedMb)
                                    );
                                }
                                else
                                {
                                    ReportProgress(25, "Downloading game package...", string.Format("{0:0.0} MB downloaded ({1:0.0} MB/s)", mbReceived, speedMb));
                                }
                            }
                        }
                    }

                    FileInfo fi = new FileInfo(destinationFile);
                    if (!fi.Exists || fi.Length < 1024)
                    {
                        try { File.Delete(destinationFile); } catch { }
                        return false;
                    }

                    Log("Package download completed from server.");
                    return true;
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch
            {
                try { if (File.Exists(destinationFile)) File.Delete(destinationFile); } catch { }
                return false;
            }
        }

        private async Task StreamFileWithProgressAsync(
            string sourcePath,
            string destPath,
            int startPct,
            int endPct,
            string phaseTitle,
            CancellationToken ct)
        {
            FileInfo fi = new FileInfo(sourcePath);
            long totalBytes = Math.Max(1L, fi.Length);
            long copied = 0;
            Stopwatch sw = Stopwatch.StartNew();
            long lastReportMs = 0;

            using (FileStream src = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, 262144, true))
            using (FileStream dst = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None, 262144, true))
            {
                byte[] buffer = new byte[262144];
                int read;
                while ((read = await src.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
                {
                    ct.ThrowIfCancellationRequested();
                    await dst.WriteAsync(buffer, 0, read, ct);
                    copied += read;

                    if (sw.ElapsedMilliseconds - lastReportMs >= 40 || copied == totalBytes)
                    {
                        lastReportMs = sw.ElapsedMilliseconds;
                        double ratio = (double)copied / totalBytes;
                        int pct = startPct + (int)Math.Round(ratio * (endPct - startPct));
                        double mbCopied = copied / (1024.0 * 1024.0);
                        double mbTotal = totalBytes / (1024.0 * 1024.0);
                        double speed = mbCopied / Math.Max(0.05, sw.Elapsed.TotalSeconds);
                        ReportProgress(
                            pct,
                            phaseTitle,
                            string.Format("{0:0.0} MB / {1:0.0} MB ({2:0.0} MB/s)", mbCopied, mbTotal, speed)
                        );
                    }
                }
            }
        }

        private async Task ExtractZipPackageWithProgressAsync(string zipPath, string installDir, CancellationToken ct)
        {
            Log("Extracting game files into: " + installDir);
            await Task.Run(() =>
            {
                using (ZipArchive archive = ZipFile.OpenRead(zipPath))
                {
                    int totalEntries = Math.Max(1, archive.Entries.Count);
                    int processed = 0;

                    // Detect if the zip has a single top-level root folder (e.g. GitHub repo zip "Project-Alpha-Plus-Alpha--main/")
                    string commonRootPrefix = null;
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        string norm = entry.FullName.Replace('\\', '/').TrimStart('/');
                        int slashIdx = norm.IndexOf('/');
                        if (slashIdx <= 0)
                        {
                            commonRootPrefix = null;
                            break;
                        }
                        string prefix = norm.Substring(0, slashIdx + 1);
                        if (commonRootPrefix == null)
                        {
                            commonRootPrefix = prefix;
                        }
                        else if (!string.Equals(commonRootPrefix, prefix, StringComparison.OrdinalIgnoreCase))
                        {
                            commonRootPrefix = null;
                            break;
                        }
                    }

                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        ct.ThrowIfCancellationRequested();
                        processed++;

                        string rawEntryPath = entry.FullName.Replace('\\', '/').TrimStart('/');
                        if (!string.IsNullOrEmpty(commonRootPrefix) && rawEntryPath.StartsWith(commonRootPrefix, StringComparison.OrdinalIgnoreCase))
                        {
                            rawEntryPath = rawEntryPath.Substring(commonRootPrefix.Length);
                        }

                        string relPath = rawEntryPath.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
                        if (string.IsNullOrEmpty(relPath)) continue;

                        string destFile = Path.GetFullPath(Path.Combine(installDir, relPath));
                        if (!destFile.StartsWith(installDir, StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        // Directory entry
                        if (string.IsNullOrEmpty(entry.Name) && entry.FullName.EndsWith("/"))
                        {
                            if (!Directory.Exists(destFile))
                            {
                                Directory.CreateDirectory(destFile);
                            }
                            continue;
                        }

                        string parentDir = Path.GetDirectoryName(destFile);
                        if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
                        {
                            Directory.CreateDirectory(parentDir);
                        }

                        entry.ExtractToFile(destFile, true);

                        int pct = 50 + (int)Math.Round(((double)processed / totalEntries) * 44.0);
                        ReportProgress(
                            pct,
                            "Installing game files...",
                            string.Format("Extracting ({0}/{1}): {2}", processed, totalEntries, entry.Name)
                        );
                    }
                }
            }, ct);
            Log("All package files extracted and verified.");
        }

        private void BuildStandaloneDesktopLauncher(string installDir, string outputExePath)
        {
            Log("Compiling native standalone desktop executable: Project Alpha Plus.exe");
            ReportProgress(94, "Building desktop launcher...", "Generating Project Alpha Plus.exe");

            string cscPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Microsoft.NET\Framework64\v4.0.30319\csc.exe");
            if (!File.Exists(cscPath))
            {
                cscPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"Microsoft.NET\Framework\v4.0.30319\csc.exe");
            }

            string launcherSourcePath = Path.Combine(installDir, "_launcher_build.cs");
            string launcherCode = @"using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle(""Project Alpha Plus"")]
[assembly: System.Reflection.AssemblyProduct(""Project Alpha Plus"")]
[assembly: System.Reflection.AssemblyVersion(""1.0.0.0"")]

internal static class LauncherProgram
{
    [STAThread]
    private static void Main()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string indexHtml = Path.Combine(baseDir, ""index.html"");
        if (!File.Exists(indexHtml))
        {
            MessageBox.Show(""Could not find index.html in "" + baseDir, ""Project Alpha Plus"", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        string fileUri = new Uri(indexHtml).AbsoluteUri + ""?env=electron"";
        string[] browserCandidates = new string[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @""Microsoft\Edge\Application\msedge.exe""),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @""Microsoft\Edge\Application\msedge.exe""),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @""Google\Chrome\Application\chrome.exe""),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @""Google\Chrome\Application\chrome.exe"")
        };

        foreach (string browser in browserCandidates)
        {
            if (File.Exists(browser))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = browser,
                    Arguments = ""--app=\"" + fileUri + ""\"" --window-size=1366,840 --disable-features=Translate"",
                    UseShellExecute = false
                });
                return;
            }
        }

        Process.Start(new ProcessStartInfo { FileName = fileUri, UseShellExecute = true });
    }
}";
            try
            {
                File.WriteAllText(launcherSourcePath, launcherCode);
                var psi = new ProcessStartInfo
                {
                    FileName = cscPath,
                    Arguments = string.Format("/target:winexe /optimize+ /out:\"{0}\" /r:System.dll /r:System.Windows.Forms.dll \"{1}\"", outputExePath, launcherSourcePath),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit(15000);
                }
            }
            finally
            {
                try { if (File.Exists(launcherSourcePath)) File.Delete(launcherSourcePath); } catch { }
            }
        }

        private async Task CopyUnpackedBuildWithProgressAsync(string sourceDir, string installDir, CancellationToken ct)
        {
            Log("Installing standalone build files from: " + sourceDir);

            // Avoid self-copy corruption if source and destination are the same folder
            if (string.Equals(Path.GetFullPath(sourceDir).TrimEnd('\\'), Path.GetFullPath(installDir).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase))
            {
                Log("Installation directory matches source build directory; skipping self-copy.");
                ReportProgress(90, "Installing standalone game files...", "Verified build files in place");
                return;
            }

            string[] allFiles = Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories);
            long totalBytes = 0;
            foreach (string f in allFiles)
            {
                try { totalBytes += new FileInfo(f).Length; } catch { }
            }
            totalBytes = Math.Max(1L, totalBytes);

            long copiedBytes = 0;
            int fileIndex = 0;
            int totalFiles = Math.Max(1, allFiles.Length);
            byte[] buffer = new byte[262144];
            Stopwatch sw = Stopwatch.StartNew();
            long lastReportMs = 0;

            foreach (string srcFile in allFiles)
            {
                ct.ThrowIfCancellationRequested();
                fileIndex++;

                string relPath = srcFile.Substring(sourceDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string dstFile = Path.Combine(installDir, relPath);
                string parentDir = Path.GetDirectoryName(dstFile);
                if (!string.IsNullOrEmpty(parentDir) && !Directory.Exists(parentDir))
                {
                    Directory.CreateDirectory(parentDir);
                }

                if (File.Exists(dstFile))
                {
                    try { File.SetAttributes(dstFile, FileAttributes.Normal); } catch { }
                }

                using (FileStream src = new FileStream(srcFile, FileMode.Open, FileAccess.Read, FileShare.Read, 262144, true))
                using (FileStream dst = new FileStream(dstFile, FileMode.Create, FileAccess.Write, FileShare.None, 262144, true))
                {
                    int read;
                    while ((read = await src.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
                    {
                        ct.ThrowIfCancellationRequested();
                        await dst.WriteAsync(buffer, 0, read, ct);
                        copiedBytes += read;

                        if (sw.ElapsedMilliseconds - lastReportMs >= 60 || copiedBytes == totalBytes)
                        {
                            lastReportMs = sw.ElapsedMilliseconds;
                            double ratio = (double)copiedBytes / totalBytes;
                            int pct = 45 + (int)Math.Round(ratio * 49.0);
                            ReportProgress(
                                pct,
                                "Installing standalone game files...",
                                string.Format("Installing ({0}/{1}): {2} ({3:0.0} MB / {4:0.0} MB)",
                                    fileIndex,
                                    totalFiles,
                                    Path.GetFileName(srcFile),
                                    copiedBytes / (1024.0 * 1024.0),
                                    totalBytes / (1024.0 * 1024.0))
                            );
                        }
                    }
                }
            }

            Log(string.Format("Installed {0} standalone application files ({1:0.0} MB).", totalFiles, copiedBytes / (1024.0 * 1024.0)));
        }

        private static string FindLocalZipPackage()
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string curDir = Environment.CurrentDirectory;
            string[] candidates = new string[]
            {
                Path.Combine(exeDir, "ProjectAlphaPlus-Win64.zip"),
                Path.Combine(exeDir, "dist", "ProjectAlphaPlus-Win64.zip"),
                Path.Combine(exeDir, "..", "dist", "ProjectAlphaPlus-Win64.zip"),
                Path.Combine(curDir, "ProjectAlphaPlus-Win64.zip"),
                Path.Combine(curDir, "dist", "ProjectAlphaPlus-Win64.zip"),
                Path.Combine(WorkspaceRootFallback, "dist", "ProjectAlphaPlus-Win64.zip"),
                Path.Combine(WorkspaceRootFallback, "ProjectAlphaPlus-Win64.zip")
            };

            foreach (string candidate in candidates)
            {
                try
                {
                    string full = Path.GetFullPath(candidate);
                    if (File.Exists(full) && new FileInfo(full).Length > 1024 * 1024)
                    {
                        return full;
                    }
                }
                catch { }
            }
            return null;
        }

        private static string FindUnpackedSourceDirectory()
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string curDir = Environment.CurrentDirectory;
            string[] candidates = new string[]
            {
                Path.Combine(exeDir, "dist", "win-unpacked"),
                Path.Combine(exeDir, "win-unpacked"),
                Path.Combine(exeDir, "..", "dist", "win-unpacked"),
                Path.Combine(curDir, "dist", "win-unpacked"),
                Path.Combine(curDir, "win-unpacked"),
                Path.Combine(WorkspaceRootFallback, "dist", "win-unpacked")
            };

            foreach (string candidate in candidates)
            {
                try
                {
                    string full = Path.GetFullPath(candidate);
                    if (Directory.Exists(full) && File.Exists(Path.Combine(full, "Project Alpha Plus.exe")))
                    {
                        return full;
                    }
                }
                catch { }
            }
            return null;
        }

        public static void CreateWindowsShortcut(string shortcutFilePath, string targetExePath, string workingDirectory, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null)
            {
                throw new InvalidOperationException("WScript.Shell COM automation is unavailable on this system.");
            }

            object shell = Activator.CreateInstance(shellType);
            try
            {
                object shortcut = shellType.InvokeMember(
                    "CreateShortcut",
                    BindingFlags.InvokeMethod,
                    null,
                    shell,
                    new object[] { shortcutFilePath }
                );

                Type shortcutType = shortcut.GetType();
                shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetExePath });
                shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
                shortcutType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { targetExePath + ",0" });
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally
            {
                if (Marshal.IsComObject(shell))
                {
                    Marshal.ReleaseComObject(shell);
                }
            }
        }
    }

    /// <summary>
    /// Native Windows Forms GUI for PAPLUS-Downloader.exe.
    /// </summary>
    internal sealed class InstallerForm : Form
    {
        private readonly Color BgEspresso = Color.FromArgb(30, 20, 13);
        private readonly Color SurfaceCard = Color.FromArgb(46, 31, 20);
        private readonly Color AccentTerracotta = Color.FromArgb(149, 65, 50);
        private readonly Color AccentTerracottaHover = Color.FromArgb(172, 78, 61);
        private readonly Color TextCream = Color.FromArgb(250, 227, 227);
        private readonly Color TextPeach = Color.FromArgb(247, 212, 188);
        private readonly Color BorderWarm = Color.FromArgb(92, 61, 42);
        private readonly Color GreenSuccess = Color.FromArgb(46, 213, 115);

        private TextBox txtInstallPath;
        private Button btnBrowse;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchOnExit;
        private Label lblPhaseStatus;
        private Label lblProgressDetail;
        private Panel progressTrack;
        private Panel progressFill;
        private TextBox txtLog;
        private Button btnInstall;
        private Button btnOpenFolder;
        private Button btnCancel;

        private CancellationTokenSource cts;
        private bool isInstalling = false;
        private bool isCompleted = false;
        private string installedExePath = null;
        private int currentProgressPct = 0;

        public InstallerForm()
        {
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = "Project Alpha Plus — Setup & Downloader (PAPLUS-Downloader)";
            this.ClientSize = new Size(650, 540);
            this.FormBorderStyle = FormBorderStyle.FixedSingle;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = BgEspresso;
            this.ForeColor = TextCream;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            try
            {
                this.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch { }

            // 1. Header Banner Panel
            Panel headerPanel = new Panel
            {
                Dock = DockStyle.Top,
                Height = 96,
                BackColor = AccentTerracotta
            };
            headerPanel.Paint += (s, e) =>
            {
                using (LinearGradientBrush brush = new LinearGradientBrush(
                    headerPanel.ClientRectangle,
                    Color.FromArgb(158, 70, 54),
                    Color.FromArgb(118, 48, 36),
                    LinearGradientMode.Horizontal))
                {
                    e.Graphics.FillRectangle(brush, headerPanel.ClientRectangle);
                }
                using (Pen bottomPen = new Pen(TextPeach, 2f))
                {
                    e.Graphics.DrawLine(bottomPen, 0, headerPanel.Height - 1, headerPanel.Width, headerPanel.Height - 1);
                }
            };

            Label lblBadge = new Label
            {
                Text = "OFFICIAL WINDOWS 64-BIT STANDALONE INSTALLER",
                Font = new Font("Consolas", 8.2f, FontStyle.Bold),
                ForeColor = TextPeach,
                BackColor = Color.Transparent,
                Location = new Point(24, 16),
                AutoSize = true
            };

            Label lblTitle = new Label
            {
                Text = "Project Alpha Plus",
                Font = new Font("Segoe UI", 19f, FontStyle.Bold),
                ForeColor = TextCream,
                BackColor = Color.Transparent,
                Location = new Point(21, 34),
                AutoSize = true
            };

            Label lblSub = new Label
            {
                Text = "Precision Rhythm Arcade & Visual Beatmap Studio • v1.0.0",
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                ForeColor = TextPeach,
                BackColor = Color.Transparent,
                Location = new Point(24, 68),
                AutoSize = true
            };

            headerPanel.Controls.Add(lblBadge);
            headerPanel.Controls.Add(lblTitle);
            headerPanel.Controls.Add(lblSub);
            this.Controls.Add(headerPanel);

            // 2. Installation Directory Section
            Label lblFolderHeader = new Label
            {
                Text = "1. CHOOSE INSTALLATION FOLDER",
                Font = new Font("Consolas", 8.5f, FontStyle.Bold),
                ForeColor = TextPeach,
                Location = new Point(24, 114),
                AutoSize = true
            };
            this.Controls.Add(lblFolderHeader);

            string defaultDir = GetSmartDefaultInstallDir();

            txtInstallPath = new TextBox
            {
                Text = defaultDir,
                Location = new Point(24, 136),
                Size = new Size(492, 28),
                BackColor = SurfaceCard,
                ForeColor = TextCream,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Consolas", 9.5f, FontStyle.Regular)
            };
            this.Controls.Add(txtInstallPath);

            btnBrowse = new Button
            {
                Text = "Browse...",
                Location = new Point(526, 134),
                Size = new Size(100, 29),
                FlatStyle = FlatStyle.Flat,
                BackColor = SurfaceCard,
                ForeColor = TextPeach,
                Cursor = Cursors.Hand,
                Font = new Font("Segoe UI", 9f, FontStyle.Bold)
            };
            btnBrowse.FlatAppearance.BorderColor = BorderWarm;
            btnBrowse.Click += OnBrowseClicked;
            this.Controls.Add(btnBrowse);

            // 3. Shortcut & Post-Install Options
            Label lblOptionsHeader = new Label
            {
                Text = "2. SHORTCUT & LAUNCH OPTIONS",
                Font = new Font("Consolas", 8.5f, FontStyle.Bold),
                ForeColor = TextPeach,
                Location = new Point(24, 178),
                AutoSize = true
            };
            this.Controls.Add(lblOptionsHeader);

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create a Desktop shortcut (Project Alpha Plus.lnk)",
                Checked = true,
                Location = new Point(26, 200),
                AutoSize = true,
                ForeColor = TextCream,
                Cursor = Cursors.Hand
            };
            this.Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox
            {
                Text = "Create a Start Menu shortcut",
                Checked = true,
                Location = new Point(365, 200),
                AutoSize = true,
                ForeColor = TextCream,
                Cursor = Cursors.Hand
            };
            this.Controls.Add(chkStartMenuShortcut);

            chkLaunchOnExit = new CheckBox
            {
                Text = "Launch Project Alpha Plus immediately after installation completes",
                Checked = true,
                Location = new Point(26, 226),
                AutoSize = true,
                ForeColor = TextPeach,
                Cursor = Cursors.Hand
            };
            this.Controls.Add(chkLaunchOnExit);

            // 4. Download & Installation Progress Section
            Label lblProgressHeader = new Label
            {
                Text = "3. DOWNLOAD & INSTALLATION PROGRESS",
                Font = new Font("Consolas", 8.5f, FontStyle.Bold),
                ForeColor = TextPeach,
                Location = new Point(24, 262),
                AutoSize = true
            };
            this.Controls.Add(lblProgressHeader);

            lblPhaseStatus = new Label
            {
                Text = "Ready to download and install Project Alpha Plus.",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = TextCream,
                Location = new Point(24, 282),
                Size = new Size(602, 20)
            };
            this.Controls.Add(lblPhaseStatus);

            lblProgressDetail = new Label
            {
                Text = "Click 'Download & Install' below to begin.",
                Font = new Font("Consolas", 8.5f, FontStyle.Regular),
                ForeColor = TextPeach,
                Location = new Point(24, 304),
                Size = new Size(602, 18)
            };
            this.Controls.Add(lblProgressDetail);

            progressTrack = new Panel
            {
                Location = new Point(24, 326),
                Size = new Size(602, 22),
                BackColor = SurfaceCard,
                BorderStyle = BorderStyle.FixedSingle
            };

            progressFill = new Panel
            {
                Location = new Point(0, 0),
                Size = new Size(0, 20),
                BackColor = AccentTerracotta
            };
            progressTrack.Controls.Add(progressFill);
            this.Controls.Add(progressTrack);

            txtLog = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Vertical,
                Location = new Point(24, 358),
                Size = new Size(602, 112),
                BackColor = Color.FromArgb(20, 13, 8),
                ForeColor = TextPeach,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Consolas", 8.2f, FontStyle.Regular)
            };
            this.Controls.Add(txtLog);

            AppendLog("Project Alpha Plus Setup Wizard initialized.");
            AppendLog("Target OS: " + Environment.OSVersion.VersionString + " (64-bit: " + Environment.Is64BitOperatingSystem + ")");

            // 5. Bottom Action Buttons
            btnInstall = new Button
            {
                Text = "Download && Install",
                Location = new Point(24, 484),
                Size = new Size(220, 40),
                FlatStyle = FlatStyle.Flat,
                BackColor = AccentTerracotta,
                ForeColor = TextCream,
                Cursor = Cursors.Hand,
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold)
            };
            btnInstall.FlatAppearance.BorderColor = TextPeach;
            btnInstall.FlatAppearance.BorderSize = 1;
            btnInstall.Click += OnInstallOrLaunchClicked;
            this.Controls.Add(btnInstall);

            btnOpenFolder = new Button
            {
                Text = "Open Install Folder",
                Location = new Point(256, 484),
                Size = new Size(160, 40),
                FlatStyle = FlatStyle.Flat,
                BackColor = SurfaceCard,
                ForeColor = TextPeach,
                Cursor = Cursors.Hand,
                Enabled = false,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold)
            };
            btnOpenFolder.FlatAppearance.BorderColor = BorderWarm;
            btnOpenFolder.Click += OnOpenFolderClicked;
            this.Controls.Add(btnOpenFolder);

            btnCancel = new Button
            {
                Text = "Exit",
                Location = new Point(516, 484),
                Size = new Size(110, 40),
                FlatStyle = FlatStyle.Flat,
                BackColor = SurfaceCard,
                ForeColor = TextCream,
                Cursor = Cursors.Hand,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular)
            };
            btnCancel.FlatAppearance.BorderColor = BorderWarm;
            btnCancel.Click += OnCancelClicked;
            this.Controls.Add(btnCancel);
        }

        private void AppendLog(string line)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(AppendLog), line);
                return;
            }
            if (txtLog.TextLength > 0)
            {
                txtLog.AppendText(Environment.NewLine);
            }
            txtLog.AppendText(line);
        }

        private void UpdateProgressUI(int pct, string phase, string detail)
        {
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<int, string, string>(UpdateProgressUI), pct, phase, detail);
                return;
            }

            currentProgressPct = Math.Max(0, Math.Min(100, pct));
            lblPhaseStatus.Text = string.Format("{0} ({1}%)", phase, currentProgressPct);
            lblProgressDetail.Text = detail;

            int trackW = Math.Max(0, progressTrack.ClientSize.Width);
            int fillW = (int)Math.Round((currentProgressPct / 100.0) * trackW);
            progressFill.Width = fillW;
            progressFill.BackColor = currentProgressPct >= 100 ? GreenSuccess : AccentTerracottaHover;
        }

        private void OnBrowseClicked(object sender, EventArgs e)
        {
            if (isInstalling) return;

            using (FolderBrowserDialog fbd = new FolderBrowserDialog())
            {
                fbd.Description = "Select the folder where Project Alpha Plus should be installed:";
                fbd.SelectedPath = txtInstallPath.Text;
                fbd.ShowNewFolderButton = true;

                if (fbd.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(fbd.SelectedPath))
                {
                    string chosen = fbd.SelectedPath;
                    if (!chosen.EndsWith("Project Alpha Plus", StringComparison.OrdinalIgnoreCase))
                    {
                        chosen = Path.Combine(chosen, "Project Alpha Plus");
                    }
                    txtInstallPath.Text = chosen;
                    AppendLog("Selected installation folder: " + chosen);
                }
            }
        }

        private async void OnInstallOrLaunchClicked(object sender, EventArgs e)
        {
            if (isCompleted && !string.IsNullOrEmpty(installedExePath) && File.Exists(installedExePath))
            {
                LaunchInstalledGame();
                return;
            }

            if (isInstalling) return;

            string targetDir = txtInstallPath.Text.Trim();
            if (string.IsNullOrEmpty(targetDir))
            {
                MessageBox.Show(this, "Please choose a valid installation directory.", "Installation Folder Required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            isInstalling = true;
            txtInstallPath.ReadOnly = true;
            btnBrowse.Enabled = false;
            chkDesktopShortcut.Enabled = false;
            chkStartMenuShortcut.Enabled = false;
            btnInstall.Enabled = false;
            btnInstall.Text = "Installing...";
            btnCancel.Text = "Cancel";

            cts = new CancellationTokenSource();
            var engine = new InstallerEngine();
            engine.OnLog += AppendLog;
            engine.OnProgress += UpdateProgressUI;

            try
            {
                installedExePath = await engine.InstallAsync(
                    targetDir,
                    chkDesktopShortcut.Checked,
                    chkStartMenuShortcut.Checked,
                    null,
                    cts.Token
                );

                isInstalling = false;
                isCompleted = true;
                btnOpenFolder.Enabled = true;
                btnInstall.Enabled = true;
                btnInstall.BackColor = GreenSuccess;
                btnInstall.ForeColor = Color.FromArgb(20, 13, 8);
                btnInstall.Text = "▶ Launch Game Now";
                btnCancel.Text = "Close";

                if (chkLaunchOnExit.Checked)
                {
                    AppendLog("Launching Project Alpha Plus.exe...");
                    LaunchInstalledGame();
                }
                else
                {
                    MessageBox.Show(
                        this,
                        "Project Alpha Plus has been installed successfully to:\n" + targetDir + "\n\nClick 'Launch Game Now' or use your Desktop shortcut to play!",
                        "Installation Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            catch (OperationCanceledException)
            {
                isInstalling = false;
                txtInstallPath.ReadOnly = false;
                btnBrowse.Enabled = true;
                chkDesktopShortcut.Enabled = true;
                chkStartMenuShortcut.Enabled = true;
                btnInstall.Enabled = true;
                btnInstall.Text = "Retry Install";
                btnCancel.Text = "Exit";
                UpdateProgressUI(0, "Installation Canceled", "Setup was canceled by the user.");
                AppendLog("Installation canceled by user.");
            }
            catch (Exception ex)
            {
                isInstalling = false;
                txtInstallPath.ReadOnly = false;
                btnBrowse.Enabled = true;
                chkDesktopShortcut.Enabled = true;
                chkStartMenuShortcut.Enabled = true;
                btnInstall.Enabled = true;
                btnInstall.Text = "Retry Install";
                btnCancel.Text = "Exit";
                lblPhaseStatus.Text = "Installation Error";
                lblProgressDetail.Text = ex.Message;
                AppendLog("ERROR: " + ex.Message);

                MessageBox.Show(
                    this,
                    "An error occurred during installation:\n\n" + ex.Message,
                    "Installation Failed",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private void LaunchInstalledGame()
        {
            try
            {
                if (!string.IsNullOrEmpty(installedExePath) && File.Exists(installedExePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = installedExePath,
                        WorkingDirectory = Path.GetDirectoryName(installedExePath),
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                    this.Close();
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, "Failed to launch game executable:\n" + ex.Message, "Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnOpenFolderClicked(object sender, EventArgs e)
        {
            try
            {
                string dir = txtInstallPath.Text.Trim();
                if (Directory.Exists(dir))
                {
                    Process.Start("explorer.exe", "\"" + dir + "\"");
                }
            }
            catch { }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (isInstalling)
            {
                var res = MessageBox.Show(
                    this,
                    "Installation is currently in progress. Are you sure you want to cancel?",
                    "Cancel Installation",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (res == DialogResult.Yes)
                {
                    if (cts != null) cts.Cancel();
                }
                else
                {
                    e.Cancel = true;
                    return;
                }
            }
            base.OnFormClosing(e);
        }

        private static string GetSmartDefaultInstallDir()
        {
            string defaultDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "Project Alpha Plus"
            );

            try
            {
                string root = Path.GetPathRoot(defaultDir);
                DriveInfo cDrive = new DriveInfo(root);
                if (cDrive.IsReady && cDrive.AvailableFreeSpace < 300L * 1024 * 1024)
                {
                    // If default C: drive is low on disk space, suggest a drive with ample space
                    DriveInfo bestDrive = null;
                    foreach (DriveInfo d in DriveInfo.GetDrives())
                    {
                        if (d.IsReady && d.DriveType == DriveType.Fixed && d.AvailableFreeSpace > 1024L * 1024 * 1024)
                        {
                            if (bestDrive == null || d.AvailableFreeSpace > bestDrive.AvailableFreeSpace)
                            {
                                bestDrive = d;
                            }
                        }
                    }
                    if (bestDrive != null)
                    {
                        return Path.Combine(bestDrive.RootDirectory.FullName, "Programs", "Project Alpha Plus");
                    }
                }
            }
            catch { }
            return defaultDir;
        }

        private void OnCancelClicked(object sender, EventArgs e)
        {
            if (isInstalling && cts != null)
            {
                var res = MessageBox.Show(
                    this,
                    "Installation is currently in progress. Are you sure you want to cancel?",
                    "Cancel Installation",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (res == DialogResult.Yes)
                {
                    cts.Cancel();
                }
                return;
            }
            this.Close();
        }
    }
}
