//! The list of trusted developer keys, published next to the catalog (`trusted-keys.json`) and
//! signed by the root key compiled into BBForge (`trusted-keys.json.sig`). Adding or revoking a
//! developer is a new signed file, not a new BBForge release; nobody without the root key can
//! change the list, even with write access to the repository.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};

pub const KEYRING_FILE: &str = "trusted-keys.json";
pub const KEYRING_SIGNATURE_FILE: &str = "trusted-keys.json.sig";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEntry {
    pub name: String,
    pub public_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyring {
    pub version: u32,
    /// Increases with every published list, so an older (replayed) list never replaces a newer one.
    pub serial: u64,
    #[serde(default)]
    pub keys: Vec<KeyEntry>,
    /// Public keys that are no longer trusted, even if a package is signed with them.
    #[serde(default)]
    pub revoked: Vec<String>,
}

fn verifying_key(public_key: &str) -> Option<VerifyingKey> {
    BASE64
        .decode(public_key)
        .ok()
        .and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
        .and_then(|bytes| VerifyingKey::from_bytes(&bytes).ok())
}

/// The keyring if `signature` (base64) is the root key's signature of exactly these bytes.
pub fn verify_keyring(
    bytes: &[u8],
    signature: &str,
    root_public_key: &str,
) -> Result<Keyring, String> {
    let key = verifying_key(root_public_key).ok_or("Повреждённый корневой ключ")?;
    let signature = BASE64
        .decode(signature.trim())
        .ok()
        .and_then(|bytes| <[u8; 64]>::try_from(bytes).ok())
        .ok_or("Повреждённая подпись списка ключей")?;
    key.verify_strict(bytes, &Signature::from_bytes(&signature))
        .map_err(|_| "Подпись списка ключей недействительна")?;
    let keyring: Keyring =
        serde_json::from_slice(bytes).map_err(|error| format!("{KEYRING_FILE}: {error}"))?;
    if keyring.version != 1 {
        return Err(format!(
            "{KEYRING_FILE}: неизвестная версия {}",
            keyring.version
        ));
    }
    if keyring
        .keys
        .iter()
        .any(|entry| verifying_key(&entry.public_key).is_none())
    {
        return Err(format!("{KEYRING_FILE}: повреждённый ключ в списке"));
    }
    Ok(keyring)
}

impl Keyring {
    /// Keys to trust: the root plus listed keys, minus revoked ones (the root cannot be revoked).
    pub fn trusted(&self, root_name: &str, root_public_key: &str) -> Vec<(String, String)> {
        let mut result = vec![(root_name.to_string(), root_public_key.to_string())];
        for entry in &self.keys {
            if entry.public_key != root_public_key
                && !self.revoked.contains(&entry.public_key)
                && !result.iter().any(|(_, key)| key == &entry.public_key)
            {
                result.push((entry.name.clone(), entry.public_key.clone()));
            }
        }
        result
    }
}
