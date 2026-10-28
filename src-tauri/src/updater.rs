//! Updates from GitHub releases. BBForge finds out how it was installed (Arch or Debian package,
//! AppImage, Windows installer or portable, tarball), downloads the matching file of the latest
//! release, checks it against the release's SHA256SUMS and installs it the way that installation
//! expects: the package manager through pkexec, a replaced AppImage or exe, or the installer.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};

const LATEST: &str = "https://api.github.com/repos/1VicTim1/BBForge/releases/latest";
const MAX_DOWNLOAD: u64 = 300 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallKind {
    Arch,
    Deb,
    AppImage,
    WindowsSetup,
    WindowsPortable,
    /// Installed from the tarball or built from source: the release page is opened instead.
    Manual,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: String,
    pub page: String,
    pub kind: InstallKind,
    /// The file to install; None for a manual installation.
    pub asset: Option<Asset>,
    pub sums: Option<Asset>,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

fn command_succeeds(program: &str, args: &[&str]) -> bool {
    std::process::Command::new(program)
        .args(args)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

/// How this copy of BBForge was installed.
pub fn install_kind() -> InstallKind {
    let exe = std::env::current_exe().unwrap_or_default();
    if cfg!(windows) {
        let installed = exe
            .parent()
            .is_some_and(|dir| dir.join("uninstall.exe").exists());
        return if installed {
            InstallKind::WindowsSetup
        } else {
            InstallKind::WindowsPortable
        };
    }
    if std::env::var_os("APPIMAGE").is_some() {
        return InstallKind::AppImage;
    }
    let path = exe.to_string_lossy();
    if path.starts_with("/usr/") {
        if command_succeeds("pacman", &["-Qqo", &path]) {
            return InstallKind::Arch;
        }
        if command_succeeds("dpkg", &["-S", &path]) {
            return InstallKind::Deb;
        }
    }
    InstallKind::Manual
}

/// The release file for an installation kind and the checksum list that covers it.
fn pick(kind: InstallKind, assets: &[ReleaseAsset]) -> (Option<Asset>, Option<Asset>) {
    let (suffix, sums) = match kind {
        InstallKind::Arch => ("-x86_64.pkg.tar.zst", "SHA256SUMS-arch.txt"),
        InstallKind::Deb => ("_amd64.deb", "SHA256SUMS-linux.txt"),
        InstallKind::AppImage => ("_amd64.AppImage", "SHA256SUMS-linux.txt"),
        InstallKind::WindowsSetup => ("_x64-setup.exe", "SHA256SUMS-windows.txt"),
        InstallKind::WindowsPortable => ("_x64-portable.exe", "SHA256SUMS-windows.txt"),
        InstallKind::Manual => return (None, None),
    };
    let find = |test: &dyn Fn(&str) -> bool| {
        assets
            .iter()
            .find(|asset| test(&asset.name))
            .map(|asset| Asset {
                name: asset.name.clone(),
                url: asset.browser_download_url.clone(),
                size: asset.size,
            })
    };
    (
        find(&|name| name.ends_with(suffix)),
        find(&|name| name == sums),
    )
}

fn get(url: &str) -> Result<ureq::Response, String> {
    ureq::get(url)
        .set("User-Agent", concat!("BBForge/", env!("CARGO_PKG_VERSION")))
        .set("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(300))
        .call()
        .map_err(|error| format!("{url}: {error}"))
}

/// The latest release when it is newer than this BBForge.
pub fn check() -> Result<Option<UpdateInfo>, String> {
    let body = get(LATEST)?
        .into_string()
        .map_err(|error| format!("GitHub: {error}"))?;
    let release: Release =
        serde_json::from_str(&body).map_err(|error| format!("GitHub: {error}"))?;
    if release.draft || release.prerelease {
        return Ok(None);
    }
    let version = release.tag_name.trim_start_matches('v').to_string();
    let current = env!("CARGO_PKG_VERSION");
    let (Ok(latest), Ok(running)) = (
        semver::Version::parse(&version),
        semver::Version::parse(current),
    ) else {
        return Ok(None);
    };
    if latest <= running {
        return Ok(None);
    }
    let kind = install_kind();
    let (asset, sums) = pick(kind, &release.assets);
    let kind = if asset.is_some() && sums.is_some() {
        kind
    } else {
        InstallKind::Manual
    };
    Ok(Some(UpdateInfo {
        version,
        current: current.to_string(),
        notes: release.body,
        page: release.html_url,
        kind,
        asset,
        sums,
    }))
}

/// Downloads the update into `dir`, reporting progress, and checks it against SHA256SUMS.
pub fn download(
    dir: &Path,
    info: &UpdateInfo,
    mut progress: impl FnMut(u64, Option<u64>),
) -> Result<PathBuf, String> {
    let (Some(asset), Some(sums)) = (&info.asset, &info.sums) else {
        return Err("Для этой установки обновление ставится вручную".into());
    };
    if !asset
        .url
        .starts_with("https://github.com/1VicTim1/BBForge/releases/download/")
        || !sums
            .url
            .starts_with("https://github.com/1VicTim1/BBForge/releases/download/")
        || asset.name.contains(['/', '\\'])
    {
        return Err("Неожиданный адрес файла обновления".into());
    }
    let sums_text = get(&sums.url)?
        .into_string()
        .map_err(|error| error.to_string())?;
    let expected = sums_text
        .lines()
        .find_map(|line| {
            let (hash, name) = line.split_once(char::is_whitespace)?;
            (name.trim().trim_start_matches('*') == asset.name).then(|| hash.to_ascii_lowercase())
        })
        .ok_or_else(|| format!("{} нет в {}", asset.name, sums.name))?;
    let response = get(&asset.url)?;
    let total = response
        .header("Content-Length")
        .and_then(|value| value.parse().ok())
        .or(Some(asset.size));
    let mut reader = response.into_reader().take(MAX_DOWNLOAD + 1);
    let mut hasher = Sha256::new();
    let mut bytes = Vec::with_capacity(asset.size as usize);
    let mut buffer = [0u8; 64 * 1024];
    let mut reported = std::time::Instant::now();
    progress(0, total);
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        bytes.extend_from_slice(&buffer[..read]);
        if reported.elapsed() >= std::time::Duration::from_millis(100) {
            progress(bytes.len() as u64, total);
            reported = std::time::Instant::now();
        }
    }
    progress(bytes.len() as u64, total);
    if bbforge_plugin::package::hex(&hasher.finalize()) != expected {
        return Err(
            "Контрольная сумма обновления не совпадает: файл повреждён или подменён".into(),
        );
    }
    std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let path = dir.join(&asset.name);
    std::fs::write(&path, bytes).map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(path)
}

/// Installs a downloaded update. Returns true when BBForge should restart itself; for the Windows
/// installer the installer starts the new version, and BBForge just exits.
pub fn install(kind: InstallKind, file: &Path) -> Result<bool, String> {
    let file_text = file.to_string_lossy().to_string();
    let run = |program: &str, args: &[&str]| -> Result<(), String> {
        let status = std::process::Command::new(program)
            .args(args)
            .status()
            .map_err(|error| format!("{program}: {error}"))?;
        match status.code() {
            Some(0) => Ok(()),
            // pkexec: the user closed the password dialog.
            Some(126 | 127) => Err("Установка отменена".into()),
            _ => Err(format!("{program} завершился с ошибкой ({status})")),
        }
    };
    match kind {
        InstallKind::Arch => {
            run("pkexec", &["pacman", "-U", "--noconfirm", &file_text]).map(|()| true)
        }
        InstallKind::Deb => run(
            "pkexec",
            &["apt-get", "install", "-y", "--allow-downgrades", &file_text],
        )
        .map(|()| true),
        InstallKind::AppImage => {
            let target =
                PathBuf::from(std::env::var_os("APPIMAGE").ok_or("Не найден путь AppImage")?);
            replace_file(file, &target)?;
            Ok(true)
        }
        InstallKind::WindowsPortable => {
            let target = std::env::current_exe().map_err(|error| error.to_string())?;
            // A running exe cannot be overwritten on Windows, but it can be renamed.
            let old = target.with_extension("old.exe");
            let _ = std::fs::remove_file(&old);
            std::fs::rename(&target, &old).map_err(|error| error.to_string())?;
            std::fs::copy(file, &target).map_err(|error| error.to_string())?;
            Ok(true)
        }
        InstallKind::WindowsSetup => {
            std::process::Command::new(file)
                .arg("/P")
                .spawn()
                .map_err(|error| error.to_string())?;
            Ok(false)
        }
        InstallKind::Manual => Err("Для этой установки обновление ставится вручную".into()),
    }
}

fn replace_file(new: &Path, target: &Path) -> Result<(), String> {
    let staged = target.with_extension("new");
    std::fs::copy(new, &staged).map_err(|error| format!("{}: {error}", staged.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }
    std::fs::rename(&staged, target).map_err(|error| format!("{}: {error}", target.display()))
}

/// Leftover of a portable Windows update.
pub fn cleanup() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(exe.with_extension("old.exe"));
    }
}
