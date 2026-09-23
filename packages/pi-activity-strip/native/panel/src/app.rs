use crate::card_view::CardView;
use crate::protocol::{Card, ViewMessage, demo_view, emit, emit_error, emit_ready};
use crate::runtime::{apply_theme, duplicate_labels, install_css, now_ms, start_input_reader};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
use relm4::gtk;
use relm4::gtk::glib;
use relm4::gtk::prelude::*;
use relm4::{Component, ComponentParts, ComponentSender};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const COMPACT_HEIGHT: i32 = 84;
/// The ribbon sits on the same rhythm as tiled windows, so it reads as one of them rather than as
/// a bar bolted to the top edge. Matches `gaps` in the compositor's layout.
const OUTER_MARGIN: i32 = 8;
const EXPANDED_HEIGHT: i32 = 276;
const ORDER_REFRESH_MS: i64 = 15_000;
const BRAND_WIDTH: i32 = 196;

pub struct AppInit {
    pub demo: bool,
    pub click_through: bool,
}

pub struct App {
    cards: HashMap<String, CardView>,
    data: HashMap<String, Card>,
    order: Vec<String>,
    focused_card_id: Option<String>,
    hovered: HashSet<String>,
    keyboard_focused: Option<String>,
    keyboard_active: bool,
    open_card_id: Option<String>,
    revision: u64,
    visible: bool,
    next_order_refresh_at: i64,
    collapse_generation: u64,
    interactive: bool,
}

#[derive(Debug)]
pub enum AppMsg {
    View(ViewMessage),
    Theme(String),
    Tick,
    Hover(String, bool),
    Focus(String, bool),
    Navigate(String, i32, bool),
    Activate(String),
    ActivationResult(String, bool, String),
    FocusStrip,
    Collapse,
    CollapseIf(u64),
    WindowInactive,
    ParentGone,
    InputError(String),
}

#[relm4::component(pub)]
impl Component for App {
    type Init = AppInit;
    type Input = AppMsg;
    type Output = ();
    type CommandOutput = ();

    view! {
        root = gtk::Window {
            set_title: Some("Pi Activity Strip"),
            set_decorated: false,
            set_resizable: true,
            set_default_size: (1, COMPACT_HEIGHT),
            set_visible: false,

            #[name = "body"]
            gtk::Box {
                add_css_class: "band",
                set_orientation: gtk::Orientation::Horizontal,
                set_spacing: 0,

                // "You are here": the project and folder of the focused window. The labels fill a
                // fixed width instead of sizing it, so moving focus never shifts the cards beside it.
                #[name = "brand"]
                gtk::Box {
                    add_css_class: "brand",
                    set_orientation: gtk::Orientation::Vertical,
                    set_width_request: BRAND_WIDTH,
                    set_valign: gtk::Align::Center,

                    #[name = "eyebrow"]
                    gtk::Label {
                        add_css_class: "brand-eyebrow",
                        set_label: "π ACTIVITY",
                        set_halign: gtk::Align::Fill,
                        set_xalign: 0.0,
                        set_ellipsize: gtk::pango::EllipsizeMode::End,
                        set_max_width_chars: 1,
                    },
                    #[name = "title"]
                    gtk::Label {
                        add_css_class: "brand-title",
                        set_label: "Sessions",
                        set_halign: gtk::Align::Fill,
                        set_xalign: 0.0,
                        set_ellipsize: gtk::pango::EllipsizeMode::End,
                        set_max_width_chars: 1,
                    },
                    // Ellipsized at the start: the deepest folder is the part that tells you where you are.
                    #[name = "meta"]
                    gtk::Label {
                        add_css_class: "meta",
                        set_label: "Waiting for sessions…",
                        set_halign: gtk::Align::Fill,
                        set_xalign: 0.0,
                        set_ellipsize: gtk::pango::EllipsizeMode::Start,
                        set_max_width_chars: 1,
                    },
                },

                #[name = "scroller"]
                gtk::ScrolledWindow {
                    add_css_class: "cards-panel",
                    set_hexpand: true,
                    set_vexpand: true,
                    set_policy: (gtk::PolicyType::Automatic, gtk::PolicyType::Never),
                    #[name = "cards_box"]
                    gtk::Box {
                        set_orientation: gtk::Orientation::Horizontal,
                        set_spacing: 8,
                        set_halign: gtk::Align::Start,
                        set_valign: gtk::Align::Center,
                        set_margin_top: 8,
                        set_margin_bottom: 8,
                    }
                }
            }
        }
    }

