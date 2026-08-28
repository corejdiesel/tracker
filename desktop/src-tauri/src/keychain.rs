//! Session storage via the OS credential store — Keychain on macOS,
//! Credential Manager on Windows, Secret Service on Linux. One `keyring`
//! crate API across all three; the brief requires Keychain specifically on
//! macOS, which is what this becomes there.
//!
//! UNVERIFIED in this environment: there is no Keychain on Linux to test
//! against, and the `keyring` crate's Linux backend (Secret Service) needs a
//! session bus that a headless container doesn't have either. This compiles
//! and the logic is straightforward, but "compiles" is not "confirmed to
//! store and retrieve a real macOS Keychain item" — that needs Joe's Mac.
//! See docs/desktop-architecture.md §3.

use keyring::Entry;

const SERVICE: &str = "tax.getsorted.freelance-os";

fn entry(account: &str) -> Result<Entry, keyring::Error> {
    Entry::new(SERVICE, account)
}

pub fn set(account: &str, secret: &str) -> Result<(), keyring::Error> {
    entry(account)?.set_password(secret)
}

pub fn get(account: &str) -> Result<Option<String>, keyring::Error> {
    match entry(account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(other) => Err(other),
    }
}

pub fn delete(account: &str) -> Result<(), keyring::Error> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(other) => Err(other),
    }
}
