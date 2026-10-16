//! Actual GTK/layer-shell interaction test; never run on the operator's display.
use super::*;
use relm4::ComponentController;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::time::Instant;

fn pump() {
    if let Some(display) = gdk::Display::default() {
        // Flush without a blocking roundtrip before pumping GTK: nested compositor replies must
        // be dispatched while bounded hover timers and input callbacks are actually running.
        display.flush();
    }
    let until = Instant::now() + Duration::from_millis(250);
    while Instant::now() < until {
        while glib::MainContext::default().pending() {
            glib::MainContext::default().iteration(false);
        }
        std::thread::sleep(Duration::from_millis(2));
    }
}

fn pump_until(check: impl Fn() -> bool, label: &str) {
    let start = Instant::now();
    while !check() {
        assert!(start.elapsed() < Duration::from_secs(30), "{label}");
        pump();
    }
}

fn move_pointer(pointer: &mut Child, events: &mut BufReader<ChildStdout>, x: i32, y: i32) {
    writeln!(pointer.stdin.as_mut().unwrap(), "{x} {y}").unwrap();
    let mut line = String::new();
    assert!(events.read_line(&mut line).unwrap() > 0);
    assert_eq!(line.trim(), "moved");
    pump();
}

fn type_keys(args: &[&str]) {
    assert!(Command::new("wtype").args(args).status().unwrap().success());
}

fn assert_clean(app: &App) {
    assert!(app.hovered.is_empty());
    assert!(!app.brand_hovered);
    assert!(!app.directory_hovered);
    assert!(!app.directory_open);
    assert!(!app.keyboard_active);
    assert!(app.keyboard_focused.is_none());
    assert!(app.open_card_id.is_none());
    assert!(app.pending_request.is_none());
    assert!(app.query.is_empty());
    assert_eq!(app.key_capture.get(), KeyCapture::None);
    assert!(!app.hover_keyboard.active);
    assert!(!app.hover_keyboard.captured);
    assert!(app.hover_keyboard.pending.is_none());
}