    fn init(
        init: Self::Init,
        root: Self::Root,
        sender: ComponentSender<Self>,
    ) -> ComponentParts<Self> {
        install_css();
        if !gtk4_layer_shell::is_supported() {
            emit_error("Wayland compositor does not support wlr-layer-shell.");
            std::process::exit(1);
        }
        root.init_layer_shell();
        root.set_namespace(Some("pi-activity-strip"));
        root.set_layer(Layer::Top);
        root.set_anchor(Edge::Top, true);
        root.set_anchor(Edge::Left, true);
        root.set_anchor(Edge::Right, true);
        root.set_margin(Edge::Top, OUTER_MARGIN);
        root.set_margin(Edge::Left, OUTER_MARGIN);
        root.set_margin(Edge::Right, OUTER_MARGIN);
        root.set_exclusive_zone(COMPACT_HEIGHT);
        root.set_keyboard_mode(KeyboardMode::None);
        if init.click_through {
            root.connect_realize(|window| {
                if let Some(surface) = window.surface() {
                    surface.set_input_region(Some(&gtk::cairo::Region::create()));
                }
            });
        }

        let tx = sender.input_sender().clone();
        root.connect_is_active_notify(move |window| {
            if !window.is_active() {
                let _ = tx.send(AppMsg::WindowInactive);
            }
        });

        let model = App {
            cards: HashMap::new(),
            data: HashMap::new(),
            order: Vec::new(),
            focused_card_id: None,
            hovered: HashSet::new(),
            keyboard_focused: None,
            keyboard_active: false,
            open_card_id: None,
            revision: 0,
            visible: false,
            next_order_refresh_at: 0,
            collapse_generation: 0,
            interactive: !init.click_through,
        };
        let widgets = view_output!();
        widgets.body.set_can_target(!init.click_through);

        let tick_tx = sender.input_sender().clone();
        glib::timeout_add_seconds_local(1, move || {
            let _ = tick_tx.send(AppMsg::Tick);
            glib::ControlFlow::Continue
        });

        if init.demo {
            let _ = sender.input_sender().send(AppMsg::View(demo_view()));
        } else {
            start_input_reader(sender.input_sender().clone());
        }
        emit_ready();
        ComponentParts { model, widgets }
    }

