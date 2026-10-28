//! BBForge plugin and theme packages: manifest, archive format and signatures.
//! Shared by the application (installation) and `bbforge-pack` (packing and signing).

pub mod keyring;
pub mod manifest;
pub mod package;
pub mod signing;

pub use manifest::{
    Manifest, PackageKind, Permission, Report, known_permission, known_permissions, valid_id,
};
pub use package::{Files, Inspection, Package, read_archive, write_archive};
pub use signing::{KeyFile, Signature, SignatureStatus, TrustedKey};
