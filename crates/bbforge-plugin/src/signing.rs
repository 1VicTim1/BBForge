//! Ed25519 signatures of packages and the developer key files that make them.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

pub const ALGORITHM: &str = "ed25519";

/// `signature.json` inside a package.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub algorithm: String,
    /// Who signed, as written in the key file; informational, trust comes from the key.
    #[serde(default)]
    pub signer: String,
    pub public_key: String,
    pub signature: String,
}

/// A key BBForge trusts, compiled into the application.
#[derive(Clone, Copy, Debug)]
pub struct TrustedKey<'a> {
    pub name: &'a str,
    pub public_key: &'a str,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum SignatureStatus {
    /// No signature.json.
    Unsigned,
    /// The signature matches and the key is one BBForge trusts.
    Trusted { signer: String, public_key: String },
    /// The signature matches, but the key is unknown to BBForge.
    Untrusted { signer: String, public_key: String },
    /// The signature does not match the files (or is malformed).
    Invalid { reason: String },
}

impl SignatureStatus {
    pub fn is_trusted(&self) -> bool {
        matches!(self, Self::Trusted { .. })
    }
}

/// A developer key file made by `bbforge-pack keygen`. Keep it private.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    pub algorithm: String,
    pub signer: String,
    pub public_key: String,
    pub secret_key: String,
}

impl KeyFile {
    pub fn generate(signer: &str) -> Result<Self, String> {
        let mut seed = [0u8; 32];
        getrandom::fill(&mut seed)
            .map_err(|error| format!("Нет источника случайности: {error}"))?;
        let key = SigningKey::from_bytes(&seed);
        Ok(Self {
            algorithm: ALGORITHM.into(),
            signer: signer.into(),
            public_key: BASE64.encode(key.verifying_key().as_bytes()),
            secret_key: BASE64.encode(seed),
        })
    }

    fn signing_key(&self) -> Result<SigningKey, String> {
        if self.algorithm != ALGORITHM {
            return Err(format!("Неизвестный алгоритм ключа: {}", self.algorithm));
        }
        let seed: [u8; 32] = BASE64
            .decode(&self.secret_key)
            .ok()
            .and_then(|bytes| bytes.try_into().ok())
            .ok_or("Повреждённый секретный ключ")?;
        let key = SigningKey::from_bytes(&seed);
        if BASE64.encode(key.verifying_key().as_bytes()) != self.public_key {
            return Err("Открытый ключ в файле не соответствует секретному".into());
        }
        Ok(key)
    }

    /// Bare base64 signature of `message` (used for the trusted keys list).
    pub fn sign_detached(&self, message: &[u8]) -> Result<String, String> {
        Ok(BASE64.encode(self.signing_key()?.sign(message).to_bytes()))
    }

    pub fn sign(&self, message: &[u8]) -> Result<Signature, String> {
        let key = self.signing_key()?;
        Ok(Signature {
            algorithm: ALGORITHM.into(),
            signer: self.signer.clone(),
            public_key: self.public_key.clone(),
            signature: BASE64.encode(key.sign(message).to_bytes()),
        })
    }
}

pub fn verify(
    signature: Option<&Signature>,
    message: &[u8],
    trusted: &[TrustedKey<'_>],
) -> SignatureStatus {
    let Some(signature) = signature else {
        return SignatureStatus::Unsigned;
    };
    let invalid = |reason: &str| SignatureStatus::Invalid {
        reason: reason.into(),
    };
    if signature.algorithm != ALGORITHM {
        return invalid("неизвестный алгоритм подписи");
    }
    let Some(key) = BASE64
        .decode(&signature.public_key)
        .ok()
        .and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
        .and_then(|bytes| VerifyingKey::from_bytes(&bytes).ok())
    else {
        return invalid("повреждённый открытый ключ");
    };
    let Some(bytes) = BASE64
        .decode(&signature.signature)
        .ok()
        .and_then(|bytes| <[u8; 64]>::try_from(bytes).ok())
    else {
        return invalid("повреждённая подпись");
    };
    if key
        .verify_strict(message, &ed25519_dalek::Signature::from_bytes(&bytes))
        .is_err()
    {
        return invalid("файлы пакета изменены после подписи");
    }
    match trusted
        .iter()
        .find(|item| item.public_key == signature.public_key)
    {
        Some(item) => SignatureStatus::Trusted {
            signer: item.name.into(),
            public_key: signature.public_key.clone(),
        },
        None => SignatureStatus::Untrusted {
            signer: signature.signer.clone(),
            public_key: signature.public_key.clone(),
        },
    }
}
