/**
 * HTTPS sertifikat (kamera üçin lokal tor).
 *
 * Hemişelik Root CA (bir gezek) + IP üýtgände täzelenýän server sertifikaty.
 * Operatorlar CA-ny Trusted Root-a goýsa — reboot / IP üýtgese Advanced gerek däl.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const CERT_DIR = path.join(__dirname, '../../certs');
const PFX_PATH = path.join(CERT_DIR, 'kerwen.pfx');
const CER_PATH = path.join(CERT_DIR, 'kerwen.cer');
const CA_PFX_PATH = path.join(CERT_DIR, 'kerwen-ca.pfx');
const CA_CER_PATH = path.join(CERT_DIR, 'kerwen-ca.cer');
const META_PATH = path.join(CERT_DIR, 'kerwen-ips.json');
const PASSPHRASE = process.env.HTTPS_PASSPHRASE || 'kerwen-https';

function lanIpv4() {
  const host = String(os.hostname() || '').trim();
  const out = ['localhost', '127.0.0.1', 'KerwenKadr', 'kerwen-kadr'];
  if (host && !out.includes(host)) out.push(host);
  if (host && !host.includes('.')) out.push(`${host}.local`);
  if (!out.includes('KerwenKadr.local')) out.push('KerwenKadr.local');
  if (!out.includes('kerwen-kadr.local')) out.push('kerwen-kadr.local');

  const custom = String(process.env.KERWEN_LAN_NAME || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  custom.forEach((n) => {
    if (!out.includes(n)) out.push(n);
  });

  Object.values(os.networkInterfaces() || {}).forEach((list) => {
    (list || []).forEach((n) => {
      if ((n.family === 'IPv4' || n.family === 4) && !n.internal) {
        if (!String(n.address).startsWith('169.254.')) out.push(n.address);
      }
    });
  });
  return [...new Set(out)];
}

function ensureCertDir() {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
}

function ipsChanged(current) {
  try {
    if (!fs.existsSync(META_PATH)) return true;
    const prev = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const a = [...(prev.ips || [])].sort().join(',');
    const b = [...current].sort().join(',');
    return a !== b;
  } catch {
    return true;
  }
}

function runPsFile(tmpPs) {
  return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpPs], {
    encoding: 'utf8',
    windowsHide: true,
  });
}

/** Windows PowerShell 5.1 UTF-8 BOM gerek (Cyrillic ýol bozulmaz ýaly) */
function writePs1(filePath, content) {
  fs.writeFileSync(filePath, `\uFEFF${content}`, 'utf8');
}

