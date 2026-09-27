use crate::card_view::CardView;
use crate::directory_view::{
    DirectoryView, JumpChoice, is_query_char, jump_choice, push_query_char,
};
use crate::protocol::{Card, ViewMessage, WindowEntry, demo_view, emit, emit_error, emit_ready};
use crate::runtime::{apply_theme, duplicate_labels, install_css, now_ms, start_input_reader};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
use relm4::gtk;
use relm4::gtk::gdk;
use relm4::gtk::glib;
use relm4::gtk::prelude::*;
use relm4::{Component, ComponentParts, ComponentSender};
use serde_json::json;
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use std::time::Duration;

const COMPACT_HEIGHT: i32 = 84;
/// The ribbon sits on the same rhythm as tiled windows, so it reads as one of them rather than as
/// a bar bolted to the top edge. Matches `gaps` in the compositor's layout.
const OUTER_MARGIN: i32 = 8;
const EXPANDED_HEIGHT: i32 = 276;
const ORDER_REFRESH_MS: i64 = 15_000;
const BRAND_WIDTH: i32 = 196;
/// Grace before a hovered-away window list closes, so crossing the brand's own padding does not
/// close and reopen it.
const DIRECTORY_CLOSE_MS: u64 = 200;
/// Hovering the ribbon takes the keyboard so a window number can be typed at once. Without a digit
/// within this time it is handed back, so a pointer resting on the ribbon cannot keep swallowing
/// what is typed into the window below; a click on the ribbon still takes it again.
const HOVER_GRAB_MS: u64 = 3_000;

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
    directory: DirectoryView,
    windows: Vec<WindowEntry>,
    directory_open: bool,
    directory_hovered: bool,
    /// The pointer is over the brand column: it expands the ribbon like a card does, showing the
    /// list at full height.
    brand_hovered: bool,
    /// Counts brand hover changes, so a leave only collapses if the pointer did not come back
    /// (or land on a card) within the collapse grace.
    brand_generation: u64,
    directory_generation: u64,
    /// Opened by hovering the brand, so leaving it closes the list; a list opened by a typed
    /// digit in keyboard mode stays open until it jumps or is dismissed.
    directory_opened_by_hover: bool,
    /// Counts list openings, so a jump or activation result only acts on the list that asked.
    directory_session: u64,
    pending_request: Option<PendingRequest>,
    /// The list changed the keyboard mode and must set it back when it closes.
    directory_owns_keyboard: bool,
    /// The keyboard was taken on hover and is still held. Released when the pointer leaves, and
    /// after HOVER_GRAB_MS without a key while nothing is typed.
    hover_grab: bool,
    /// Counts grab timers, so only the latest one (re-armed on every key) can release the grab.
    grab_generation: u64,
    /// Whether the ribbon has keyboard focus right now: after a click on the list, or in
    /// keyboard mode. Hovering alone never takes the keyboard from the window being typed into.
    window_active: bool,
    query: String,
    /// Read by the window's key controller: which keys belong to the window list right now.
    key_capture: Rc<Cell<KeyCapture>>,
    /// Read by the key controller: the keyboard is held only because of hover, so any key that is
    /// not part of a search means the typing was meant for the window below.
    hover_guard: Rc<Cell<bool>>,
}

/// Keys the window list takes before any card sees them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KeyCapture {
    None,
    /// Keyboard mode on the cards: a typed name or number character opens the list; Enter and
    /// Escape stay with the cards.
    Digits,
    /// The list is open with nothing typed: digits, Backspace and Escape are its own; Enter still
    /// reaches the focused card.
    List,
    /// The list is open with digits typed: Enter jumps.
    ListTyped,
}

/// What the open list asked the controller for, so only that answer acts on it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingRequest {
    session: u64,
    target: RequestTarget,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RequestTarget {
    Card(String),
    Window(i64),
}

