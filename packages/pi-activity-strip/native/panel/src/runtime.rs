use crate::app::AppMsg;
use crate::protocol::{Card, ViewMessage};
use relm4::gtk;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::time::{SystemTime, UNIX_EPOCH};

#[allow(deprecated)]
pub fn install_css() {
    let provider = gtk::CssProvider::new();
    provider.load_from_data(include_str!("style.css"));
    if let Some(display) = gtk::gdk::Display::default() {
        gtk::style_context_add_provider_for_display(
            &display,
            &provider,
            gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
        );
    }
}

pub fn start_input_reader(sender: relm4::Sender<AppMsg>) {
    std::thread::spawn(move || {
        for line in BufReader::new(std::io::stdin()).lines() {
            match line {
                Ok(line) if !line.trim().is_empty() => consume_line(&sender, &line),
                Ok(_) => {}
                Err(error) => {
                    let _ = sender.send(AppMsg::InputError(format!("panel input failed: {error}")));
                    break;
                }
            }
        }
        let _ = sender.send(AppMsg::ParentGone);
    });
}

fn consume_line(sender: &relm4::Sender<AppMsg>, line: &str) {
    let value = match serde_json::from_str::<serde_json::Value>(line) {
        Ok(value) => value,
        Err(error) => {
            let _ = sender.send(AppMsg::InputError(format!(
                "invalid panel message: {error}"
            )));
            return;
        }
    };
    match value.get("type").and_then(|kind| kind.as_str()) {
        Some("view") => match serde_json::from_value::<ViewMessage>(value) {
            Ok(view) => {
                let _ = sender.send(AppMsg::View(view));
            }
            Err(error) => {
                let _ = sender.send(AppMsg::InputError(format!("invalid view message: {error}")));
            }
        },
        Some("focus-strip") => {
            let _ = sender.send(AppMsg::FocusStrip);
        }
        Some("collapse") => {
            let _ = sender.send(AppMsg::Collapse);
        }
        Some("activation-result") => {
            let card_id = value
                .get("cardId")
                .and_then(|item| item.as_str())
                .unwrap_or_default()
                .to_owned();
            let ok = value
                .get("ok")
                .and_then(|item| item.as_bool())
                .unwrap_or(false);
            let message = value
                .get("message")
                .and_then(|item| item.as_str())
                .unwrap_or(if ok {
                    "Focused Ghostty window."
                } else {
                    "Focus failed; nothing moved."
                })
                .to_owned();
            let _ = sender.send(AppMsg::ActivationResult(card_id, ok, message));
        }
        Some(kind) => {
            let _ = sender.send(AppMsg::InputError(format!(
                "unsupported panel message: {kind}"
            )));
        }
        None => {
            let _ = sender.send(AppMsg::InputError("panel message type is required".into()));
        }
    }
}

pub fn duplicate_labels<'a>(cards: impl Iterator<Item = &'a Card>) -> HashSet<String> {
    let mut counts = HashMap::new();
    for card in cards {
        *counts.entry(card.repo_label.clone()).or_insert(0usize) += 1;
    }
    counts
        .into_iter()
        .filter_map(|(label, count)| (count > 1).then_some(label))
        .collect()
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