/** Bir gezek: Root CA döret (operatorlar diňe muny ynamly edýär). Heç haçan täzeden ýazma. */
function ensureRootCa() {
  ensureCertDir();

  // PFX bar, CER ýok → täze CA döretmäň (köne ynam ýitýär); CER-i PFX-den çykaryň
  if (fs.existsSync(CA_PFX_PATH) && !fs.existsSync(CA_CER_PATH)) {
    try {
      exportCerFromPfx(CA_PFX_PATH, CA_CER_PATH);
      console.log('HTTPS Root CA .cer PFX-den dikeldildi (täze CA döredilmedi)');
    } catch (e) {
      console.error('CA .cer dikelmedi:', e.message);
    }
  }

  if (fs.existsSync(CA_PFX_PATH) && fs.existsSync(CA_CER_PATH)) {
    try {
      fs.copyFileSync(CA_CER_PATH, path.join(CERT_DIR, 'kerwen-https.cer'));
    } catch { /* ignore */ }
    return;
  }

  const tmpDir = path.join(os.tmpdir(), 'kerwen-https-cert');
  fs.mkdirSync(tmpDir, { recursive: true });
  const stamp = Date.now();
  const tmpPfx = path.join(tmpDir, `ca-${stamp}.pfx`);
  const tmpCer = path.join(tmpDir, `ca-${stamp}.cer`);
  const tmpPs = path.join(tmpDir, `_gen_ca_${stamp}.ps1`);
  const passEsc = PASSPHRASE.replace(/'/g, "''");
  const tmpPfxEsc = tmpPfx.replace(/'/g, "''");
  const tmpCerEsc = tmpCer.replace(/'/g, "''");

  const ps =
    "$ErrorActionPreference = 'Stop'\n" +
    "$ca = New-SelfSignedCertificate `\n" +
    "  -Subject 'CN=KerwenKadr Local CA' `\n" +
    "  -KeyUsage CertSign, CRLSign, DigitalSignature `\n" +
    "  -KeyExportPolicy Exportable `\n" +
    "  -KeyLength 2048 `\n" +
    "  -KeyAlgorithm RSA `\n" +
    "  -HashAlgorithm SHA256 `\n" +
    "  -NotAfter (Get-Date).AddYears(15) `\n" +
    "  -CertStoreLocation 'Cert:\\CurrentUser\\My' `\n" +
    "  -FriendlyName 'KerwenKadr-CA' `\n" +
    "  -TextExtension @('2.5.29.19={critical}{text}ca=true&pathlength=0')\n" +
    "$pwd = ConvertTo-SecureString -String '" + passEsc + "' -Force -AsPlainText\n" +
    "Export-PfxCertificate -Cert $ca -FilePath '" + tmpPfxEsc + "' -Password $pwd | Out-Null\n" +
    "Export-Certificate -Cert $ca -FilePath '" + tmpCerEsc + "' | Out-Null\n" +
    "Write-Output $ca.Thumbprint\n";

  writePs1(tmpPs, ps);
  try {
    const out = runPsFile(tmpPs);
    const thumb = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop();
    if (!fs.existsSync(tmpPfx)) throw new Error('CA PFX export failed');
    // Diňe ýok bolsa ýaz — bar bolan CA-ny heç haçan overwrite etme
    if (!fs.existsSync(CA_PFX_PATH)) fs.copyFileSync(tmpPfx, CA_PFX_PATH);
    if (!fs.existsSync(CA_CER_PATH) && fs.existsSync(tmpCer)) fs.copyFileSync(tmpCer, CA_CER_PATH);
    try { fs.copyFileSync(CA_CER_PATH, path.join(CERT_DIR, 'kerwen-https.cer')); } catch { /* ignore */ }
    console.log('HTTPS Root CA döredildi (15 ýyl, thumbprint:', String(thumb || '').slice(0, 8) + '…)');
    console.log('  Operatorlar BIR GEZEK kerwen-ca.cer / kerwen-https.cer ynamly etmeli — soň Advanced bolmaz.');
  } finally {
    try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPfx); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpCer); } catch { /* ignore */ }
  }
}

/** PFX-den .cer (public) — CA täzeden döretmez ýaly */
function exportCerFromPfx(pfxPath, cerPath) {
  const tmpDir = path.join(os.tmpdir(), 'kerwen-https-cert');
  fs.mkdirSync(tmpDir, { recursive: true });
  const stamp = Date.now();
  const tmpPs = path.join(tmpDir, `_export_cer_${stamp}.ps1`);
  const tmpPfx = path.join(tmpDir, `export-${stamp}.pfx`);
  fs.copyFileSync(pfxPath, tmpPfx);
  const passEsc = PASSPHRASE.replace(/'/g, "''");
  const esc = (p) => String(p).replace(/'/g, "''");
  const ps =
    "$ErrorActionPreference = 'Stop'\n" +
    "$pwd = ConvertTo-SecureString -String '" + passEsc + "' -Force -AsPlainText\n" +
    "$c = Import-PfxCertificate -FilePath '" + esc(tmpPfx) + "' -CertStoreLocation 'Cert:\\CurrentUser\\My' -Password $pwd\n" +
    "Export-Certificate -Cert $c -FilePath '" + esc(cerPath) + "' | Out-Null\n";
  writePs1(tmpPs, ps);
  try {
    runPsFile(tmpPs);
    if (!fs.existsSync(cerPath)) throw new Error('Export-Certificate failed');
  } finally {
    try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPfx); } catch { /* ignore */ }
  }
}