#[test]
#[ignore = "requires owned nested Niri, private runtime/bus, disabled AT-SPI and virtual pointer"]
fn isolated_gtk_interaction() {
    assert_eq!(
        std::env::var("PI_ACTIVITY_STRIP_ISOLATED_GUI").as_deref(),
        Ok("1")
    );
    assert_eq!(std::env::var("GTK_A11Y").as_deref(), Ok("none"));
    let state: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(std::env::var("PI_ACTIVITY_STRIP_GUI_STATE").unwrap()).unwrap(),
    )
    .unwrap();
    let socket = std::env::var("NIRI_SOCKET").unwrap();
    assert_ne!(Some(socket.as_str()), state["outer_socket"].as_str());
    assert!(socket.ends_with(&format!(".{}.sock", state["pid"].as_u64().unwrap())));
    let runtime = std::env::var("XDG_RUNTIME_DIR").unwrap();
    assert!(
        !socket.starts_with(&runtime),
        "fixture runtime must be separate from the desktop runtime"
    );
    gtk::init().unwrap();

    let fixture = gtk::Window::new();
    fixture.set_title(Some("AK7114 isolated typing receiver (fixture, not agent)"));
    let entry = gtk::Entry::new();
    fixture.set_child(Some(&entry));
    fixture.present();
    entry.grab_focus();
    pump();
    let windows: serde_json::Value = serde_json::from_slice(
        &Command::new("niri")
            .args(["msg", "-j", "windows"])
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap();
    let fixture_id = windows
        .as_array()
        .unwrap()
        .iter()
        .find(|window| window["pid"].as_u64() == Some(u64::from(std::process::id())))
        .expect("own typing receiver mapped")["id"]
        .as_u64()
        .unwrap()
        .to_string();
    assert!(
        Command::new("niri")
            .args(["msg", "action", "focus-window", "--id", &fixture_id])
            .status()
            .unwrap()
            .success()
    );
    pump();
    entry.grab_focus();
    let app = App::builder()
        .launch(AppInit {
            demo: true,
            click_through: false,
        })
        .detach();
    pump();
    let root = app.widget();
    let motion = gtk::EventControllerMotion::new();
    motion.connect_motion(|_, x, y| println!("GUI root pointer {x},{y}"));
    motion.connect_enter(|_, x, y| println!("GUI root enter {x},{y}"));
    root.add_controller(motion);
    let outputs: serde_json::Value = serde_json::from_slice(
        &Command::new("niri")
            .args(["msg", "-j", "outputs"])
            .output()
            .unwrap()
            .stdout,
    )
    .unwrap();
    let logical = &outputs.as_object().unwrap().values().next().unwrap()["logical"];
    let width = logical["width"].as_u64().unwrap().to_string();
    let height = logical["height"].as_u64().unwrap().to_string();
    println!(
        "GUI geometry: mapped={} size={}x{} outputs={outputs}",
        root.is_mapped(),
        root.width(),
        root.height()
    );
    let mut pointer = Command::new(std::env::var("PI_ACTIVITY_STRIP_VIRTUAL_POINTER").unwrap())
        .args(["300", "900", &width, &height])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut events = BufReader::new(pointer.stdout.take().unwrap());
    let mut ready = String::new();
    assert!(events.read_line(&mut ready).unwrap() > 0);
    assert_eq!(ready.trim(), "ready");
    assert!(
        Command::new("niri")
            .args(["msg", "action", "focus-window", "--id", &fixture_id])
            .status()
            .unwrap()
            .success()
    );
    pump();
    entry.grab_focus();
    println!(
        "GUI before hover focused={}",
        String::from_utf8_lossy(
            &Command::new("niri")
                .args(["msg", "-j", "focused-window"])
                .output()
                .unwrap()
                .stdout
        )
    );
    assert_eq!(root.keyboard_mode(), KeyboardMode::None);
    assert_eq!(root.default_size().1, COMPACT_HEIGHT);
    assert!(!app.model().expanded());
    // Real pointer enter on the brand: expansion, but no keyboard mode, focus, or key capture.
    move_pointer(&mut pointer, &mut events, 60, 40);
    assert!(app.model().brand_hovered);
    assert!(app.model().expanded());
    assert_eq!(root.exclusive_zone(), COMPACT_HEIGHT);
    assert_eq!(root.keyboard_mode(), KeyboardMode::None);
    assert_eq!(app.model().key_capture.get(), KeyCapture::None);
    println!(
        "GUI typing ownership: fixture_active={} entry_focus={} root_active={} focused={}",
        fixture.is_active(),
        entry.has_focus(),
        root.is_active(),
        String::from_utf8_lossy(
            &Command::new("niri")
                .args(["msg", "-j", "focused-window"])
                .output()
                .unwrap()
                .stdout
        )
    );
    type_keys(&["hover-typing"]);
    pump();
    assert_eq!(
        entry.text().as_str(),
        "hover-typing",
        "hover must not swallow any keys"
    );
    move_pointer(&mut pointer, &mut events, 300, 900);
    assert_clean(&app.model());
    assert_eq!(root.default_size().1, COMPACT_HEIGHT);
    println!(
        "GUI PASS: real pointer brand enter/leave, no hover keyboard capture, typing delivered to fixture"
    );

    // GTK selecting/focusing a card without explicit keyboard mode never opens it.
    let id = app.model().order[0].clone();
    let card = app.model().cards[&id].root.clone();
    let point = card
        .compute_point(root, &gtk::graphene::Point::new(10.0, 10.0))
        .unwrap();
    move_pointer(
        &mut pointer,
        &mut events,
        point.x() as i32 + 8,
        point.y() as i32 + 8,
    );
    assert!(app.model().hovered.contains(&id));
    assert_eq!(app.model().open_card_id.as_deref(), Some(id.as_str()));
    assert_eq!(root.keyboard_mode(), KeyboardMode::None);
    assert_eq!(app.model().key_capture.get(), KeyCapture::None);
    type_keys(&["card-typing"]);
    pump();
    assert_eq!(entry.text().as_str(), "hover-typingcard-typing");
    // Demo emits requests but has NO Node authority. Actual admission/typing/Enter is tested
    // with the production controller in the separate harness, never inferred from this demo.
    let (token, epoch) = app.model().hover_keyboard.pending.unwrap();
    move_pointer(&mut pointer, &mut events, 300, 900);
    assert_clean(&app.model());
    println!(
        "GUI PASS: real pointer expands card but cannot capture without controller grant; leave clears pending request"
    );
    app.emit(AppMsg::HoverGrant(token, epoch, 41));
    app.emit(AppMsg::Focus(id.clone(), true));
    pump();
    assert_eq!(
        root.keyboard_mode(),
        KeyboardMode::None,
        "late grant after leave denied"
    );
    assert!(!app.model().expanded());
    let revision = app.model().revision;
    app.emit(AppMsg::FocusStrip(revision, app.model().interaction_epoch));
    pump();
    assert!(app.model().keyboard_active);
    assert!(app.model().expanded());
    assert_eq!(root.keyboard_mode(), KeyboardMode::Exclusive);
    let next = app.model().order[1].clone();
    type_keys(&["-k", "Right"]);
    pump();
    assert_eq!(app.model().keyboard_focused.as_deref(), Some(next.as_str()));
    type_keys(&["-M", "shift", "-k", "Right", "-m", "shift"]);
    pump();
    assert_eq!(app.model().order[2], next);
    type_keys(&["fixture"]);
    pump();
    assert_eq!(app.model().query, "fixture");
    type_keys(&["-k", "Escape"]);
    pump();
    assert_clean(&app.model());
    assert_eq!(root.keyboard_mode(), KeyboardMode::None);
    println!(
        "GUI PASS: explicit shortcut captures keyboard/search, real Escape returns it and clears UI"
    );

    let mut scrollable = demo_view();
    scrollable.revision = revision + 1;
    scrollable.focused_card_id = None;
    for i in 0..4 {
        let mut extra = scrollable.sessions[0].clone();
        extra.card_id = format!("scroll-extra-{i}");
        extra.session_id = extra.card_id.clone();
        scrollable.sessions.push(extra);
    }
    app.emit(AppMsg::View(scrollable.clone()));
    pump();
    let adjustment = app.widgets().scroller.hadjustment();
    pump_until(
        || adjustment.upper() > adjustment.page_size(),
        "fixture must actually overflow for stale-scroll proof",
    );
    move_pointer(&mut pointer, &mut events, 60, 40);
    assert!(app.model().brand_hovered);
    let brand_generation = app.model().brand_generation;
    let collapse_generation = app.model().collapse_generation;
    let ticket = app.model().lifetime.ticket();
    // Queue a real two-frame focused-card scroll, then hide before its frames can run.
    adjustment.set_value(0.0);
    let mut pending_scroll = scrollable.clone();
    pending_scroll.revision = revision + 2;
    pending_scroll.focused_card_id = Some("scroll-extra-3".into());
    app.emit(AppMsg::View(pending_scroll));
    let mut hidden = scrollable.clone();
    hidden.revision = revision + 3;
    hidden.visible = false;
    app.emit(AppMsg::View(hidden));
    app.emit(AppMsg::BrandSettle(brand_generation));
    app.emit(AppMsg::CollapseIf(collapse_generation));
    app.emit(AppMsg::Hover(id.clone(), true));
    app.emit(AppMsg::BrandHover(true));
    app.emit(AppMsg::DirectoryHover(true));
    app.emit(AppMsg::DirectoryKey(DirectoryKey::Char('4')));
    app.emit(AppMsg::FocusStrip(revision, app.model().interaction_epoch));
    pump();
    assert_clean(&app.model());
    assert!(!root.is_visible());
    assert_eq!(root.default_size().1, COMPACT_HEIGHT);
    assert_eq!(root.exclusive_zone(), -1);
    assert!(!app.model().lifetime.accepts(ticket, true, true));
    move_pointer(&mut pointer, &mut events, 300, 900);
    let mut shown = scrollable;
    shown.revision = revision + 4;
    shown.focused_card_id = None;
    app.emit(AppMsg::View(shown));
    pump();
    assert_clean(&app.model());
    assert_eq!(root.default_size().1, COMPACT_HEIGHT);
    assert_eq!(
        adjustment.value(),
        0.0,
        "revoked scroll cannot run after remap"
    );
    // A queued synthetic enter after returning cannot substitute for actual pointer presence.
    app.emit(AppMsg::Hover(id, true));
    app.emit(AppMsg::BrandHover(true));
    app.emit(AppMsg::DirectoryHover(true));
    pump();
    assert_clean(&app.model());
    println!(
        "GUI PASS: hidden surface releases zone; late brand/hover/key/focus callbacks no-op; return collapsed"
    );
    pointer.stdin.take();
    assert!(pointer.wait().unwrap().success());
    root.close();
    drop(app);
    pump();

    let app = App::builder()
        .launch(AppInit {
            demo: true,
            click_through: true,
        })
        .detach();
    pump();
    app.emit(AppMsg::FocusStrip(
        app.model().revision,
        app.model().interaction_epoch,
    ));
    app.emit(AppMsg::BrandHover(true));
    pump();
    assert_clean(&app.model());
    assert_eq!(app.widget().keyboard_mode(), KeyboardMode::None);
    println!("GUI PASS: click-through rejects keyboard and hover engagement");
    app.widget().close();
    fixture.close();
}