#[derive(Debug)]
pub enum DirectoryKey {
    /// A letter, digit, `-`, `_` or `.` of a name or window number.
    Char(char),
    Backspace,
    Enter,
    Escape,
    /// A key that cannot be part of a search, pressed while only hover holds the keyboard.
    Interrupt,
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
    WindowActive(bool),
    ParentGone,
    InputError(String),
    DirectoryHover(bool),
    BrandHover(bool),
    BrandSettle(u64),
    DirectoryCloseIf(u64),
    DirectoryGrabExpired(u64),
    DirectoryKey(DirectoryKey),
    DirectoryActivate(String),
    JumpResult(i64, bool, String),
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
                    // Set explicitly so the window list's expanding rows cannot widen the brand
                    // and push the cards aside.
                    set_hexpand: false,
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
            let _ = tx.send(AppMsg::WindowActive(window.is_active()));
        });

        let directory = DirectoryView::new(sender.input_sender());
        let key_capture = Rc::new(Cell::new(KeyCapture::None));
        let hover_guard = Rc::new(Cell::new(false));
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
            directory,
            windows: Vec::new(),
            directory_open: false,
            directory_hovered: false,
            brand_hovered: false,
            brand_generation: 0,
            directory_generation: 0,
            directory_opened_by_hover: false,
            directory_session: 0,
            pending_request: None,
            directory_owns_keyboard: false,
            hover_grab: false,
            grab_generation: 0,
            window_active: false,
            query: String::new(),
            key_capture: Rc::clone(&key_capture),
            hover_guard: Rc::clone(&hover_guard),
        };
        let widgets = view_output!();
        widgets.body.set_can_target(!init.click_through);
        widgets.brand.append(&model.directory.root);

        // Hovering anywhere on the ribbon opens the window list in the brand column.
        let hover = gtk::EventControllerMotion::new();
        let tx = sender.input_sender().clone();
        hover.connect_enter(move |_, _, _| {
            let _ = tx.send(AppMsg::DirectoryHover(true));
        });
        let tx = sender.input_sender().clone();
        hover.connect_leave(move |_| {
            let _ = tx.send(AppMsg::DirectoryHover(false));
        });
        widgets.body.add_controller(hover);

        let brand_hover = gtk::EventControllerMotion::new();
        let tx = sender.input_sender().clone();
        brand_hover.connect_enter(move |_, _, _| {
            let _ = tx.send(AppMsg::BrandHover(true));
        });
        let tx = sender.input_sender().clone();
        brand_hover.connect_leave(move |_| {
            let _ = tx.send(AppMsg::BrandHover(false));
        });
        widgets.brand.add_controller(brand_hover);

        // Captured before any card sees it, and only while the list (or keyboard mode) is live:
        // see `directory_key` for which keys belong to the list in which state.
        let keys = gtk::EventControllerKey::new();
        keys.set_propagation_phase(gtk::PropagationPhase::Capture);
        let tx = sender.input_sender().clone();
        keys.connect_key_pressed(move |_, key, _, modifiers| {
            let chord = is_chord(modifiers);
            let message = match directory_key(key_capture.get(), key, chord) {
                Some(message) => message,
                None if hover_guard.get() && !is_modifier_key(key) => DirectoryKey::Interrupt,
                None => return glib::Propagation::Proceed,
            };
            let _ = tx.send(AppMsg::DirectoryKey(message));
            glib::Propagation::Stop
        });
        widgets.root.add_controller(keys);

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
                    let focused_at = self.focused_position();
                    self.regroup();
                    self.reorder_widgets(&widgets.cards_box);
                    // Only when regrouping moved the focused card: a row the operator scrolled
                    // by hand stays where they left it.
                    if self.focused_position() != focused_at {
                        self.scroll_focused_into_view(widgets);
                    }
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
                // Focus is moving to that card's window, so the ribbon must hold nothing: not
                // keyboard mode, and not the hover grab that clicking inside the ribbon implies.
                if self.keyboard_active {
                    self.leave_keyboard_mode(widgets, root);
                } else {
                    self.close_directory(widgets, root);
                }
            }
            AppMsg::ActivationResult(id, ok, message) => {
                if let Some(card) = self.cards.get(&id) {
                    card.set_activation(ok, &message);
                }
                if self.take_own_request(&RequestTarget::Card(id)) {
                    if ok {
                        self.finish_directory_jump(widgets, root);
                    } else {
                        self.directory.set_status(&message);
                    }
                }
            }
            AppMsg::FocusStrip => {
                if self.visible && self.interactive {
                    if self.keyboard_active {
                        self.leave_keyboard_mode(widgets, root);
                    } else {
                        self.keyboard_active = true;
                        // Keyboard mode now holds the keyboard, whoever opened the list, and no
                        // hover timeout may hand it back.
                        self.directory_owns_keyboard = false;
                        self.hover_grab = false;
                        self.sync_key_capture();
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
                            self.leave_keyboard_mode(widgets, root);
                        }
                    }
                }
            }
            AppMsg::Collapse => {
                self.leave_keyboard_mode(widgets, root);
            }
            AppMsg::WindowActive(active) => {
                self.window_active = active;
                if active {
                    // Only the hint changes. Rebuilding the rows here would replace the very row
                    // whose click just handed over the keyboard, and swallow that click.
                    self.refresh_directory_status();
                } else if self.keyboard_active {
                    // Keyboard mode lost the keyboard to another window: leave it entirely.
                    self.leave_keyboard_mode(widgets, root);
                } else if !self.directory_hovered {
                    // A click elsewhere dismisses a clicked-into list. Hover expansion of cards is
                    // pointer business and is left alone.
                    self.close_directory(widgets, root);
                } else {
                    // Still hovered but no longer typing (the hover grab ran out): say so.
                    self.refresh_directory_status();
                }
            }
            AppMsg::BrandHover(entered) => {
                self.brand_hovered = entered;
                self.brand_generation += 1;
                if entered {
                    self.resize(root);
                    self.sync_directory_layout(widgets);
                } else {
                    // Collapse only after the same grace as a card, so crossing from the brand to
                    // a card does not flicker the ribbon down and up again.
                    self.reconcile_engagement(widgets, root, &sender);
                    let generation = self.brand_generation;
                    let tx = sender.input_sender().clone();
                    glib::timeout_add_local_once(Duration::from_millis(120), move || {
                        let _ = tx.send(AppMsg::BrandSettle(generation));
                    });
                }
            }
            AppMsg::BrandSettle(generation) => {
                if generation == self.brand_generation {
                    self.resize(root);
                    self.sync_directory_layout(widgets);
                }
            }
            AppMsg::CollapseIf(generation) => {
                if generation == self.collapse_generation
                    && self.hovered.is_empty()
                    && !self.brand_hovered
                    && (!self.keyboard_active || self.keyboard_focused.is_none())
                {
                    self.apply_expansion(widgets, root, None);
                }
            }
            AppMsg::InputError(message) => emit_error(message),
            AppMsg::DirectoryHover(entered) => {
                self.directory_hovered = entered;
                self.directory_generation += 1;
                if entered {
                    self.open_directory(widgets, root, true);
                    // Also on re-entry within the close grace: the grab and its timer start over.
                    if self.take_hover_grab(root) {
                        self.arm_grab_timer(&sender);
                    }
                } else {
                    // Hovering is the only reason the ribbon holds the keyboard: leaving returns it.
                    self.release_hover_grab(root);
                    let generation = self.directory_generation;
                    let tx = sender.input_sender().clone();
                    glib::timeout_add_local_once(
                        Duration::from_millis(DIRECTORY_CLOSE_MS),
                        move || {
                            let _ = tx.send(AppMsg::DirectoryCloseIf(generation));
                        },
                    );
                }
            }
            AppMsg::DirectoryGrabExpired(generation) => {
                if generation == self.grab_generation && self.query.is_empty() {
                    self.release_hover_grab(root);
                }
            }
            AppMsg::DirectoryCloseIf(generation) => {
                if generation == self.directory_generation
                    && !self.directory_hovered
                    && self.directory_opened_by_hover
                {
                    self.close_directory(widgets, root);
                }
            }
            AppMsg::DirectoryKey(key) => {
                // Every key keeps a hover grab alive for another HOVER_GRAB_MS; the grab is only
                // released idle and empty, never mid-number.
                if self.hover_grab {
                    self.arm_grab_timer(&sender);
                }
                self.handle_directory_key(widgets, root, key);
            }
            AppMsg::DirectoryActivate(card_id) => {
                self.pending_request = Some(PendingRequest {
                    session: self.directory_session,
                    target: RequestTarget::Card(card_id.clone()),
                });
                self.directory.set_status("Opening…");
                emit(json!({ "protocol": 1, "type": "activate", "cardId": card_id }));
            }
            AppMsg::JumpResult(window_id, ok, message) => {
                if self.take_own_request(&RequestTarget::Window(window_id)) {
                    if ok {
                        // The jumped-to window must get the keyboard back at once.
                        self.finish_directory_jump(widgets, root);
                    } else {
                        self.directory.set_status(&message);
                    }
                }
            }
            AppMsg::ParentGone => root.close(),
        }
    }
}

