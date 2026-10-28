//! bbforge-pack: packs a BBForge plugin or theme folder into a signed .zip.
//!
//!   bbforge-pack keygen --signer "Имя"            create a signing key (keep it private)
//!   bbforge-pack pack ./my-plugin --key key.json  validate manifest.json, pack and sign
//!   bbforge-pack verify my-plugin-1.0.0.zip       show manifest, permissions and signature

use bbforge_plugin::package::{SIGNATURE_FILE, canonical_listing, valid_path};
use bbforge_plugin::{
    Files, KeyFile, Manifest, SignatureStatus, TrustedKey, known_permissions, read_archive,
    write_archive,
};
use clap::{Parser, Subcommand};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    name = "bbforge-pack",
    version,
    about = "Упаковка и подпись плагинов и тем BBForge"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Создать ключ подписи разработчика
    Keygen {
        /// Имя автора, записывается в подпись
        #[arg(long)]
        signer: String,
        /// Куда сохранить ключ
        #[arg(long, default_value = "bbforge-signing-key.json")]
        out: PathBuf,
    },
    /// Показать открытый ключ из файла ключа
    Pubkey { key: PathBuf },
    /// Проверить манифест и упаковать папку в .zip
    Pack {
        /// Папка с manifest.json
        dir: PathBuf,
        /// Имя архива или папка для него (по умолчанию <id>-<version>.zip рядом с папкой)
        #[arg(short, long)]
        out: Option<PathBuf>,
        /// Файл ключа для подписи; без него пакет не подписывается
        #[arg(long, env = "BBFORGE_SIGNING_KEY")]
        key: Option<PathBuf>,
    },
    /// Собрать index.json каталога из архивов в папке
    Index {
        /// Папка с .zip-пакетами
        dir: PathBuf,
        /// Куда записать каталог
        #[arg(short, long, default_value = "index.json")]
        out: PathBuf,
        /// Путь к архивам в каталоге относительно index.json
        #[arg(long, default_value = "dist")]
        prefix: String,
    },
    /// Подписать список доверенных разработчиков (trusted-keys.json) корневым ключом
    SignKeys {
        /// Файл списка
        #[arg(default_value = "trusted-keys.json")]
        file: PathBuf,
        /// Корневой ключ
        #[arg(long, env = "BBFORGE_SIGNING_KEY")]
        key: PathBuf,
    },
    /// Проверить архив: манифест, файлы, подпись
    Verify {
        file: PathBuf,
        /// Открытый ключ (base64), которому доверять при проверке; можно указать несколько раз
        #[arg(long = "trust")]
        trust: Vec<String>,
    },
}

fn main() -> ExitCode {
    let result = match Cli::parse().command {
        Command::Keygen { signer, out } => keygen(&signer, &out),
        Command::Pubkey { key } => read_key(&key).map(|key| println!("{}", key.public_key)),
        Command::Pack { dir, out, key } => pack(&dir, out, key.as_deref()),
        Command::Verify { file, trust } => verify(&file, &trust),
        Command::Index { dir, out, prefix } => index(&dir, &out, &prefix),
        Command::SignKeys { file, key } => sign_keys(&file, &key),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("ошибка: {message}");
            ExitCode::FAILURE
        }
    }
}

fn keygen(signer: &str, out: &Path) -> Result<(), String> {
    if out.exists() {
        return Err(format!(
            "{} уже существует — ключ не перезаписан",
            out.display()
        ));
    }
    let key = KeyFile::generate(signer)?;
    let json = serde_json::to_string_pretty(&key).expect("key serializes");
    write_private(out, json.as_bytes())?;
    println!("Ключ сохранён: {}", out.display());
    println!("Открытый ключ: {}", key.public_key);
    println!("Храните файл ключа в секрете и не добавляйте его в git.");
    Ok(())
}

#[cfg(unix)]
fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("{}: {error}", path.display()))
}

#[cfg(not(unix))]
fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|error| format!("{}: {error}", path.display()))
}

fn read_key(path: &Path) -> Result<KeyFile, String> {
    let text = fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))?;
    serde_json::from_str(&text).map_err(|error| format!("{}: {error}", path.display()))
}