    fn update_with_view(
        &mut self,
        widgets: &mut Self::Widgets,
        message: Self::Input,
        sender: ComponentSender<Self>,
        root: &Self::Root,
    ) {
        match message {
            AppMsg::View(view) => self.apply_view(widgets, root, &sender, view),
            AppMsg::Theme(definitions) => apply_theme(&definitions),
            AppMsg::Tick => {
                if now_ms() >= self.next_order_refresh_at {
                    self.regroup();
                    self.reorder_widgets(&widgets.cards_box);
                    self.next_order_refresh_at = now_ms() + ORDER_REFRESH_MS;
                }
                self.refresh_cards();
                self.update_brand(widgets);
            }
            AppMsg::Hover(id, entered) => {
                if entered {
                    self.hovered.insert(id);
                } else {
                    self.hovered.remove(&id);
                }
                self.reconcile_engagement(widgets, root, &sender);
            }
            AppMsg::Focus(id, entered) => {
                if entered && self.keyboard_active {
                    self.keyboard_focused = Some(id);
                } else if !entered && self.keyboard_focused.as_deref() == Some(id.as_str()) {
                    self.keyboard_focused = None;
                }
                self.reconcile_engagement(widgets, root, &sender);
            }
            AppMsg::Navigate(id, direction, manual) => {
                if self.keyboard_active {
                    self.navigate(&widgets.cards_box, &id, direction, manual);
                }
            }
            AppMsg::Activate(id) => {
                emit(json!({ "protocol": 1, "type": "activate", "cardId": id }));
                if self.keyboard_active {
                    self.end_engagement();
                    root.set_keyboard_mode(KeyboardMode::None);
                    self.apply_expansion(widgets, root, None);
                }
            }
            AppMsg::ActivationResult(id, ok, message) => {
                if let Some(card) = self.cards.get(&id) {
                    card.set_activation(ok, &message);
                }
            }
            AppMsg::FocusStrip => {
                if self.visible && self.interactive {
                    if self.keyboard_active {
                        self.end_engagement();
                        root.set_keyboard_mode(KeyboardMode::None);
                        self.apply_expansion(widgets, root, None);
                    } else {
                        self.keyboard_active = true;
                        self.hovered.clear();
                        self.keyboard_focused = self.order.first().cloned();
                        root.set_keyboard_mode(KeyboardMode::Exclusive);
                        root.present();
                        let focus_grabbed = self
                            .keyboard_focused
                            .as_ref()
                            .and_then(|id| self.cards.get(id))
                            .is_some_and(|first| first.root.grab_focus());
                        if focus_grabbed {
                            self.reconcile_engagement(widgets, root, &sender);
                            emit(
                                json!({ "protocol": 1, "type": "keyboard-active", "active": true }),
                            );
                        } else {
                            self.end_engagement();
                            root.set_keyboard_mode(KeyboardMode::None);
                            self.apply_expansion(widgets, root, None);
                        }
                    }
                }
            }
            AppMsg::Collapse | AppMsg::WindowInactive => {
                self.end_engagement();
                root.set_keyboard_mode(KeyboardMode::None);
                self.apply_expansion(widgets, root, None);
            }
            AppMsg::CollapseIf(generation) => {
                if generation == self.collapse_generation
                    && self.hovered.is_empty()
                    && (!self.keyboard_active || self.keyboard_focused.is_none())
                {
                    self.apply_expansion(widgets, root, None);
                }
            }
            AppMsg::InputError(message) => emit_error(message),
            AppMsg::ParentGone => root.close(),
        }
    }
}

fn navigation_target(index: usize, direction: i32, len: usize) -> Option<usize> {
    if len == 0 {
        return None;
    }
    Some((index as i64 + direction as i64).rem_euclid(len as i64) as usize)
}

fn move_order_item(order: &mut Vec<String>, index: usize, target: usize) {
    let moved = order.remove(index);
    order.insert(target, moved);
}

struct BrandCounts {
    active: usize,
    settled: usize,
}

#[derive(Debug, PartialEq)]
struct BrandText {
    eyebrow: String,
    title: String,
    meta: String,
}

/// The brand block names the focused window's project and folder. Without a focused agent window
/// it falls back to the ribbon's own name and the session counts.
fn brand_text(focused: Option<&Card>, counts: &BrandCounts, home: &str) -> BrandText {
    let summary = format!("{} active · {} settled", counts.active, counts.settled);
    match focused {
        Some(card) if !card.repo_label.is_empty() || !card.cwd.is_empty() => BrandText {
            eyebrow: format!("π {}", summary.to_uppercase()),
            title: if card.repo_label.is_empty() {
                short_path(&card.cwd, home)
            } else {
                card.repo_label.clone()
            },
            meta: if card.cwd.is_empty() {
                "—".to_owned()
            } else {
                short_path(&card.cwd, home)
            },
        },
        _ => BrandText {
            eyebrow: "π ACTIVITY".to_owned(),
            title: "Sessions".to_owned(),
            meta: summary,
        },
    }
}

