use std::cell::Cell;
use std::rc::Rc;

/// Shared with delayed GTK callbacks. Revocation survives a hide/show cycle, unlike `is_mapped`.
#[derive(Clone, Default)]
pub struct InteractionLifetime(Rc<Cell<u64>>);

impl InteractionLifetime {
    pub fn invalidate(&self) {
        self.0.set(self.0.get().wrapping_add(1));
    }

    pub fn ticket(&self) -> u64 {
        self.0.get()
    }

    pub fn accepts(&self, ticket: u64, visible: bool, interactive: bool) -> bool {
        visible && interactive && ticket == self.ticket()
    }
}

/// Only an explicit shortcut may request a keyboard mode. Pointer entry is never such a request.
pub fn accepts_pointer(visible: bool, interactive: bool, mapped: bool, contains: bool) -> bool {
    visible && interactive && mapped && contains
}

pub fn surface_state(visible: bool, expanded: bool) -> (i32, i32) {
    (
        if visible && expanded { 276 } else { 84 },
        if visible { 84 } else { -1 },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hide_and_return_revoke_old_scroll_and_timer_tickets() {
        let lifetime = InteractionLifetime::default();
        let callback = lifetime.clone();
        let ticket = lifetime.ticket();
        assert!(callback.accepts(ticket, true, true));
        lifetime.invalidate();
        assert!(!callback.accepts(ticket, false, true));
        assert!(!callback.accepts(ticket, true, true));
        assert!(!callback.accepts(lifetime.ticket(), true, false));
    }

    #[test]
    fn invisible_surface_cannot_expand_or_reclaim_zone() {
        assert_eq!(surface_state(false, true), (84, -1));
        assert_eq!(surface_state(false, false), (84, -1));
        assert_eq!(surface_state(true, false), (84, 84));
        assert_eq!(surface_state(true, true), (276, 84));
    }

    #[test]
    fn pending_hover_requires_actual_pointer_on_an_interactive_mapped_surface() {
        for facts in [
            (false, true, true, true),
            (true, false, true, true),
            (true, true, false, true),
            (true, true, true, false),
        ] {
            assert!(!accepts_pointer(facts.0, facts.1, facts.2, facts.3));
        }
        assert!(accepts_pointer(true, true, true, true));
    }
}