/** Server sertifikaty — CA bilen golyňy çekilen (IP üýtgände täzelenýär) */
function generateLeafWithCa(ips) {
  ensureRootCa();
  ensureCertDir();

  const tmpDir = path.join(os.tmpdir(), 'kerwen-https-cert');
  fs.mkdirSync(tmpDir, { recursive: true });
  const stamp = Date.now();
  const tmpPfx = path.join(tmpDir, `leaf-${stamp}.pfx`);
  const tmpCer = path.join(tmpDir, `leaf-${stamp}.cer`);
  const tmpPs = path.join(tmpDir, `_gen_leaf_${stamp}.ps1`);
  const namesFile = path.join(tmpDir, `names-${stamp}.txt`);
  const caTmpPfx = path.join(tmpDir, `ca-import-${stamp}.pfx`);
  fs.writeFileSync(namesFile, ips.join('\n') + '\n', 'ascii');
  // Proýekt ýoly Cyrillic bolup biler — PowerShell skriptinde diňe ASCII temp ýol
  fs.copyFileSync(CA_PFX_PATH, caTmpPfx);

  const passEsc = PASSPHRASE.replace(/'/g, "''");
  const esc = (p) => String(p).replace(/'/g, "''");

  const ps =
    "$ErrorActionPreference = 'Stop'\n" +
    "$pwd = ConvertTo-SecureString -String '" + passEsc + "' -Force -AsPlainText\n" +
    "$ca = Import-PfxCertificate -FilePath '" + esc(caTmpPfx) + "' -CertStoreLocation 'Cert:\\CurrentUser\\My' -Password $pwd\n" +
    "if (-not $ca) { throw 'CA import failed' }\n" +
    "$raw = Get-Content -LiteralPath '" + esc(namesFile) + "' | Where-Object { $_.Trim() -ne '' }\n" +
    "$dns = New-Object System.Collections.Generic.List[string]\n" +
    "$ipList = New-Object System.Collections.Generic.List[string]\n" +
    "foreach ($line in @($raw)) {\n" +
    "  $s = $line.Trim()\n" +
    "  if ($s -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$') { [void]$ipList.Add($s) } else { [void]$dns.Add($s) }\n" +
    "}\n" +
    "if ($dns.Count -eq 0) { [void]$dns.Add('KerwenKadr'); [void]$dns.Add('kerwen-kadr'); [void]$dns.Add('localhost') }\n" +
    "$sanParts = New-Object System.Collections.Generic.List[string]\n" +
    "foreach ($d in $dns) { [void]$sanParts.Add(('DNS={0}' -f $d)) }\n" +
    "foreach ($ip in $ipList) { [void]$sanParts.Add(('IPAddress={0}' -f $ip)) }\n" +
    "$amp = [string][char]38\n" +
    "$sanText = [string]::Join($amp, $sanParts.ToArray())\n" +
    "$sanExt = '2.5.29.17={text}' + $sanText\n" +
    "Write-Host ('SAN=' + $sanText)\n" +
    "$cert = New-SelfSignedCertificate `\n" +
    "  -Signer $ca `\n" +
    "  -Subject 'CN=kerwen-kadr' `\n" +
    "  -TextExtension @($sanExt) `\n" +
    "  -CertStoreLocation 'Cert:\\CurrentUser\\My' `\n" +
    "  -KeyExportPolicy Exportable `\n" +
    "  -KeySpec Signature `\n" +
    "  -KeyLength 2048 `\n" +
    "  -KeyAlgorithm RSA `\n" +
    "  -HashAlgorithm SHA256 `\n" +
    "  -NotAfter (Get-Date).AddYears(5) `\n" +
    "  -FriendlyName 'KerwenKadr-HTTPS'\n" +
    "Export-PfxCertificate -Cert $cert -FilePath '" + esc(tmpPfx) + "' -Password $pwd | Out-Null\n" +
    "Export-Certificate -Cert $cert -FilePath '" + esc(tmpCer) + "' | Out-Null\n" +
    "if (-not (Test-Path -LiteralPath '" + esc(tmpPfx) + "')) { throw 'Leaf PFX export failed' }\n" +
    "Write-Output $cert.Thumbprint\n";

  writePs1(tmpPs, ps);
  try {
    const out = runPsFile(tmpPs);
    const thumb = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop();
    if (thumb) console.log('HTTPS server sertifikat taýýar (thumbprint:', thumb.slice(0, 8) + '…)');
    if (!fs.existsSync(tmpPfx)) throw new Error(`PFX temp-de ýok: ${tmpPfx}`);
    fs.copyFileSync(tmpPfx, PFX_PATH);
    if (fs.existsSync(tmpCer)) fs.copyFileSync(tmpCer, CER_PATH);
    if (fs.existsSync(CA_CER_PATH)) {
      try { fs.copyFileSync(CA_CER_PATH, path.join(CERT_DIR, 'kerwen-https.cer')); } catch { /* ignore */ }
    }
    fs.writeFileSync(META_PATH, JSON.stringify({ ips, at: new Date().toISOString(), ca: true }, null, 2), 'utf8');
  } finally {
    try { fs.unlinkSync(tmpPs); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpPfx); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpCer); } catch { /* ignore */ }
    try { fs.unlinkSync(namesFile); } catch { /* ignore */ }
    try { fs.unlinkSync(caTmpPfx); } catch { /* ignore */ }
  }
}