/// Every file of the folder except hidden ones, archives and an old signature.
fn collect(dir: &Path) -> Result<Files, String> {
    let mut files = Files::new();
    let mut problems = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let entries =
            fs::read_dir(&current).map_err(|error| format!("{}: {error}", current.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| error.to_string())?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            if kind.is_symlink() {
                problems.push(format!(
                    "символическая ссылка не упаковывается: {}",
                    path.display()
                ));
                continue;
            }
            if kind.is_dir() {
                stack.push(path);
                continue;
            }
            let relative = path
                .strip_prefix(dir)
                .expect("inside the folder")
                .components()
                .map(|part| part.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            if relative == SIGNATURE_FILE || relative.ends_with(".zip") {
                continue;
            }
            if !valid_path(&relative) {
                problems.push(format!(
                    "недопустимое имя файла «{relative}»: только латиница, цифры, «-», «_», «.»"
                ));
                continue;
            }
            let bytes = fs::read(&path).map_err(|error| format!("{}: {error}", path.display()))?;
            files.insert(relative, bytes);
        }
    }
    if problems.is_empty() {
        Ok(files)
    } else {
        Err(problems.join("\n"))
    }
}

fn pack(dir: &Path, out: Option<PathBuf>, key: Option<&Path>) -> Result<(), String> {
    let files = collect(dir)?;
    let manifest = Manifest::parse(
        files
            .get("manifest.json")
            .ok_or_else(|| format!("В {} нет manifest.json", dir.display()))?,
    )?;
    let report = manifest.validate(|path| files.contains_key(path));
    for warning in &report.warnings {
        eprintln!("предупреждение: {warning}");
    }
    if !report.is_ok() {
        return Err(format!(
            "манифест содержит ошибки:\n  {}",
            report.errors.join("\n  ")
        ));
    }
    let signature = key
        .map(|path| read_key(path)?.sign(canonical_listing(&files).as_bytes()))
        .transpose()?;
    let file_name = format!("{}-{}.zip", manifest.id, manifest.version);
    let out = match out {
        Some(path) if path.is_dir() => path.join(file_name),
        Some(path) => path,
        None => dir.parent().unwrap_or(Path::new(".")).join(file_name),
    };
    let archive = write_archive(Cursor::new(Vec::new()), &files, signature.as_ref())?;
    fs::write(&out, archive.into_inner()).map_err(|error| format!("{}: {error}", out.display()))?;
    println!(
        "Готово: {} ({} файлов, {})",
        out.display(),
        files.len(),
        match &signature {
            Some(signature) => format!("подписан ключом {}", signature.signer),
            None => "без подписи".into(),
        }
    );
    Ok(())
}

/// Writes `<file>.sig` after checking that the list is well-formed.
fn sign_keys(file: &Path, key: &Path) -> Result<(), String> {
    let bytes = fs::read(file).map_err(|error| format!("{}: {error}", file.display()))?;
    let key = read_key(key)?;
    let signature = key.sign_detached(&bytes)?;
    let keyring = bbforge_plugin::keyring::verify_keyring(&bytes, &signature, &key.public_key)?;
    let out = PathBuf::from(format!("{}.sig", file.display()));
    fs::write(&out, format!("{signature}\n"))
        .map_err(|error| format!("{}: {error}", out.display()))?;
    println!(
        "Подписано: {} (serial {}, разработчиков {}, отозвано {})",
        out.display(),
        keyring.serial,
        keyring.keys.len(),
        keyring.revoked.len()
    );
    Ok(())
}

