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

/// A real mapped pointer is necessary for hover intent, but controller permission is ALSO required.
pub fn accepts_pointer(visible: bool, interactive: bool, mapped: bool, contains: bool) -> bool {
    visible && interactive && mapped && contains
}

/// Where a pointer that was inside the body sat when the panel hid. A Wayland pointer enter carries
/// no cause, so the compositor re-entering that unmoved pointer (remap, workspace return) looks like
/// a genuine return, except that it reproduces this exact surface position.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PointerAnchor {
    At(f64, f64),
    /// GDK had no position at hide: fail safe, the next entry is not taken as intent.
    Unknown,
}

/// Whether an entry is the anchored pointer coming back rather than a new arrival. An entry whose
/// position GDK cannot report is not evidence of movement either.
pub fn is_stationary_reentry(
    anchor: Option<PointerAnchor>,
    entered_at: Option<(f64, f64)>,
) -> bool {
    match anchor {
        Some(PointerAnchor::At(x, y)) => entered_at.is_none_or(|at| at == (x, y)),
        Some(PointerAnchor::Unknown) => true,
        None => false,
    }
}

/// A pointer anchor plus the mapped absences it has outlived. Only the first mapped/body-absent
/// Tick after a remap can fall before the compositor re-enters a stationary pointer; a second one,
/// a full Tick later, means the pointer is elsewhere, and the anchor stops applying.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HideAnchor {
    pub at: PointerAnchor,
    mapped_absences: u8,
}

impl HideAnchor {
    pub fn new(at: PointerAnchor) -> Self {
        Self {
            at,
            mapped_absences: 0,
        }
    }

    pub fn after_mapped_absence(self) -> Option<Self> {
        (self.mapped_absences == 0).then_some(Self {
            mapped_absences: 1,
            ..self
        })
    }
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

    #[test]
    fn given_a_pointer_anchored_at_hide_when_an_entry_arrives_then_only_movement_is_intent() {
        let anchor = Some(PointerAnchor::At(52.0, 32.0));
        // Then: the exact pre-hide position is the stationary pointer, not a new arrival.
        assert!(is_stationary_reentry(anchor, Some((52.0, 32.0))));
        assert!(
            is_stationary_reentry(anchor, None),
            "unknown entry position is not movement"
        );
        assert!(is_stationary_reentry(
            Some(PointerAnchor::Unknown),
            Some((1.0, 1.0))
        ));
        // Then: any other position, or no anchor at all, is a genuine entry.
        assert!(!is_stationary_reentry(anchor, Some((52.0, 32.5))));
        assert!(!is_stationary_reentry(anchor, Some((53.0, 32.0))));
        assert!(!is_stationary_reentry(None, Some((52.0, 32.0))));
        assert!(!is_stationary_reentry(None, None));
    }

    #[test]
    fn given_a_hide_anchor_when_mapped_absences_pass_then_only_the_first_is_survived() {
        let anchor = HideAnchor::new(PointerAnchor::At(52.0, 32.0));
        // Then: the remap-phase Tick (F02/F03) keeps the anchor.
        let survived = anchor.after_mapped_absence().expect("first mapped absence");
        assert_eq!(survived.at, PointerAnchor::At(52.0, 32.0));
        // Then: a second mapped absence a full Tick later ends it, Unknown included.
        assert_eq!(survived.after_mapped_absence(), None);
        let unknown = HideAnchor::new(PointerAnchor::Unknown);
        assert_eq!(
            unknown
                .after_mapped_absence()
                .unwrap()
                .after_mapped_absence(),
            None
        );
    }
}
