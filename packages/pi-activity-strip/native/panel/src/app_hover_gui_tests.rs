//! Actual App regressions: schedule messages, never synthesize pointer membership or ownership.
use super::*;
use std::cell::RefCell;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Tick,
    Enter,
    Leave,
    PointerIntent,
    View,
    FocusLost,
    Other,
}

#[derive(Clone, Debug)]
struct Dispatch {
    kind: Kind,
    completed: bool,
    mapped: bool,
    contains: bool,
    visible: bool,
    inside: bool,
    pending: Option<(u64, u64)>,
    native_ms: i64,
    keyboard_request: u64,
    hover_active: bool,
    hover_captured: bool,
    hover_expired: bool,
    device_position: Option<(f64, f64)>,
    device_surface_is_root: Option<bool>,
    device_timestamp: Option<u32>,
}

#[derive(Default)]
struct Trace {
    removed_timers: usize,
    dispatches: Vec<Dispatch>,
}

thread_local! {
    // None preserves automatic scheduling for every existing test.
    static TRACE: RefCell<Option<Trace>> = const { RefCell::new(None) };
}

struct ManualTicks;
impl ManualTicks {
    fn new() -> Self {
        TRACE.with_borrow_mut(|trace| {
            assert!(trace.is_none(), "SETUP: nested manual scheduler");
            *trace = Some(Trace::default());
        });
        Self
    }
}
impl Drop for ManualTicks {
    fn drop(&mut self) {
        let trace = TRACE.with_borrow_mut(Option::take);
        if let Some(trace) = trace {
            // Preserve the actual pre-dispatch observations on both success and unwind.
            for (index, event) in trace.dispatches.iter().enumerate() {
                eprintln!(
                    "HOVER DISPATCH {index}: {event:?}; inside={} device={:?}/{:?}/{:?}",
                    event.inside,
                    event.device_position,
                    event.device_surface_is_root,
                    event.device_timestamp
                );
            }
        }
    }
}

pub(crate) fn configure_tick_source(source: glib::SourceId) {
    TRACE.with_borrow_mut(|trace| {
        if let Some(trace) = trace {
            source.remove();
            trace.removed_timers += 1;
        }
        // SourceId has no removing Drop; the default automatic timer remains installed.
    });
}

// Completion records even early returns from hidden/noninteractive filtering. It never
// observes or mutates App after dispatch, and does not require directory_open as an oracle.
pub(crate) struct DispatchObservation(usize);
impl Drop for DispatchObservation {
    fn drop(&mut self) {
        TRACE.with_borrow_mut(|trace| {
            if let Some(trace) = trace {
                trace.dispatches[self.0].completed = true;
            }
        });
    }
}

pub(crate) fn observe_dispatch(
    message: &AppMsg,
    app: &App,
    root: &gtk::Window,
) -> Option<DispatchObservation> {
    TRACE.with_borrow_mut(|trace| {
        let trace = trace.as_mut()?;
        let index = trace.dispatches.len();
        // Observe GDK's own surface/device facts, not widget membership alone.
        // These are diagnostics, not a settled-map or user-intent assumption.
        let surface = root.surface();
        let device = gdk::Display::default()
            .and_then(|d| d.default_seat())
            .and_then(|s| s.pointer());
        let device_position = surface
            .as_ref()
            .zip(device.as_ref())
            .and_then(|(s, d)| s.device_position(d))
            .map(|(x, y, _)| (x, y));
        let device_surface_is_root = surface
            .as_ref()
            .zip(device.as_ref())
            .and_then(|(s, d)| d.surface_at_position().0.map(|actual| actual == *s));
        let device_timestamp = device.as_ref().map(|d| d.timestamp());
        let native_ms = monotonic_ms();
        trace.dispatches.push(Dispatch {
            completed: false,
            kind: match message {
                AppMsg::Tick => Kind::Tick,
                AppMsg::DirectoryHover(true) => Kind::Enter,
                AppMsg::DirectoryHover(false) => Kind::Leave,
                AppMsg::PointerIntent => Kind::PointerIntent,
                AppMsg::View(_) => Kind::View,
                AppMsg::WindowActive(false) => Kind::FocusLost,
                _ => Kind::Other,
            },
            mapped: root.is_mapped(),
            contains: app.pointer.contains_pointer(),
            visible: app.visible,
            inside: app.hover_keyboard.inside,
            pending: app.hover_keyboard.pending,
            native_ms,
            keyboard_request: app.keyboard_request,
            hover_active: app.hover_keyboard.active,
            hover_captured: app.hover_keyboard.captured,
            hover_expired: app.hover_keyboard.expired(native_ms),
            device_position,
            device_surface_is_root,
            device_timestamp,
        });
        Some(DispatchObservation(index))
    })
}