/// A path with the home directory written as `~`.
fn short_path(path: &str, home: &str) -> String {
    let home = home.trim_end_matches('/');
    if home.is_empty() {
        return path.to_owned();
    }
    match path.strip_prefix(home) {
        Some("") => "~".to_owned(),
        Some(rest) if rest.starts_with('/') => format!("~{rest}"),
        _ => path.to_owned(),
    }
}

fn engaged_card_id(
    hovered: &HashSet<String>,
    keyboard_active: bool,
    keyboard_focused: &Option<String>,
) -> Option<String> {
    if keyboard_active {
        keyboard_focused.clone()
    } else {
        hovered.iter().next().cloned()
    }
}

impl App {
    fn end_engagement(&mut self) {
        let was_keyboard_active = self.keyboard_active;
        self.hovered.clear();
        self.keyboard_focused = None;
        self.keyboard_active = false;
        self.collapse_generation += 1;
        if was_keyboard_active {
            emit(json!({ "protocol": 1, "type": "keyboard-active", "active": false }));
        }
    }

    fn apply_view(
        &mut self,
        widgets: &mut AppWidgets,
        root: &gtk::Window,
        sender: &ComponentSender<Self>,
        view: ViewMessage,
    ) {
        if view.protocol != 1 || view.message_type != "view" || view.revision <= self.revision {
            return;
        }
        self.revision = view.revision;
        self.focused_card_id = view.focused_card_id;
        let incoming_order: Vec<_> = view
            .sessions
            .iter()
            .map(|card| card.id().to_owned())
            .collect();
        self.data = view
            .sessions
            .into_iter()
            .map(|card| (card.id().to_owned(), card))
            .collect();
        self.order.retain(|id| self.data.contains_key(id));
        for id in incoming_order {
            if !self.order.contains(&id) {
                self.order.push(id);
            }
        }
        self.hovered.retain(|id| self.data.contains_key(id));
        let keyboard_card_removed = self.keyboard_active
            && self
                .keyboard_focused
                .as_ref()
                .is_some_and(|id| !self.data.contains_key(id));
        if keyboard_card_removed {
            self.keyboard_focused = self.order.first().cloned();
        }
        let open_card_removed = self
            .open_card_id
            .as_ref()
            .is_some_and(|id| !self.data.contains_key(id));
        if self.next_order_refresh_at == 0 {
            self.regroup();
            self.next_order_refresh_at = now_ms() + ORDER_REFRESH_MS;
        }
        self.reconcile_card_widgets(&widgets.cards_box, sender);
        if keyboard_card_removed {
            let focus_grabbed = self
                .keyboard_focused
                .as_ref()
                .and_then(|id| self.cards.get(id))
                .is_some_and(|card| card.root.grab_focus());
            if focus_grabbed {
                self.reconcile_engagement(widgets, root, sender);
            } else {
                self.end_engagement();
                root.set_keyboard_mode(KeyboardMode::None);
                self.apply_expansion(widgets, root, None);
            }
        }
        if open_card_removed {
            self.apply_expansion(widgets, root, None);
        }
        self.reorder_widgets(&widgets.cards_box);
        self.refresh_cards();
        self.update_brand(widgets);

        let should_show = view.visible && !self.data.is_empty();
        if should_show != self.visible {
            self.visible = should_show;
            if should_show {
                root.set_exclusive_zone(COMPACT_HEIGHT);
                root.present();
            } else {
                self.end_engagement();
                root.set_keyboard_mode(KeyboardMode::None);
                self.apply_expansion(widgets, root, None);
                root.set_exclusive_zone(-1);
                root.set_visible(false);
            }
            emit(
                json!({ "protocol": 1, "type": "visibility-applied", "revision": self.revision, "visible": should_show }),
            );
        }
    }

    fn reconcile_card_widgets(&mut self, parent: &gtk::Box, sender: &ComponentSender<Self>) {
        let removed: Vec<_> = self
            .cards
            .keys()
            .filter(|id| !self.data.contains_key(*id))
            .cloned()
            .collect();
        for id in removed {
            if let Some(card) = self.cards.remove(&id) {
                parent.remove(&card.root);
            }
        }
        for id in &self.order {
            if !self.cards.contains_key(id) {
                let card = CardView::new(id, sender.input_sender());
                parent.append(&card.root);
                self.cards.insert(id.clone(), card);
            }
        }
    }