/// The scroll offset that shows the span `start..end` with the least movement: unchanged when it
/// is already fully visible, otherwise just far enough to bring its nearer edge into view.
fn scroll_to_show(value: f64, page: f64, start: f64, end: f64) -> f64 {
    if start < value {
        start
    } else if end > value + page {
        (end - page).min(start)
    } else {
        value
    }
}

/// Whether a result for `target` answers the request the list opened as `session` is waiting on.
fn answers_request(pending: Option<&PendingRequest>, session: u64, target: &RequestTarget) -> bool {
    pending.is_some_and(|request| request.session == session && &request.target == target)
}

/// Ctrl, Alt, Super or Meta held: a shortcut, not typing. Shift is typing (capital letters).
fn is_chord(modifiers: gdk::ModifierType) -> bool {
    modifiers.intersects(
        gdk::ModifierType::CONTROL_MASK
            | gdk::ModifierType::ALT_MASK
            | gdk::ModifierType::SUPER_MASK
            | gdk::ModifierType::META_MASK,
    )
}

/// A modifier pressed on its own, on the way to a capital letter or a chord: neither search input
/// nor a sign that the typing is meant elsewhere.
fn is_modifier_key(key: gdk::Key) -> bool {
    matches!(
        key,
        gdk::Key::Shift_L
            | gdk::Key::Shift_R
            | gdk::Key::Control_L
            | gdk::Key::Control_R
            | gdk::Key::Alt_L
            | gdk::Key::Alt_R
            | gdk::Key::Super_L
            | gdk::Key::Super_R
            | gdk::Key::Meta_L
            | gdk::Key::Meta_R
            | gdk::Key::ISO_Level3_Shift
            | gdk::Key::Caps_Lock
    )
}

