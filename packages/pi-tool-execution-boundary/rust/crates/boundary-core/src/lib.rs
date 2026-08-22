use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum BoundaryError {
    #[error("integer is outside canonical CBOR range")]
    IntegerRange,
    #[error("canonical map contains duplicate key {0}")]
    DuplicateMapKey(u64),
    #[error("invalid workspace path: {0}")]
    InvalidWorkspacePath(String),
    #[error("invalid operation: {0}")]
    InvalidOperation(String),
    #[error("policy proposal is broader than operator grant: {0}")]
    BroaderPolicy(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CborValue {
    UInt(u64),
    NInt(i64),
    Bytes(Vec<u8>),
    Text(String),
    Array(Vec<CborValue>),
    Map(Vec<(u64, CborValue)>),
    Bool(bool),
    Null,
}

fn encode_header(major: u8, value: u64, output: &mut Vec<u8>) {
    match value {
        0..=23 => output.push((major << 5) | value as u8),
        24..=0xff => {
            output.extend_from_slice(&[(major << 5) | 24, value as u8]);
        }
        0x100..=0xffff => {
            output.push((major << 5) | 25);
            output.extend_from_slice(&(value as u16).to_be_bytes());
        }
        0x1_0000..=0xffff_ffff => {
            output.push((major << 5) | 26);
            output.extend_from_slice(&(value as u32).to_be_bytes());
        }
        _ => {
            output.push((major << 5) | 27);
            output.extend_from_slice(&value.to_be_bytes());
        }
    }
}

fn encode_into(value: &CborValue, output: &mut Vec<u8>) -> Result<(), BoundaryError> {
    match value {
        CborValue::UInt(value) => encode_header(0, *value, output),
        CborValue::NInt(value) => {
            if *value >= 0 {
                return Err(BoundaryError::IntegerRange);
            }
            let encoded = (-1_i128 - i128::from(*value)) as u64;
            encode_header(1, encoded, output);
        }
        CborValue::Bytes(bytes) => {
            encode_header(2, bytes.len() as u64, output);
            output.extend_from_slice(bytes);
        }
        CborValue::Text(text) => {
            encode_header(3, text.len() as u64, output);
            output.extend_from_slice(text.as_bytes());
        }
        CborValue::Array(values) => {
            encode_header(4, values.len() as u64, output);
            for item in values {
                encode_into(item, output)?;
            }
        }
        CborValue::Map(entries) => {
            let mut seen = BTreeSet::new();
            let mut encoded_entries = Vec::with_capacity(entries.len());
            for (key, value) in entries {
                if !seen.insert(*key) {
                    return Err(BoundaryError::DuplicateMapKey(*key));
                }
                let mut encoded_key = Vec::new();
                encode_header(0, *key, &mut encoded_key);
                let mut encoded_value = Vec::new();
                encode_into(value, &mut encoded_value)?;
                encoded_entries.push((encoded_key, encoded_value));
            }
            encoded_entries.sort_by(|left, right| {
                left.0
                    .len()
                    .cmp(&right.0.len())
                    .then_with(|| left.0.cmp(&right.0))
            });
            encode_header(5, encoded_entries.len() as u64, output);
            for (key, value) in encoded_entries {
                output.extend_from_slice(&key);
                output.extend_from_slice(&value);
            }
        }
        CborValue::Bool(false) => output.push(0xf4),
        CborValue::Bool(true) => output.push(0xf5),
        CborValue::Null => output.push(0xf6),
    }
    Ok(())
}

pub fn encode_deterministic_cbor(value: &CborValue) -> Result<Vec<u8>, BoundaryError> {
    let mut output = Vec::new();
    encode_into(value, &mut output)?;
    Ok(output)
}

pub fn domain_separated_digest(domain: &str, value: &CborValue) -> Result<[u8; 32], BoundaryError> {
    let mut hasher = Sha256::new();
    hasher.update(domain.as_bytes());
    hasher.update([0]);
    hasher.update(encode_deterministic_cbor(value)?);
    Ok(hasher.finalize().into())
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct WorkspacePath(Vec<String>);

impl WorkspacePath {
    pub fn parse(value: &str, allow_root: bool) -> Result<Self, BoundaryError> {
        if allow_root && value == "." {
            return Ok(Self(Vec::new()));
        }
        if value.is_empty()
            || value.starts_with('/')
            || value.starts_with('~')
            || value.starts_with("\\\\")
        {
            return Err(BoundaryError::InvalidWorkspacePath(value.to_owned()));
        }
        let mut segments = Vec::new();
        for segment in value.split('/') {
            if segment.is_empty()
                || segment == "."
                || segment == ".."
                || segment.contains('\\')
                || segment.eq_ignore_ascii_case(".git")
                || segment.bytes().any(|byte| byte == 0 || byte < 0x20 || byte == 0x7f)
                || segment.as_bytes().len() > 255
            {
                return Err(BoundaryError::InvalidWorkspacePath(value.to_owned()));
            }
            segments.push(segment.to_owned());
        }
        if segments.len() > 256 || value.as_bytes().len() > 4096 {
            return Err(BoundaryError::InvalidWorkspacePath(value.to_owned()));
        }
        Ok(Self(segments))
    }

    pub fn segments(&self) -> &[String] {
        &self.0
    }

    fn cbor(&self) -> CborValue {
        CborValue::Array(self.0.iter().cloned().map(CborValue::Text).collect())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EffectClass {
    Read,
    WorkspaceMutation,
    ArbitraryProcess,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DurabilityClass {
    D0ReplaySafeRead,
    D1WorkspaceEffect,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operation {
    Read {
        path: WorkspacePath,
        offset: u64,
        limit: u64,
    },
    Write {
        path: WorkspacePath,
        content: Vec<u8>,
    },
    Edit {
        path: WorkspacePath,
        old_text: Vec<u8>,
        new_text: Vec<u8>,
        occurrence: u32,
    },
    List {
        path: WorkspacePath,
        limit: u32,
    },
    Grep {
        path: WorkspacePath,
        pattern: String,
        glob: Option<String>,
        literal: bool,
        ignore_case: bool,
        limit: u32,
    },
    Find {
        path: WorkspacePath,
        pattern: String,
        limit: u32,
    },
    Exec {
        argv: Vec<String>,
        cwd: WorkspacePath,
        environment: BTreeMap<String, String>,
        user_initiated: bool,
    },
}

impl Operation {
    pub fn effect(&self) -> EffectClass {
        match self {
            Self::Read { .. } | Self::List { .. } | Self::Grep { .. } | Self::Find { .. } => {
                EffectClass::Read
            }
            Self::Write { .. } | Self::Edit { .. } => EffectClass::WorkspaceMutation,
            Self::Exec { .. } => EffectClass::ArbitraryProcess,
        }
    }

    pub fn durability(&self) -> DurabilityClass {
        match self.effect() {
            EffectClass::Read => DurabilityClass::D0ReplaySafeRead,
            EffectClass::WorkspaceMutation | EffectClass::ArbitraryProcess => {
                DurabilityClass::D1WorkspaceEffect
            }
        }
    }

    pub fn cbor(&self) -> Result<CborValue, BoundaryError> {
        Ok(match self {
            Self::Read { path, offset, limit } => CborValue::Map(vec![
                (1, CborValue::Text("read".into())),
                (2, path.cbor()),
                (3, CborValue::UInt(*offset)),
                (4, CborValue::UInt(*limit)),
            ]),
            Self::Write { path, content } => CborValue::Map(vec![
                (1, CborValue::Text("write".into())),
                (2, path.cbor()),
                (3, CborValue::Bytes(content.clone())),
            ]),
            Self::Edit { path, old_text, new_text, occurrence } => {
                if old_text.is_empty() || *occurrence == 0 {
                    return Err(BoundaryError::InvalidOperation(
                        "edit requires non-empty old_text and occurrence >= 1".into(),
                    ));
                }
                CborValue::Map(vec![
                    (1, CborValue::Text("edit".into())),
                    (2, path.cbor()),
                    (3, CborValue::Bytes(old_text.clone())),
                    (4, CborValue::Bytes(new_text.clone())),
                    (5, CborValue::UInt(u64::from(*occurrence))),
                ])
            }
            Self::List { path, limit } => CborValue::Map(vec![
                (1, CborValue::Text("list".into())),
                (2, path.cbor()),
                (3, CborValue::UInt(u64::from(*limit))),
            ]),
            Self::Grep { path, pattern, glob, literal, ignore_case, limit } => {
                CborValue::Map(vec![
                    (1, CborValue::Text("grep".into())),
                    (2, path.cbor()),
                    (3, CborValue::Text(pattern.clone())),
                    (4, glob.clone().map(CborValue::Text).unwrap_or(CborValue::Null)),
                    (5, CborValue::Bool(*literal)),
                    (6, CborValue::Bool(*ignore_case)),
                    (7, CborValue::UInt(u64::from(*limit))),
                ])
            }
            Self::Find { path, pattern, limit } => CborValue::Map(vec![
                (1, CborValue::Text("find".into())),
                (2, path.cbor()),
                (3, CborValue::Text(pattern.clone())),
                (4, CborValue::UInt(u64::from(*limit))),
            ]),
            Self::Exec { argv, cwd, environment, user_initiated } => {
                if argv.is_empty() {
                    return Err(BoundaryError::InvalidOperation("exec argv is empty".into()));
                }
                let env = environment
                    .iter()
                    .map(|(key, value)| {
                        CborValue::Array(vec![
                            CborValue::Text(key.clone()),
                            CborValue::Text(value.clone()),
                        ])
                    })
                    .collect();
                CborValue::Map(vec![
                    (1, CborValue::Text("exec".into())),
                    (2, CborValue::Array(argv.iter().cloned().map(CborValue::Text).collect())),
                    (3, cwd.cbor()),
                    (4, CborValue::Array(env)),
                    (5, CborValue::Bool(*user_initiated)),
                ])
            }
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestedCall {
    pub call_id: String,
    pub client_session_id: String,
    pub client_epoch: String,
    pub lease_id: String,
    pub timeout_ms: u64,
    pub expected_workspace_generation: u64,
    pub operation: Operation,
}

impl RequestedCall {
    pub fn cbor(&self) -> Result<CborValue, BoundaryError> {
        if self.call_id.is_empty()
            || self.client_session_id.is_empty()
            || self.client_epoch.is_empty()
            || self.lease_id.is_empty()
            || self.expected_workspace_generation == 0
        {
            return Err(BoundaryError::InvalidOperation(
                "request identities and generation must be non-empty".into(),
            ));
        }
        Ok(CborValue::Map(vec![
            (1, CborValue::Text(self.call_id.clone())),
            (2, CborValue::Text(self.client_session_id.clone())),
            (3, CborValue::Text(self.client_epoch.clone())),
            (4, CborValue::Text(self.lease_id.clone())),
            (5, CborValue::UInt(self.timeout_ms)),
            (6, CborValue::UInt(self.expected_workspace_generation)),
            (7, self.operation.cbor()?),
        ]))
    }

    pub fn digest(&self) -> Result<[u8; 32], BoundaryError> {
        domain_separated_digest("pi-tool-boundary/requested-call/v1", &self.cbor()?)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyLimits {
    pub allowed_tools: BTreeSet<String>,
    pub user_bash: bool,
    pub vcpus: u32,
    pub memory_bytes: u64,
    pub output_bytes: u64,
    pub retain_failed_workspace: bool,
    pub landlock_strength: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyRelation {
    Equal,
    Narrower,
    Broader,
}

pub fn compare_policy(proposal: &PolicyLimits, grant: &PolicyLimits) -> PolicyRelation {
    let broader = !proposal.allowed_tools.is_subset(&grant.allowed_tools)
        || (proposal.user_bash && !grant.user_bash)
        || proposal.vcpus > grant.vcpus
        || proposal.memory_bytes > grant.memory_bytes
        || proposal.output_bytes > grant.output_bytes
        || (proposal.retain_failed_workspace && !grant.retain_failed_workspace)
        || proposal.landlock_strength > grant.landlock_strength;
    if broader {
        return PolicyRelation::Broader;
    }
    if proposal == grant {
        PolicyRelation::Equal
    } else {
        PolicyRelation::Narrower
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_vectors_match_typescript() {
        let value = CborValue::Map(vec![
            (1, CborValue::Text("read".into())),
            (2, CborValue::Array(vec![CborValue::Text("src".into()), CborValue::Text("main.ts".into())])),
            (3, CborValue::UInt(0)),
            (4, CborValue::UInt(200)),
        ]);
        assert_eq!(
            hex::encode(encode_deterministic_cbor(&value).unwrap()),
            "a4016472656164028263737263676d61696e2e747303000418c8"
        );
    }

    #[test]
    fn request_digest_changes_with_write_content() {
        let base = |content: &[u8]| RequestedCall {
            call_id: "call-1".into(),
            client_session_id: "session-1".into(),
            client_epoch: "epoch-1".into(),
            lease_id: "lease-1".into(),
            timeout_ms: 1_000,
            expected_workspace_generation: 1,
            operation: Operation::Write {
                path: WorkspacePath::parse("a.txt", false).unwrap(),
                content: content.to_vec(),
            },
        };
        assert_ne!(base(b"x").digest().unwrap(), base(b"y").digest().unwrap());
    }

    #[test]
    fn operation_effect_and_durability_are_derived() {
        let operation = Operation::Exec {
            argv: vec!["true".into()],
            cwd: WorkspacePath::parse(".", true).unwrap(),
            environment: BTreeMap::new(),
            user_initiated: false,
        };
        assert_eq!(operation.effect(), EffectClass::ArbitraryProcess);
        assert_eq!(operation.durability(), DurabilityClass::D1WorkspaceEffect);
    }

    #[test]
    fn policy_subset_is_mechanical() {
        let grant = PolicyLimits {
            allowed_tools: ["read", "write"].into_iter().map(String::from).collect(),
            user_bash: false,
            vcpus: 8,
            memory_bytes: 16,
            output_bytes: 16,
            retain_failed_workspace: true,
            landlock_strength: 1,
        };
        let proposal = PolicyLimits {
            allowed_tools: ["read"].into_iter().map(String::from).collect(),
            user_bash: false,
            vcpus: 4,
            memory_bytes: 8,
            output_bytes: 8,
            retain_failed_workspace: false,
            landlock_strength: 0,
        };
        assert_eq!(compare_policy(&proposal, &grant), PolicyRelation::Narrower);
    }
}
