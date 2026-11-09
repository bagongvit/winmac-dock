using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class WinMacLauncher
{
    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string electronExe = Path.Combine(appDir, "node_modules", "electron", "dist", "electron.exe");

            ProcessStartInfo psi = new ProcessStartInfo();
            if (File.Exists(electronExe))
            {
                psi.FileName = electronExe;
                psi.Arguments = "\"" + appDir.TrimEnd('\\') + "\"";
            }
            else
            {
                psi.FileName = "cmd.exe";
                psi.Arguments = "/c npm start";
            }

            psi.WorkingDirectory = appDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;

            Process.Start(psi);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Gagal menjalankan WinMac Desktop OS:\n" + ex.Message,
                "WinMac Desktop OS",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