/// The window-list key a press means under the current capture, if it belongs to the list at all.
fn directory_key(capture: KeyCapture, key: gdk::Key, chord: bool) -> Option<DirectoryKey> {
    // Ctrl, Alt and Super combinations are shortcuts, never search characters.
    if chord {
        return None;
    }
    let typed = key
        .to_unicode()
        .filter(|character| is_query_char(*character));
    match capture {
        KeyCapture::None => None,
        KeyCapture::Digits => typed.map(DirectoryKey::Char),
        KeyCapture::List | KeyCapture::ListTyped => match key {
            gdk::Key::BackSpace => Some(DirectoryKey::Backspace),
            gdk::Key::Return | gdk::Key::KP_Enter if capture == KeyCapture::ListTyped => {
                Some(DirectoryKey::Enter)
            }
            gdk::Key::Escape => Some(DirectoryKey::Escape),
            _ => typed.map(DirectoryKey::Char),
        },
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
        self.sync_key_capture();
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
        let focus_moved = self.focused_card_id != view.focused_card_id;
        self.focused_card_id = view.focused_card_id;
        if self.windows != view.windows {
            self.windows = view.windows;
            self.render_directory();
        }
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
                self.leave_keyboard_mode(widgets, root);
            }
        }
        if open_card_removed {
            self.apply_expansion(widgets, root, None);
        }
        self.reorder_widgets(&widgets.cards_box);
        self.refresh_cards();
        self.update_brand(widgets);
        if focus_moved {
            self.scroll_focused_into_view(widgets);
        }

        let should_show = view.visible && !self.data.is_empty();
        if should_show != self.visible {
            self.visible = should_show;
            if should_show {
                root.set_exclusive_zone(COMPACT_HEIGHT);
                root.present();
            } else {
                self.leave_keyboard_mode(widgets, root);
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
        widgets: &mut AppWidgets,
        root: &gtk::Window,
        card_id: Option<String>,
    ) {
        if self.open_card_id == card_id {
            return;
        }
        self.open_card_id = card_id;
        self.refresh_cards();
        self.resize(root);
        self.sync_directory_layout(widgets);
    }

    /// Scroll the card row so the focused window's card is fully in view, as Niri focus moves
    /// between windows. Runs once layout has placed the card, so its position in the row is known.
    fn scroll_focused_into_view(&self, widgets: &AppWidgets) {
        let Some(card) = self
            .focused_card_id
            .as_ref()
            .and_then(|id| self.cards.get(id))
        else {
            return;
        };
        let row = widgets.cards_box.clone();
        let scroller = widgets.scroller.clone();
        // Measured on the second frame after the change: the first one lays the row out, so the
        // card's position is final, and a panel that is not shown yet simply waits until it is.
        let frames = Cell::new(0u8);
        card.root.add_tick_callback(move |card, _clock| {
            frames.set(frames.get() + 1);
            if frames.get() < 2 {
                return glib::ControlFlow::Continue;
            }
            if let Some(origin) = card.compute_point(&row, &gtk::graphene::Point::new(0.0, 0.0)) {
                let start = f64::from(origin.x());
                let end = start + f64::from(card.width());
                let adjustment = scroller.hadjustment();
                adjustment.set_value(scroll_to_show(
                    adjustment.value(),
                    adjustment.page_size(),
                    start,
                    end,
                ));
            }
            glib::ControlFlow::Break
        });
    }

    fn focused_position(&self) -> Option<usize> {
        let id = self.focused_card_id.as_ref()?;
        self.order.iter().position(|candidate| candidate == id)
    }

    /// The ribbon is tall while a card is open (hovered or in keyboard mode), while the pointer is
    /// on the brand column with the list open, or while a typed number needs the list shown.
    fn expanded(&self) -> bool {
        self.open_card_id.is_some()
            || (self.directory_open && (self.brand_hovered || !self.query.is_empty()))
    }

    /// The list fills the brand column, top to bottom, whenever the ribbon is expanded; compact,
    /// it is hidden.
    fn sync_directory_layout(&self, widgets: &AppWidgets) {
        let shown = self.directory_open && self.expanded();
        self.directory.set_visible(shown);
        widgets.brand.set_valign(if shown {
            gtk::Align::Fill
        } else {
            gtk::Align::Center
        });
    }

    fn resize(&self, root: &gtk::Window) {
        let expanded = self.expanded();
        root.set_default_size(
            1,
            if expanded {
                EXPANDED_HEIGHT
            } else {
                COMPACT_HEIGHT
            },
        );
        root.set_exclusive_zone(COMPACT_HEIGHT);
        emit(
            json!({ "protocol": 1, "type": "expanded", "expanded": expanded, "cardId": self.open_card_id }),
        );
    }

    fn sync_key_capture(&self) {
        self.hover_guard
            .set(self.directory_open && self.hover_grab && !self.keyboard_active);
        self.key_capture
            .set(if self.directory_open && !self.query.is_empty() {
                KeyCapture::ListTyped
            } else if self.directory_open {
                KeyCapture::List
            } else if self.keyboard_active {
                KeyCapture::Digits
            } else {
                KeyCapture::None
            });
    }

    fn handle_directory_key(
        &mut self,
        widgets: &mut AppWidgets,
        root: &gtk::Window,
        key: DirectoryKey,
    ) {
        match key {
            DirectoryKey::Char(digit) => {
                self.open_directory(widgets, root, false);
                if push_query_char(&mut self.query, digit) {
                    self.render_directory();
                    self.sync_key_capture();
                    self.resize(root);
                    self.sync_directory_layout(widgets);
                }
            }
            DirectoryKey::Backspace => {
                self.query.pop();
                self.render_directory();
                self.sync_key_capture();
                self.resize(root);
                self.sync_directory_layout(widgets);
            }
            DirectoryKey::Enter => {
                match jump_choice(&self.windows, &self.query, self.allow_unlisted()) {
                    Some(JumpChoice::Window(window_id)) => {
                        self.pending_request = Some(PendingRequest {
                            session: self.directory_session,
                            target: RequestTarget::Window(window_id),
                        });
                        self.directory
                            .set_status(&format!("Jumping to #{window_id}…"));
                        emit(json!({ "protocol": 1, "type": "jump", "windowId": window_id }));
                    }
                    Some(JumpChoice::Card(card_id)) => {
                        self.pending_request = Some(PendingRequest {
                            session: self.directory_session,
                            target: RequestTarget::Card(card_id.clone()),
                        });
                        self.directory.set_status("Opening…");
                        emit(json!({ "protocol": 1, "type": "activate", "cardId": card_id }));
                    }
                    // Enter leading nowhere while only hover holds the keyboard: the typing was meant
                    // for the window below, so hand the keyboard back.
                    None if self.hover_guard.get() => self.cancel_hover_search(widgets, root),
                    None => {}
                }
            }
            DirectoryKey::Escape => self.dismiss_directory(widgets, root),
            DirectoryKey::Interrupt => self.cancel_hover_search(widgets, root),
        }
    }

    /// Whether a result answers exactly what the open list asked for. Anything else (a card's own
    /// activation, an earlier jump) leaves the pending request in place.
    fn take_own_request(&mut self, target: &RequestTarget) -> bool {
        if self.directory_open
            && answers_request(
                self.pending_request.as_ref(),
                self.directory_session,
                target,
            )
        {
            self.pending_request = None;
            true
        } else {
            false
        }
    }

    fn refresh_directory_status(&self) {
        if self.directory_open {
            self.directory.set_prompt(
                &self.windows,
                &self.query,
                self.window_active || self.keyboard_active,
                self.allow_unlisted(),
            );
        }
    }

    fn render_directory(&self) {
        if self.directory_open {
            self.directory.render(
                &self.windows,
                &self.query,
                self.window_active || self.keyboard_active,
                self.allow_unlisted(),
            );
        }
    }

    /// Take the keyboard for a hover-opened list, so a number can be typed at once. Clears the
    /// window's focus widget first: Enter with nothing typed must not press a card or row that
    /// kept focus from an earlier keyboard mode or click.
    fn take_hover_grab(&mut self, root: &gtk::Window) -> bool {
        if !self.directory_open || !self.directory_opened_by_hover || self.keyboard_active {
            return false;
        }
        if !self.hover_grab {
            GtkWindowExt::set_focus(root, None::<&gtk::Widget>);
            root.set_keyboard_mode(KeyboardMode::Exclusive);
            self.hover_grab = true;
            self.directory_owns_keyboard = true;
            self.sync_key_capture();
        }
        true
    }

    /// Typing held only by hover turned out to be meant for the window below: drop it, hand the
    /// keyboard back and close the list, so keys still in flight find nothing to type into. The
    /// list reopens when the pointer re-enters the ribbon.
    fn cancel_hover_search(&mut self, widgets: &mut AppWidgets, root: &gtk::Window) {
        self.query.clear();
        self.release_hover_grab(root);
        self.dismiss_directory(widgets, root);
    }

    /// Unlisted window numbers are reachable only when the keyboard was given on purpose (a
    /// click or keyboard mode), not merely held by hover.
    fn allow_unlisted(&self) -> bool {
        !(self.hover_grab && !self.keyboard_active)
    }

    fn release_hover_grab(&mut self, root: &gtk::Window) {
        if self.hover_grab {
            self.hover_grab = false;
            self.grab_generation += 1;
            if !self.keyboard_active {
                root.set_keyboard_mode(KeyboardMode::OnDemand);
            }
            self.sync_key_capture();
            self.refresh_directory_status();
        }
    }

    fn arm_grab_timer(&mut self, sender: &ComponentSender<Self>) {
        self.grab_generation += 1;
        let generation = self.grab_generation;
        let tx = sender.input_sender().clone();
        glib::timeout_add_local_once(Duration::from_millis(HOVER_GRAB_MS), move || {
            let _ = tx.send(AppMsg::DirectoryGrabExpired(generation));
        });
    }

    fn open_directory(&mut self, widgets: &AppWidgets, root: &gtk::Window, by_hover: bool) {
        if self.directory_open || !self.visible || !self.interactive {
            return;
        }
        self.directory_open = true;
        self.directory_opened_by_hover = by_hover;
        self.directory_session += 1;
        self.query.clear();
        // On-demand until a hover grab (take_hover_grab) upgrades it; a click can always take the
        // keyboard. Keyboard mode already holds it.
        if !self.keyboard_active {
            root.set_keyboard_mode(KeyboardMode::OnDemand);
            self.directory_owns_keyboard = true;
        }
        self.render_directory();
        self.sync_key_capture();
        self.resize(root);
        self.sync_directory_layout(widgets);
    }

    /// After the list moved focus somewhere, nothing on the ribbon may keep the keyboard: the list
    /// closes, and keyboard mode ends exactly as activating a card ends it.
    fn finish_directory_jump(&mut self, widgets: &mut AppWidgets, root: &gtk::Window) {
        if self.keyboard_active {
            self.leave_keyboard_mode(widgets, root);
        } else {
            self.dismiss_directory(widgets, root);
        }
    }

    /// Close the list and let the ribbon fall back to compact unless a card is still under the
    /// pointer: the card kept open while the pointer crossed to the list has done its job.
    fn dismiss_directory(&mut self, widgets: &mut AppWidgets, root: &gtk::Window) {
        self.close_directory(widgets, root);
        if self.hovered.is_empty() && !self.keyboard_active {
            self.apply_expansion(widgets, root, None);
        }
    }

    /// The one way out of keyboard mode. The list closes with it: once the ribbon gives up the
    /// keyboard nothing could type into or dismiss a list left open.
    fn leave_keyboard_mode(&mut self, widgets: &mut AppWidgets, root: &gtk::Window) {
        self.close_directory(widgets, root);
        self.end_engagement();
        root.set_keyboard_mode(KeyboardMode::None);
        self.apply_expansion(widgets, root, None);
    }

    fn close_directory(&mut self, widgets: &AppWidgets, root: &gtk::Window) {
        if !self.directory_open {
            return;
        }
        self.directory_open = false;
        self.directory_opened_by_hover = false;
        self.hover_grab = false;
        self.pending_request = None;
        self.query.clear();
        if self.directory_owns_keyboard {
            self.directory_owns_keyboard = false;
            if !self.keyboard_active {
                root.set_keyboard_mode(KeyboardMode::None);
            }
        }
        self.sync_key_capture();
        self.resize(root);
        self.sync_directory_layout(widgets);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BrandCounts, DirectoryKey, KeyCapture, PendingRequest, RequestTarget, answers_request,
        brand_text, directory_key, engaged_card_id, move_order_item, navigation_target,
        scroll_to_show, short_path,
    };
    use crate::protocol::Card;
    use relm4::gtk::gdk;
    use std::collections::HashSet;

    fn counts() -> BrandCounts {
        BrandCounts {
            active: 2,
            settled: 3,
        }
    }

    #[test]
    fn the_focused_card_scrolls_into_view_with_the_least_movement() {
        // Row viewport 0..1000.
        assert_eq!(
            scroll_to_show(0.0, 1000.0, 200.0, 440.0),
            0.0,
            "already visible"
        );
        assert_eq!(
            scroll_to_show(0.0, 1000.0, 1500.0, 1740.0),
            740.0,
            "right of view"
        );
        assert_eq!(
            scroll_to_show(800.0, 1000.0, 300.0, 540.0),
            300.0,
            "left of view"
        );
        assert_eq!(
            scroll_to_show(0.0, 200.0, 500.0, 740.0),
            500.0,
            "wider than the view: its start wins"
        );
    }

    #[test]
    fn only_the_answer_to_what_the_open_list_asked_acts_on_it() {
        let pending = PendingRequest {
            session: 3,
            target: RequestTarget::Window(43),
        };
        assert!(answers_request(
            Some(&pending),
            3,
            &RequestTarget::Window(43)
        ));
        assert!(
            !answers_request(Some(&pending), 3, &RequestTarget::Window(44)),
            "an earlier jump to another number"
        );
        assert!(
            !answers_request(Some(&pending), 3, &RequestTarget::Card("card-a".into())),
            "a card's own activation"
        );
        assert!(
            !answers_request(Some(&pending), 4, &RequestTarget::Window(43)),
            "a list opened again since"
        );
        assert!(!answers_request(None, 3, &RequestTarget::Window(43)));
    }

    #[test]
    fn only_ctrl_alt_super_make_a_chord_and_bare_modifiers_are_not_typing() {
        assert!(super::is_chord(gdk::ModifierType::CONTROL_MASK));
        assert!(super::is_chord(gdk::ModifierType::SUPER_MASK));
        assert!(
            !super::is_chord(gdk::ModifierType::SHIFT_MASK),
            "Shift types capitals"
        );
        assert!(super::is_modifier_key(gdk::Key::Shift_L));
        assert!(!super::is_modifier_key(gdk::Key::space));
    }

    #[test]
    fn the_window_list_takes_keys_only_while_they_belong_to_it() {
        let key = |capture, key| format!("{:?}", directory_key(capture, key, false));
        assert_eq!(
            format!("{:?}", directory_key(KeyCapture::List, gdk::Key::c, true)),
            "None",
            "Ctrl+C is a shortcut, not a search for c"
        );
        assert_eq!(key(KeyCapture::None, gdk::Key::_4), "None");
        // Keyboard mode on the cards: a digit opens the list, Enter and Escape stay with the cards.
        assert_eq!(key(KeyCapture::Digits, gdk::Key::_4), "Some(Char('4'))");
        assert_eq!(
            key(KeyCapture::Digits, gdk::Key::e),
            "Some(Char('e'))",
            "a letter starts a name search"
        );
        assert_eq!(key(KeyCapture::Digits, gdk::Key::Return), "None");
        assert_eq!(key(KeyCapture::Digits, gdk::Key::Escape), "None");
        assert_eq!(key(KeyCapture::List, gdk::Key::KP_7), "Some(Char('7'))");
        assert_eq!(key(KeyCapture::List, gdk::Key::minus), "Some(Char('-'))");
        assert_eq!(
            key(KeyCapture::List, gdk::Key::space),
            "None",
            "space is never taken"
        );
        assert_eq!(
            key(KeyCapture::List, gdk::Key::Return),
            "None",
            "with nothing typed, Enter still reaches the focused card"
        );
        assert_eq!(key(KeyCapture::ListTyped, gdk::Key::Return), "Some(Enter)");
        assert_eq!(
            key(KeyCapture::List, gdk::Key::BackSpace),
            "Some(Backspace)"
        );
        assert_eq!(key(KeyCapture::List, gdk::Key::Escape), "Some(Escape)");
        assert_eq!(key(KeyCapture::None, gdk::Key::a), "None");
        assert!(matches!(
            directory_key(KeyCapture::ListTyped, gdk::Key::KP_Enter, false),
            Some(DirectoryKey::Enter)
        ));
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
