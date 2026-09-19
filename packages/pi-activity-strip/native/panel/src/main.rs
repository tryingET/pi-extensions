mod app;
mod card_view;
mod protocol;
mod runtime;

use app::{App, AppInit};
use relm4::RelmApp;

#[cfg(target_os = "linux")]
fn bind_lifetime_to_parent() {
    unsafe {
        libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
        if libc::getppid() == 1 {
            std::process::exit(1);
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn bind_lifetime_to_parent() {}

const APPLICATION_ID: &str = "com.tryinget.pi-activity-strip.panel";
/// Keeps the display element well inside the 255-byte limit of a D-Bus name.
const DISPLAY_ELEMENT_MAX: usize = 64;

/// GTK uniqueness is scoped to one Wayland display. A second panel on the same compositor is
/// refused, so no second ribbon can reserve another band, while a panel inside a nested
/// compositor (the demo, a preview, a test) runs on its own instead of handing itself off.
fn application_id(wayland_display: Option<&str>) -> String {
    // GTK connects to `wayland-0` when the variable is unset, and a socket path names the same
    // compositor as its file name, so every spelling of one display shares one id.
    let raw = wayland_display
        .filter(|display| !display.is_empty())
        .unwrap_or("wayland-0");
    let name = raw.rsplit('/').next().unwrap_or(raw);
    let display: String = name
        .chars()
        .take(DISPLAY_ELEMENT_MAX)
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    format!("{APPLICATION_ID}.d_{display}")
}

fn main() {
    bind_lifetime_to_parent();
    let demo = std::env::var("PI_ACTIVITY_STRIP_PANEL_DEMO").as_deref() == Ok("1");
    let click_through = std::env::var("PI_ACTIVITY_STRIP_CLICK_THROUGH").as_deref() == Ok("1");
    let display = std::env::var("WAYLAND_DISPLAY").ok();
    let app = RelmApp::new(&application_id(display.as_deref())).visible_on_activate(false);
    app.run::<App>(AppInit {
        demo,
        click_through,
    });
    // A second panel on this display hands its activation to the first and returns without ever
    // starting. It used to exit 0 having drawn nothing; say so and fail instead. Registration can
    // also fail this way, so the message names the likely cause rather than asserting it.
    if !protocol::was_ready() {
        protocol::emit_error(
            "The panel returned without starting; another activity-strip panel probably already runs on this Wayland display.",
        );
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::application_id;

    #[test]
    fn uniqueness_is_scoped_to_the_wayland_display() {
        assert_eq!(
            application_id(Some("wayland-1")),
            "com.tryinget.pi-activity-strip.panel.d_wayland_1"
        );
        assert_ne!(
            application_id(Some("wayland-1")),
            application_id(Some("wayland-2")),
            "a panel in a nested compositor never hands off to the live one"
        );
        assert_eq!(
            application_id(Some("/run/user/1000/wayland-1")),
            application_id(Some("wayland-1")),
            "a socket path and its name are the same compositor"
        );
        assert_eq!(
            application_id(None),
            application_id(Some("wayland-0")),
            "GTK connects to wayland-0 when the variable is unset"
        );
        assert_eq!(application_id(Some("")), application_id(Some("wayland-0")));
        let long = application_id(Some(&"x".repeat(400)));
        assert!(long.len() <= 255, "a D-Bus name is at most 255 bytes");
    }
}
