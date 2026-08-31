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

fn main() {
    bind_lifetime_to_parent();
    let demo = std::env::var("PI_ACTIVITY_STRIP_PANEL_DEMO").as_deref() == Ok("1");
    let click_through = std::env::var("PI_ACTIVITY_STRIP_CLICK_THROUGH").as_deref() == Ok("1");
    let app = RelmApp::new("com.tryinget.pi-activity-strip.panel").visible_on_activate(false);
    app.run::<App>(AppInit {
        demo,
        click_through,
    });
}