fn dispatches() -> Vec<Dispatch> {
    TRACE.with_borrow(|trace| trace.as_ref().unwrap().dispatches.clone())
}

fn mark() -> usize {
    TRACE.with_borrow(|trace| trace.as_ref().unwrap().dispatches.len())
}

// One context iteration at a time: unlike pump(), never drain for a fixed dwell.
// Time bounds diagnose an unmet barrier, never establish behavioral success.
fn await_setup(check: impl Fn() -> bool, label: &str) {
    let deadline = Instant::now() + Duration::from_secs(30);
    let context = glib::MainContext::default();
    while !check() {
        assert!(Instant::now() < deadline, "SETUP/ORDER: {label}");
        if let Some(display) = gdk::Display::default() {
            display.flush();
        }
        if !context.iteration(false) {
            std::thread::yield_now();
        }
    }
}

struct Pointer {
    child: Child,
    events: BufReader<ChildStdout>,
    commands: usize,
}
impl Pointer {
    fn new(width: i32, height: i32) -> Self {
        let mut child = Command::new(virtual_pointer_fixture())
            .args([
                (width / 2).to_string(),
                (height - 20).to_string(),
                width.to_string(),
                height.to_string(),
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("SETUP: start private virtual pointer");
        let events = BufReader::new(child.stdout.take().unwrap());
        let mut pointer = Self {
            child,
            events,
            commands: 1,
        };
        pointer.ack("ready");
        pointer
    }

    fn ack(&mut self, expected: &str) {
        let mut line = String::new();
        assert!(
            self.events
                .read_line(&mut line)
                .expect("SETUP: pointer reply")
                > 0,
            "SETUP: pointer exited before {expected}"
        );
        assert_eq!(line.trim(), expected, "SETUP: pointer protocol");
    }

    fn move_to(&mut self, x: i32, y: i32) {
        writeln!(self.child.stdin.as_mut().unwrap(), "{x} {y}").expect("SETUP: pointer command");
        self.commands += 1;
        self.ack("moved");
        // The helper's Wayland roundtrip acknowledges the command, NOT GTK dispatch.
    }
}
impl Drop for Pointer {
    fn drop(&mut self) {
        // Only our own child handle; never signal compositor/host processes by numeric PID.
        self.child.stdin.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

struct Fixture {
    app: relm4::Controller<App>,
    receiver: gtk::Window,
    pointer: Pointer,
    outside: (i32, i32),
}
impl Fixture {
    fn new() -> Self {
        assert_isolated_gui();
        gtk::init().expect("SETUP: private GTK display");
        let receiver = gtk::Window::new();
        receiver.set_title(Some("AK7417 private hover regression receiver"));
        receiver.set_child(Some(&gtk::Entry::new()));
        receiver.present();
        await_setup(|| receiver.is_mapped(), "receiver must map");
        // GTK mapping is not proof that the compositor has registered the window.
        let receiver_id = RefCell::new(None);
        await_setup(
            || {
                let windows = niri_json("windows");
                let found = windows
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|window| window["pid"].as_u64() == Some(u64::from(std::process::id())))
                    .and_then(|window| window["id"].as_u64());
                *receiver_id.borrow_mut() = found;
                found.is_some()
            },
            "own receiver must be registered by the private compositor",
        );
        let id = receiver_id.into_inner().unwrap().to_string();
        assert!(
            Command::new("niri")
                .args(["msg", "action", "focus-window", "--id", &id])
                .status()
                .expect("SETUP: focus receiver")
                .success()
        );
        await_setup(
            || receiver.is_active(),
            "receiver must gain focus before panel launch",
        );
        let outputs = niri_json("outputs");
        let outputs = outputs.as_object().unwrap();
        assert_eq!(
            outputs.len(),
            1,
            "SETUP: exactly one private logical output"
        );
        let logical = &outputs.values().next().unwrap()["logical"];
        let width = i32::try_from(logical["width"].as_u64().unwrap()).unwrap();
        let height = i32::try_from(logical["height"].as_u64().unwrap()).unwrap();
        assert!(width > 320 && height > 200, "SETUP: usable output geometry");
        let pointer = Pointer::new(width, height);
        let app = App::builder()
            .launch(AppInit {
                demo: true,
                click_through: false,
            })
            .detach();
        await_setup(
            || app.widget().is_mapped() && app.model().visible,
            "actual App must map",
        );
        assert!(
            !app.model().pointer.contains_pointer(),
            "SETUP: initially outside body"
        );
        assert!(
            app.model().hover_keyboard.pending.is_none(),
            "SETUP: no initial request"
        );
        TRACE.with_borrow(|trace| {
            assert_eq!(
                trace.as_ref().unwrap().removed_timers,
                1,
                "SETUP: exactly the App's automatic Tick source removed"
            )
        });
        Self {
            app,
            receiver,
            pointer,
            outside: (width / 2, height - 20),
        }
    }

    fn enter(&mut self) -> (u64, u64) {
        self.pointer.move_to(60, 40);
        await_setup(
            || {
                let app = self.app.model();
                app.pointer.contains_pointer()
                    && app.directory_hovered
                    && app.hover_keyboard.pending.is_some()
            },
            "initial real entry must complete and request permission",
        );
        assert!(
            self.outside.1 > self.app.widget().height() + OUTER_MARGIN,
            "SETUP: outside coordinate must be below expanded panel"
        );
        assert_eq!(
            self.app.widget().keyboard_mode(),
            KeyboardMode::None,
            "SETUP: demo has no Node grant"
        );
        self.app.model().hover_keyboard.pending.unwrap()
    }

    fn view(&self, visible: bool) -> u64 {
        let mut view = demo_view();
        view.revision = self.app.model().revision + 1;
        view.visible = visible;
        let revision = view.revision;
        self.app.emit(AppMsg::View(view));
        revision
    }

    fn hide(&self) {
        let begin = mark();
        let revision = self.view(false);
        await_setup(
            || {
                self.app.model().revision == revision
                    && !self.app.model().visible
                    && !self.app.widget().is_mapped()
                    && dispatches()[begin..].iter().any(|event| {
                        event.kind == Kind::Leave
                            && event.completed
                            && !event.visible
                            && !event.contains
                    })
            },
            "production hide and real body leave while hidden must both dispatch",
        );
        assert!(
            self.app.model().hover_keyboard.pending.is_none(),
            "SETUP: hide must cancel the first hover request"
        );
    }

    fn await_entry(&self, begin: usize) {
        await_setup(
            || {
                let app = self.app.model();
                self.app.widget().is_mapped()
                    && app.visible
                    && app.pointer.contains_pointer()
                    && dispatches()[begin..].iter().any(|event| {
                        event.kind == Kind::Enter
                            && event.completed
                            && event.mapped
                            && event.contains
                            && event.visible
                    })
            },
            "real body entry must reach and complete the production handler",
        );
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.app.widget().close();
        self.receiver.close();
    }
}

fn niri_json(subject: &str) -> serde_json::Value {
    let output = Command::new("niri")
        .args(["msg", "-j", subject])
        .output()
        .expect("SETUP: query private compositor");
    assert!(output.status.success(), "SETUP: niri {subject} failed");
    serde_json::from_slice(&output.stdout).expect("SETUP: compositor JSON")
}

/// Characterize actual native release causes without borrowing a controller wall-clock deadline.
/// Tick scheduling is controlled, but capture/focus, monotonic expiry and typing are real GTK/Niri.
pub(super) fn hover_release_cause(idle: bool) {
    let _schedule = ManualTicks::new();
    let mut fixture = Fixture::new();
    let entry = fixture
        .receiver
        .child()
        .unwrap()
        .downcast::<gtk::Entry>()
        .unwrap();
    entry.grab_focus();
    // Given real compositor pointer entry and an exact native request granted by the fixture.
    let (token, epoch) = fixture.enter();
    fixture.app.emit(AppMsg::HoverGrant(token, epoch, 41));
    await_setup(
        || fixture.app.model().hover_keyboard.captured && fixture.app.widget().is_active(),
        "matching native grant must actually acquire GTK keyboard focus",
    );
    assert_eq!(fixture.app.model().keyboard_request, 41);
    assert!(!fixture.app.model().hover_keyboard.expired(monotonic_ms()));
    let begin = mark();
    // When either a production hidden view arrives BEFORE native expiry, or a real Tick
    // arrives AFTER native monotonic expiry. No synthetic WindowActive or keyboard state.
    if idle {
        await_setup(
            || fixture.app.model().hover_keyboard.expired(monotonic_ms()),
            "native monotonic idle deadline must actually expire",
        );
        assert!(
            fixture.app.model().hover_keyboard.captured,
            "no automatic Tick may release early"
        );
        fixture.app.emit(AppMsg::Tick);
    } else {
        fixture.view(false);
    }
    await_setup(
        || {
            !fixture.app.model().hover_keyboard.active
                && !fixture.app.model().hover_keyboard.captured
                && fixture.app.widget().keyboard_mode() == KeyboardMode::None
                && fixture.receiver.is_active()
                && dispatches()[begin..]
                    .iter()
                    .any(|event| event.kind == Kind::FocusLost && event.completed)
        },
        "native release must return actual keyboard focus to the private receiver",
    );
    let events = dispatches();
    let cause = events[begin..]
        .iter()
        .find(|event| {
            event.completed
                && event.keyboard_request == 41
                && event.hover_active
                && event.hover_captured
                && event.kind == if idle { Kind::Tick } else { Kind::View }
        })
        .expect("matching native capture must reach the selected production release branch");
    assert_eq!(
        cause.hover_expired, idle,
        "hidden-view release must precede native expiry; idle release must follow it"
    );
    assert!(
        events[begin..]
            .iter()
            .any(|event| event.kind == Kind::FocusLost && event.completed)
    );
    assert_eq!(
        events[begin..]
            .iter()
            .filter(|event| event.kind == Kind::Tick)
            .count(),
        usize::from(idle),
        "exactly the selected cause: no automatic Tick may stand in for hidden-view release"
    );
    type_keys(&["after-native-release"]);
    await_setup(
        || entry.text().as_str() == "after-native-release",
        "fresh typing must reach the exact receiver after native release",
    );
    println!(
        "NATIVE RELEASE CAUSE PASS request=41 idle={idle} native_ms={} expired={} captured={} token={token} epoch={epoch}",
        cause.native_ms, cause.hover_expired, cause.hover_captured
    );
}

pub(super) fn rapid_hidden_reentry() {
    let _schedule = ManualTicks::new();
    let mut fixture = Fixture::new();
    // Given: actual GTK entry requests permission, but Node has not granted it.
    let first = fixture.enter();
    let begin = mark();
    // When: hide/hidden leave, genuine outside movement, show, then genuine entry.
    // No Tick, dwell, click, grant, or synthetic enter repairs the retained latch.
    fixture.hide();
    fixture
        .pointer
        .move_to(fixture.outside.0, fixture.outside.1);
    let revision = fixture.view(true);
    await_setup(
        || {
            fixture.app.model().revision == revision
                && fixture.app.widget().is_mapped()
                && !fixture.app.model().pointer.contains_pointer()
        },
        "show outside before genuine reentry",
    );
    let entry_begin = mark();
    fixture.pointer.move_to(60, 40);
    fixture.await_entry(entry_begin);
    let events = dispatches();
    assert!(
        events[begin..].iter().all(|event| event.kind != Kind::Tick),
        "SETUP/ORDER: rapid trace must have ZERO Ticks, including mapped-outside Ticks"
    );
    assert!(
        events[begin..]
            .iter()
            .all(|event| event.kind != Kind::PointerIntent),
        "SETUP/ORDER: no click may rescue reentry"
    );
    assert_eq!(
        fixture.pointer.commands, 4,
        "SETUP/ORDER: only initial/enter/outside/entry input"
    );
    // Then: genuine reentry requests NEW authority immediately, before any Node grant.
    let app = fixture.app.model();
    let next = app.hover_keyboard.pending.expect(
        "BEHAVIOR: genuine hide/outside/show/entry must issue a new hover request without a Tick",
    );
    assert_ne!(next.0, first.0, "BEHAVIOR: never revive the canceled token");
    assert_eq!(
        next.1, app.interaction_epoch,
        "BEHAVIOR: request current authority epoch"
    );
    assert_eq!(fixture.app.widget().keyboard_mode(), KeyboardMode::None);
}

pub(super) fn stationary_remap() {
    let _schedule = ManualTicks::new();
    let mut fixture = Fixture::new();
    // Given: actual body entry, followed by production hide and hidden leave.
    fixture.enter();
    fixture.hide();
    let commands = fixture.pointer.commands;
    let begin = mark();
    // When: show beneath the UNMOVED pointer. Queue a real Tick on actual map;
    // never override contains_pointer, inject enter, or edit ownership fields.
    let queued = Rc::new(Cell::new(false));
    let queued_on_map = Rc::clone(&queued);
    let tx = fixture.app.sender().clone();
    let map_handler = fixture.app.widget().connect_map(move |_| {
        if !queued_on_map.replace(true) {
            tx.send(AppMsg::Tick).expect("SETUP: queue map-phase Tick");
        }
    });
    fixture.view(true);
    fixture.await_entry(begin);
    fixture.app.widget().disconnect(map_handler);
    assert!(
        queued.get(),
        "SETUP/ORDER: remap callback must schedule Tick"
    );
    let events = dispatches();
    let events = &events[begin..];
    let ticks: Vec<_> = events
        .iter()
        .enumerate()
        .filter(|(_, event)| event.kind == Kind::Tick)
        .collect();
    assert_eq!(
        ticks.len(),
        1,
        "SETUP/ORDER: exactly one actual Tick dispatch"
    );
    let (tick_index, tick) = ticks[0];
    assert!(
        tick.completed && tick.mapped && !tick.contains && tick.visible,
        "SETUP/ORDER: Tick must dispatch mapped/body-absent, not merely enqueue then: {tick:?}"
    );
    let enter_index = events
        .iter()
        .position(|event| event.kind == Kind::Enter)
        .expect("SETUP/ORDER: compositor must deliver stationary entry");
    assert!(
        tick_index < enter_index,
        "SETUP/ORDER: actual Tick handler must precede stationary entry"
    );
    assert_eq!(
        fixture.pointer.commands, commands,
        "SETUP/ORDER: no new pointer action"
    );
    assert!(
        events.iter().all(|event| event.kind != Kind::PointerIntent),
        "SETUP/ORDER: no new click intent"
    );
    // Then: neither the final state nor any later dispatch may expose a new request.
    // Checking snapshots also catches a request subsequently canceled by another callback.
    assert!(
        fixture.app.model().hover_keyboard.pending.is_none()
            && events.iter().all(|event| event.pending.is_none()),
        "BEHAVIOR: mapped-body-absence Tick plus stationary remap must NOT request new authority"
    );
    assert_eq!(fixture.app.widget().keyboard_mode(), KeyboardMode::None);
}

pub(super) fn stationary_backend_loss_remap() {
    let _schedule = ManualTicks::new();
    let mut fixture = Fixture::new();
    // Given: real entry and backend focus on this exact GDK surface, not just its body.
    fixture.enter();
    let surface = fixture.app.widget().surface().expect("SETUP: root surface");
    let device = gdk::Display::default()
        .and_then(|display| display.default_seat())
        .and_then(|seat| seat.pointer())
        .expect("SETUP: actual GDK pointer device");
    let (x, y, _) = surface
        .device_position(&device)
        .expect("SETUP: initial backend pointer position must be on root");
    assert_eq!(
        device.surface_at_position().0.as_ref(),
        Some(&surface),
        "SETUP: initial backend pointer focus must be root"
    );
    let commands = fixture.pointer.commands;
    fixture.hide();
    let begin = mark();

    // When: a real, private compositor workspace transition occurs while hidden.
    // Select by actual window occupancy, never mistake NULL active_window_id for empty.
    let windows = niri_json("windows");
    let windows = windows.as_array().expect("SETUP: private window inventory");
    let source = windows
        .iter()
        .find(|window| window["pid"].as_u64() == Some(u64::from(std::process::id())))
        .and_then(|window| window["workspace_id"].as_u64())
        .expect("SETUP: own receiver workspace");
    let workspaces = niri_json("workspaces");
    let empty = workspaces
        .as_array()
        .expect("SETUP: private workspace inventory")
        .iter()
        .find(|workspace| {
            workspace["id"].as_u64().is_some_and(|id| {
                id != source
                    && !windows
                        .iter()
                        .any(|window| window["workspace_id"].as_u64() == Some(id))
            })
        })
        .expect("SETUP: a distinct empty private workspace must exist");
    let target_id = empty["id"].as_u64().unwrap();
    let target_index = empty["idx"]
        .as_u64()
        .expect("SETUP: workspace index")
        .to_string();
    assert!(
        Command::new("niri")
            .args(["msg", "action", "focus-workspace", &target_index])
            .status()
            .expect("SETUP: private workspace focus action")
            .success(),
        "SETUP: private workspace focus action failed"
    );
    await_setup(
        || {
            niri_json("workspaces")
                .as_array()
                .unwrap()
                .iter()
                .any(|workspace| {
                    workspace["id"].as_u64() == Some(target_id) && workspace["is_focused"] == true
                })
        },
        "private compositor must confirm target workspace focus",
    );

    // A cached GTK body leave is insufficient. Query the retained, actual GDK
    // surface/device: no coordinates on root AND no backend focus on that root.
    // Keeping both objects rules out missing surface/device masquerading as absence.
    await_setup(
        || {
            surface.device_position(&device).is_none()
                && device.surface_at_position().0.as_ref() != Some(&surface)
        },
        "workspace transition while hidden must produce actual backend departure from root",
    );
    assert!(
        !fixture.app.model().visible && !fixture.app.widget().is_mapped(),
        "SETUP/ORDER: backend departure must be observed while hidden"
    );
    assert_eq!(
        fixture.app.widget().surface().as_ref(),
        Some(&surface),
        "SETUP/ORDER: absence must concern the retained root surface"
    );
    assert_eq!(
        fixture.pointer.commands, commands,
        "SETUP/ORDER: no pointer command may manufacture backend departure"
    );
    eprintln!(
        "BACKEND LOSS: workspace={target_id} root_position={:?} backend_is_root={} timestamp={} pointer_commands={commands}",
        surface.device_position(&device),
        device.surface_at_position().0.as_ref() == Some(&surface),
        device.timestamp()
    );

    // Schedule actual Tick on actual map, as in the existing stationary control.
    // No controller grants, fabricated enter, pointer movement, or ownership writes.
    let queued = Rc::new(Cell::new(false));
    let queued_on_map = Rc::clone(&queued);
    let tx = fixture.app.sender().clone();
    let map_handler = fixture.app.widget().connect_map(move |_| {
        if !queued_on_map.replace(true) {
            tx.send(AppMsg::Tick)
                .expect("SETUP: queue backend-loss map Tick");
        }
    });
    let show_begin = mark();
    fixture.view(true);
    fixture.await_entry(show_begin);
    fixture.app.widget().disconnect(map_handler);
    let all_events = dispatches();
    let events = &all_events[show_begin..];
    let ticks: Vec<_> = events
        .iter()
        .enumerate()
        .filter(|(_, event)| event.kind == Kind::Tick)
        .collect();
    assert!(queued.get(), "SETUP/ORDER: actual map must schedule Tick");
    assert_eq!(
        ticks.len(),
        1,
        "SETUP/ORDER: exactly one remap Tick dispatch"
    );
    assert!(
        all_events[begin..show_begin]
            .iter()
            .all(|event| event.kind != Kind::Tick),
        "SETUP/ORDER: no extra Tick during hidden backend departure"
    );
    let (tick_index, tick) = ticks[0];
    assert!(
        tick.completed && tick.mapped && tick.visible && !tick.contains,
        "SETUP/ORDER: actual Tick must complete mapped/body-absent: {tick:?}"
    );
    assert!(
        tick.device_position.is_none()
            && tick.device_surface_is_root != Some(true)
            && tick.device_timestamp.is_some(),
        "SETUP/ORDER: Tick must also observe BACKEND absence, not only body absence: {tick:?}"
    );
    let enter_index = events
        .iter()
        .position(|event| event.kind == Kind::Enter)
        .expect("SETUP/ORDER: actual stationary entry must dispatch");
    let enter = &events[enter_index];
    assert!(
        tick_index < enter_index
            && enter.completed
            && enter.mapped
            && enter.visible
            && enter.contains
            && enter.device_surface_is_root == Some(true),
        "SETUP/ORDER: actual backend/body reentry must complete AFTER absence Tick: {enter:?}"
    );
    assert_eq!(
        fixture.app.widget().surface().as_ref(),
        Some(&surface),
        "SETUP/ORDER: remap must retain the tested root surface"
    );
    assert_eq!(
        enter.device_position,
        Some((x, y)),
        "SETUP/ORDER: reentry coordinates must match initial stationary coordinates"
    );
    assert_eq!(
        fixture.pointer.commands, commands,
        "SETUP/ORDER: no pointer command through hide/workspace change/show/entry"
    );
    assert!(
        all_events[begin..]
            .iter()
            .all(|event| event.kind != Kind::PointerIntent),
        "SETUP/ORDER: no click intent"
    );

    // Then: backend absence caused by lifecycle/compositor focus is NOT fresh
    // physical intent. A naive body->backend absence substitution must fail here.
    assert!(
        fixture.app.model().hover_keyboard.pending.is_none()
            && all_events[begin..]
                .iter()
                .all(|event| event.pending.is_none()),
        "BEHAVIOR: stationary hide/backend-focus-loss/remap must NOT request new authority"
    );
    assert_eq!(fixture.app.widget().keyboard_mode(), KeyboardMode::None);
}

/// AK7922: the realistic F01 case. A genuine return to a DIFFERENT body position before any Tick
/// must request new authority; only the exact pre-hide position is indistinguishable from a remap.
pub(super) fn rapid_hidden_reentry_elsewhere() {
    let _schedule = ManualTicks::new();
    let mut fixture = Fixture::new();
    // Given: actual GTK entry requests permission, but Node has not granted it.
    let first = fixture.enter();
    let begin = mark();
    // When: hide/hidden leave, genuine outside movement, show, then genuine entry ELSEWHERE.
    fixture.hide();
    fixture
        .pointer
        .move_to(fixture.outside.0, fixture.outside.1);
    let revision = fixture.view(true);
    await_setup(
        || {
            fixture.app.model().revision == revision
                && fixture.app.widget().is_mapped()
                && !fixture.app.model().pointer.contains_pointer()
        },
        "show outside before genuine reentry elsewhere",
    );
    let entry_begin = mark();
    fixture.pointer.move_to(90, 40);
    fixture.await_entry(entry_begin);
    let events = dispatches();
    assert!(
        events[begin..].iter().all(|event| event.kind != Kind::Tick),
        "SETUP/ORDER: rapid trace must have ZERO Ticks, including mapped-outside Ticks"
    );
    assert!(
        events[begin..]
            .iter()
            .all(|event| event.kind != Kind::PointerIntent),
        "SETUP/ORDER: no click may rescue reentry"
    );
    assert_eq!(
        fixture.pointer.commands, 4,
        "SETUP/ORDER: only initial/enter/outside/entry input"
    );
    // Then: genuine reentry elsewhere requests NEW authority immediately, before any Node grant.
    let app = fixture.app.model();
    let next = app.hover_keyboard.pending.expect(
        "BEHAVIOR: genuine hide/outside/show/entry elsewhere must issue a new hover request without a Tick",
    );
    assert_ne!(next.0, first.0, "BEHAVIOR: never revive the canceled token");
    assert_eq!(
        next.1, app.interaction_epoch,
        "BEHAVIOR: request current authority epoch"
    );
    assert_eq!(fixture.app.widget().keyboard_mode(), KeyboardMode::None);
}

/// AK7922: a hide anchor lives through one mapped absence only. After two Ticks with the strip
/// mapped and the pointer outside, a return to the exact pre-hide pixel is new movement again.
pub(super) fn exact_pixel_return_after_two_ticks() {
    let _schedule = ManualTicks::new();
    let mut fixture = Fixture::new();
    // Given: actual GTK entry requests permission, then the strip hides with the pointer inside.
    let first = fixture.enter();
    fixture.hide();
    // When: the pointer leaves while hidden, the strip shows, two Ticks observe it mapped and
    // body-absent, and the pointer returns to the same pixel.
    fixture
        .pointer
        .move_to(fixture.outside.0, fixture.outside.1);
    let revision = fixture.view(true);
    await_setup(
        || {
            fixture.app.model().revision == revision
                && fixture.app.widget().is_mapped()
                && !fixture.app.model().pointer.contains_pointer()
        },
        "show outside before two Ticks",
    );
    let begin = mark();
    let tx = fixture.app.sender().clone();
    for _ in 0..2 {
        tx.send(AppMsg::Tick)
            .expect("SETUP: queue mapped-outside Tick");
    }
    await_setup(
        || {
            dispatches()[begin..]
                .iter()
                .filter(|event| {
                    event.kind == Kind::Tick && event.completed && event.mapped && !event.contains
                })
                .count()
                == 2
        },
        "two mapped body-absent Ticks before the return",
    );
    let entry_begin = mark();
    fixture.pointer.move_to(60, 40);
    fixture.await_entry(entry_begin);
    // Then: the expired anchor no longer suppresses the genuine return.
    let app = fixture.app.model();
    let next = app.hover_keyboard.pending.expect(
        "BEHAVIOR: after two mapped absences an exact-pixel return must request new authority",
    );
    assert_ne!(next.0, first.0, "BEHAVIOR: never revive the canceled token");
    assert_eq!(
        next.1, app.interaction_epoch,
        "BEHAVIOR: request current authority epoch"
    );
    assert_eq!(fixture.app.widget().keyboard_mode(), KeyboardMode::None);
}