    fn refresh_cards(&self) {
        let duplicates = duplicate_labels(self.data.values());
        let now = now_ms();
        for (id, view) in &self.cards {
            if let Some(card) = self.data.get(id) {
                view.update(
                    card,
                    self.focused_card_id.as_deref() == Some(id),
                    duplicates.contains(&card.repo_label),
                    now,
                );
                view.set_expanded(self.open_card_id.as_deref() == Some(id));
            }
        }
    }

    fn update_brand(&self, widgets: &AppWidgets) {
        let active = self.data.values().filter(|card| card.active()).count();
        let counts = BrandCounts {
            active,
            settled: self.data.len().saturating_sub(active),
        };
        let focused = self
            .focused_card_id
            .as_ref()
            .and_then(|id| self.data.get(id));
        let home = std::env::var("HOME").unwrap_or_default();
        let brand = brand_text(focused, &counts, &home);
        widgets.eyebrow.set_text(&brand.eyebrow);
        widgets.title.set_text(&brand.title);
        widgets.meta.set_text(&brand.meta);
        widgets.brand.set_tooltip_text(
            focused
                .map(|card| card.cwd.as_str())
                .filter(|cwd| !cwd.is_empty()),
        );
    }

    fn regroup(&mut self) {
        let previous: HashMap<_, _> = self
            .order
            .iter()
            .enumerate()
            .map(|(index, id)| (id.clone(), index))
            .collect();
        self.order.sort_by_key(|id| {
            let card = self.data.get(id);
            let group = match card {
                Some(card) if card.monitoring() => 0,
                Some(card) if card.active() => 1,
                _ => 2,
            };
            (group, previous.get(id).copied().unwrap_or(usize::MAX))
        });
    }

    fn reorder_widgets(&self, parent: &gtk::Box) {
        let mut previous: Option<gtk::Widget> = None;
        for id in &self.order {
            if let Some(card) = self.cards.get(id) {
                parent.reorder_child_after(&card.root, previous.as_ref());
                previous = Some(card.root.clone().upcast());
            }
        }
    }

    fn navigate(&mut self, parent: &gtk::Box, id: &str, direction: i32, manual: bool) {
        let Some(index) = self.order.iter().position(|candidate| candidate == id) else {
            return;
        };
        let Some(target) = navigation_target(index, direction, self.order.len()) else {
            return;
        };
        if manual && target != index {
            move_order_item(&mut self.order, index, target);
            self.reorder_widgets(parent);
            self.next_order_refresh_at = now_ms() + ORDER_REFRESH_MS;
            emit(json!({ "protocol": 1, "type": "moved", "cardId": id, "direction": direction }));
        }
        let focus_id = if manual { id } else { &self.order[target] };
        if let Some(card) = self.cards.get(focus_id) {
            card.root.grab_focus();
        }
    }

    fn reconcile_engagement(
        &mut self,
        widgets: &mut AppWidgets,
        root: &gtk::Window,
        sender: &ComponentSender<Self>,
    ) {
        if let Some(id) =
            engaged_card_id(&self.hovered, self.keyboard_active, &self.keyboard_focused)
        {
            self.collapse_generation += 1;
            self.apply_expansion(widgets, root, Some(id));
            return;
        }
        self.collapse_generation += 1;
        let generation = self.collapse_generation;
        let tx = sender.input_sender().clone();
        glib::timeout_add_local_once(Duration::from_millis(120), move || {
            let _ = tx.send(AppMsg::CollapseIf(generation));
        });
    }