function loadHttpsOptions() {
  ensureCertDir();
  const ips = lanIpv4();
  // HTTPS_REGEN=1 → diňe server (leaf) täzele; Root CA hemişe saklanýar
  const wantLeafRegen = String(process.env.HTTPS_REGEN || '') === '1'
    || ipsChanged(ips)
    || !fs.existsSync(PFX_PATH);

  // CA ýok bolsa ilki döret (bir gezek)
  if (!fs.existsSync(CA_PFX_PATH) || !fs.existsSync(CA_CER_PATH)) {
    if (process.platform === 'win32') ensureRootCa();
  } else {
    ensureRootCa(); // CER dikeltmek / kerwen-https.cer copy
  }

  if (wantLeafRegen) {
    if (process.platform === 'win32') {
      console.log('HTTPS server sertifikat taýýarlanýar (Root CA saklanýar)...');
      console.log('  IP-ler:', ips.filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x)).join(', ') || '—');
      try {
        generateLeafWithCa(ips);
      } catch (genErr) {
        if (fs.existsSync(PFX_PATH)) {
          console.error('Sertifikat täzelenmedi, köne PFX ulanylýar:', genErr.message);
        } else {
          throw genErr;
        }
      }
    } else if (!fs.existsSync(PFX_PATH)) {
      throw new Error('certs/kerwen.pfx yok');
    }
  }

  if (!fs.existsSync(PFX_PATH)) {
    throw new Error('HTTPS sertifikat tapylmady: certs/kerwen.pfx');
  }
  return {
    pfx: fs.readFileSync(PFX_PATH),
    passphrase: PASSPHRASE,
  };
}

/** Operatorlar ynamly etmeli faýl: Root CA */
function trustCerPath() {
  if (fs.existsSync(CA_CER_PATH)) return CA_CER_PATH;
  if (fs.existsSync(CER_PATH)) return CER_PATH;
  return CA_CER_PATH;
}

module.exports = {
  loadHttpsOptions,
  lanIpv4,
  PFX_PATH,
  CER_PATH,
  CA_CER_PATH,
  CA_PFX_PATH,
  PASSPHRASE,
  trustCerPath,
};