/// `index.json`: every package of the folder (newest version per id) with its checksum.
fn index(dir: &Path, out: &Path, prefix: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    let mut packages: std::collections::BTreeMap<String, (semver::Version, serde_json::Value)> =
        Default::default();
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|error| format!("{}: {error}", dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "zip"))
        .collect();
    entries.sort();
    for path in entries {
        let bytes = fs::read(&path).map_err(|error| format!("{}: {error}", path.display()))?;
        let package =
            read_archive(&bytes).map_err(|error| format!("{}: {error}", path.display()))?;
        let inspection = package.inspect(&[]);
        if !inspection.errors.is_empty() {
            return Err(format!(
                "{}: {}",
                path.display(),
                inspection.errors.join("; ")
            ));
        }
        let manifest = inspection.manifest;
        let version =
            semver::Version::parse(&manifest.version).map_err(|error| error.to_string())?;
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let signer = match &inspection.signature {
            SignatureStatus::Untrusted { signer, .. } | SignatureStatus::Trusted { signer, .. } => {
                Some(signer.clone())
            }
            SignatureStatus::Invalid { reason } => {
                return Err(format!(
                    "{}: подпись недействительна: {reason}",
                    path.display()
                ));
            }
            SignatureStatus::Unsigned => None,
        };
        let entry = serde_json::json!({
            "id": manifest.id,
            "type": manifest.kind,
            "name": manifest.name,
            "version": manifest.version,
            "description": manifest.description,
            "author": manifest.author,
            "permissions": manifest.permissions,
            "dependencies": manifest.dependencies,
            "signer": signer,
            "file": format!("{}/{name}", prefix.trim_end_matches('/')),
            "size": bytes.len(),
            "sha256": bbforge_plugin::package::hex(&Sha256::digest(&bytes)),
        });
        if packages
            .get(&manifest.id)
            .is_none_or(|(known, _)| *known < version)
        {
            packages.insert(manifest.id.clone(), (version, entry));
        }
    }
    let index = serde_json::json!({
        "version": 1,
        "packages": packages.into_values().map(|(_, entry)| entry).collect::<Vec<_>>(),
    });
    let json = serde_json::to_string_pretty(&index).expect("index serializes") + "\n";
    fs::write(out, json).map_err(|error| format!("{}: {error}", out.display()))?;
    println!(
        "Каталог: {} ({} пакетов)",
        out.display(),
        index["packages"].as_array().map_or(0, Vec::len)
    );
    Ok(())
}

fn verify(file: &Path, trust: &[String]) -> Result<(), String> {
    let bytes = fs::read(file).map_err(|error| format!("{}: {error}", file.display()))?;
    let package = read_archive(&bytes)?;
    let trusted: Vec<TrustedKey> = trust
        .iter()
        .map(|key| TrustedKey {
            name: "--trust",
            public_key: key,
        })
        .collect();
    let inspection = package.inspect(&trusted);
    let manifest = &inspection.manifest;
    println!("{} {} ({})", manifest.name, manifest.version, manifest.id);
    if let Some(description) = &manifest.description {
        println!("  {description}");
    }
    println!(
        "Файлов: {}, дайджест: {}",
        inspection.files.len(),
        inspection.digest
    );
    println!("Разрешения:");
    if manifest.permissions.is_empty() {
        println!("  (нет)");
    }
    for permission in &manifest.permissions {
        let template = permission
            .strip_prefix("network:")
            .map(|host| (host, "network:*"));
        let id = template.map_or(permission.as_str(), |(_, id)| id);
        match known_permissions().iter().find(|item| item.id == id) {
            Some(item) if bbforge_plugin::known_permission(permission) => println!(
                "  {permission} — {}",
                item.title
                    .replace("{host}", template.map_or("", |(host, _)| host))
            ),
            _ => println!("  {permission} — неизвестное, будет проигнорировано"),
        }
    }
    let status = match &inspection.signature {
        SignatureStatus::Unsigned => "нет подписи".to_string(),
        SignatureStatus::Trusted { signer, .. } => {
            format!("действительна, доверенный ключ ({signer})")
        }
        SignatureStatus::Untrusted { signer, public_key } => {
            format!("действительна, ключ не в списке доверенных ({signer}, {public_key})")
        }
        SignatureStatus::Invalid { reason } => format!("НЕДЕЙСТВИТЕЛЬНА: {reason}"),
    };
    println!("Подпись: {status}");
    for warning in &inspection.warnings {
        println!("предупреждение: {warning}");
    }
    if !inspection.errors.is_empty() {
        return Err(inspection.errors.join("\n"));
    }
    if matches!(inspection.signature, SignatureStatus::Invalid { .. }) {
        return Err("подпись недействительна".into());
    }
    Ok(())
}