    fn apply_expansion(
        &mut self,
        _widgets: &mut AppWidgets,
        root: &gtk::Window,
        card_id: Option<String>,
    ) {
        if self.open_card_id == card_id {
            return;
        }
        self.open_card_id = card_id;
        let expanded = self.open_card_id.is_some();
        root.set_default_size(
            1,
            if expanded {
                EXPANDED_HEIGHT
            } else {
                COMPACT_HEIGHT
            },
        );
        root.set_exclusive_zone(COMPACT_HEIGHT);
        self.refresh_cards();
        emit(
            json!({ "protocol": 1, "type": "expanded", "expanded": expanded, "cardId": self.open_card_id }),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BrandCounts, brand_text, engaged_card_id, move_order_item, navigation_target, short_path,
    };
    use crate::protocol::Card;
    use std::collections::HashSet;

    fn counts() -> BrandCounts {
        BrandCounts {
            active: 2,
            settled: 3,
        }
    }

    #[test]
    fn brand_names_the_focused_windows_project_and_folder() {
        let card: Card = serde_json::from_value(serde_json::json!({
            "repoLabel": "pi-activity-strip",
            "cwd": "/home/op/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip"
        }))
        .expect("card");
        let brand = brand_text(Some(&card), &counts(), "/home/op");
        assert_eq!(brand.title, "pi-activity-strip");
        assert_eq!(
            brand.meta,
            "~/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip"
        );
        assert_eq!(brand.eyebrow, "π 2 ACTIVE · 3 SETTLED");
    }

    #[test]
    fn brand_falls_back_to_counts_without_a_focused_window() {
        let brand = brand_text(None, &counts(), "/home/op");
        assert_eq!(brand.title, "Sessions");
        assert_eq!(brand.meta, "2 active · 3 settled");

        let unlabelled: Card = serde_json::from_value(serde_json::json!({})).expect("card");
        assert_eq!(
            brand_text(Some(&unlabelled), &counts(), "/home/op").title,
            "Sessions"
        );
    }

    #[test]
    fn short_path_abbreviates_only_the_whole_home_directory() {
        assert_eq!(short_path("/home/op/repo", "/home/op"), "~/repo");
        assert_eq!(short_path("/home/op", "/home/op/"), "~");
        assert_eq!(
            short_path("/home/operator/repo", "/home/op"),
            "/home/operator/repo"
        );
        assert_eq!(short_path("/srv/repo", ""), "/srv/repo");
    }

    #[test]
    fn stale_gtk_focus_does_not_retain_expansion_outside_keyboard_mode() {
        let focused = Some("card-a".to_owned());
        assert_eq!(engaged_card_id(&HashSet::new(), false, &focused), None);
        assert_eq!(engaged_card_id(&HashSet::new(), true, &focused), focused);
    }

    #[test]
    fn pointer_hover_retains_expansion_without_keyboard_mode() {
        let hovered = HashSet::from(["card-a".to_owned()]);
        assert_eq!(
            engaged_card_id(&hovered, false, &Some("card-b".to_owned())),
            Some("card-a".to_owned())
        );
    }

    #[test]
    fn explicit_keyboard_mode_takes_precedence_over_pointer_hover() {
        let hovered = HashSet::from(["card-a".to_owned()]);
        assert_eq!(
            engaged_card_id(&hovered, true, &Some("card-b".to_owned())),
            Some("card-b".to_owned())
        );
    }

    #[test]
    fn keyboard_navigation_wraps_in_both_directions() {
        assert_eq!(navigation_target(0, -1, 4), Some(3));
        assert_eq!(navigation_target(3, 1, 4), Some(0));
        assert_eq!(navigation_target(1, 1, 4), Some(2));
        assert_eq!(navigation_target(0, 1, 0), None);
    }

    #[test]
    fn wrapped_manual_movement_relocates_instead_of_swapping_endpoints() {
        let mut order = vec!["a".into(), "b".into(), "c".into(), "d".into()];
        move_order_item(&mut order, 0, 3);
        assert_eq!(order, ["b", "c", "d", "a"]);
        move_order_item(&mut order, 3, 0);
        assert_eq!(order, ["a", "b", "c", "d"]);
    }
}
