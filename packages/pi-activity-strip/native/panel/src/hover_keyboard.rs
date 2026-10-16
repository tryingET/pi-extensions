use std::sync::OnceLock;
use std::time::Instant;

/// Idle ownership uses monotonic time, never the wall clock used for telemetry labels.
pub fn monotonic_ms() -> i64 {
    static START: OnceLock<Instant> = OnceLock::new();
    START
        .get_or_init(Instant::now)
        .elapsed()
        .as_millis()
        .try_into()
        .unwrap_or(i64::MAX)
}

/// Pointer-entry attempts are not data revisions or callback tickets. Tokens never repeat during
/// a panel lifetime; leaving, hiding or explicit entry invalidates the pending attempt, not the counter.
#[derive(Default, Debug)]
pub struct HoverKeyboard {
    next_token: u64,
    pub inside: bool,
    pub pending: Option<(u64, u64)>, // token, controller identity epoch
    pub active: bool,
    pub captured: bool,
    touched_at: i64,
}

impl HoverKeyboard {
    pub fn request(&mut self, epoch: u64, now: i64) -> Option<u64> {
        if self.pending.is_some() || self.active {
            return None;
        }
        self.next_token += 1;
        self.pending = Some((self.next_token, epoch));
        self.touched_at = now;
        Some(self.next_token)
    }

    pub fn grant(
        &mut self,
        token: u64,
        epoch: u64,
        current_epoch: u64,
        pointer_valid: bool,
        now: i64,
    ) -> bool {
        if self.pending != Some((token, epoch))
            || epoch != current_epoch
            || !pointer_valid
            || now.saturating_sub(self.touched_at) >= 3_000
        {
            return false;
        }
        self.pending = None;
        self.active = true;
        self.captured = false;
        self.touched_at = now;
        true
    }

    /// GTK focus confirms application of an ALREADY authorized grab; it never grants permission.
    pub fn acquired(&mut self, now: i64) -> bool {
        if !self.active || self.captured || self.expired(now) {
            return false;
        }
        self.captured = true;
        self.touched_at = now;
        true
    }

    pub fn touch(&mut self, now: i64) {
        if self.captured {
            self.touched_at = now;
        }
    }

    pub fn expired(&self, now: i64) -> bool {
        // A parked nested compositor can take several seconds to commit a layer-shell change.
        // Acquisition is separately bounded; the typing idle clock starts on actual focus.
        let limit = if self.active && !self.captured {
            10_000
        } else {
            3_000
        };
        (self.active || self.pending.is_some()) && now.saturating_sub(self.touched_at) >= limit
    }

    /// Retain `inside` on timeout/Escape: ordinary telemetry or child crossings cannot recapture.
    /// Only a fresh physical region entry or click may request again.
    pub fn clear(&mut self) -> Option<u64> {
        self.active = false;
        self.captured = false;
        self.pending.take().map(|(token, _)| token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attempts_in_one_epoch_are_unique_and_old_grants_cannot_win() {
        let mut h = HoverKeyboard::default();
        let first = h.request(7, 0).unwrap();
        assert_eq!(h.clear(), Some(first));
        let second = h.request(7, 10).unwrap();
        assert_ne!(first, second);
        assert!(!h.grant(first, 7, 7, true, 11));
        assert_eq!(h.pending, Some((second, 7)));
        assert!(!h.grant(second, 7, 8, true, 11));
        assert!(!h.grant(second, 7, 7, false, 11));
        assert!(h.grant(second, 7, 7, true, 11));
    }

    #[test]
    fn hide_show_and_explicit_upgrade_revoke_pending_grants() {
        let mut h = HoverKeyboard::default();
        let token = h.request(1, 0).unwrap();
        h.clear();
        assert!(!h.grant(token, 1, 1, true, 1));
        let next = h.request(3, 2).unwrap();
        assert!(!h.grant(token, 1, 3, true, 3));
        assert!(h.grant(next, 3, 3, true, 3));
    }

    #[test]
    fn grant_expires_even_before_the_next_tick_is_dispatched() {
        let mut h = HoverKeyboard::default();
        let token = h.request(7, 0).unwrap();
        assert!(!h.grant(token, 7, 7, true, 3_000));
        h.clear();
        let next = h.request(7, 3_001).unwrap();
        assert!(!h.grant(token, 7, 7, true, 3_002));
        assert!(h.grant(next, 7, 7, true, 3_002));
    }

    #[test]
    fn pending_acquisition_and_actual_capture_have_separate_bounded_lifetimes() {
        let mut h = HoverKeyboard::default();
        assert!(!h.acquired(0), "GTK focus alone is not authorization");
        let token = h.request(1, 0).unwrap();
        assert!(h.expired(3_000), "controller handshake cannot wait forever");
        assert!(h.grant(token, 1, 1, true, 10));
        assert!(!h.expired(3_010), "not yet holding any keyboard input");
        h.touch(9_999);
        assert!(
            h.expired(10_010),
            "pre-focus key/GTK noise cannot prolong acquisition"
        );
        assert!(h.acquired(6_000));
        assert!(
            !h.acquired(7_000),
            "ordinary GTK activity cannot restart idle"
        );
        assert!(!h.expired(8_999));
        assert!(h.expired(9_000));
        h.clear();
        assert!(
            !h.acquired(9_001),
            "late GTK focus cannot revive a revoked claim"
        );
    }

    #[test]
    fn applied_focus_at_acquisition_expiry_cannot_restart_an_expired_claim() {
        let mut h = HoverKeyboard::default();
        let token = h.request(1, 0).unwrap();
        assert!(h.grant(token, 1, 1, true, 1));
        assert!(!h.acquired(10_001));
        h.clear();
        let next = h.request(1, 10_002).unwrap();
        assert!(!h.grant(token, 1, 1, true, 10_003));
        assert!(h.grant(next, 1, 1, true, 10_003));
        assert!(h.acquired(10_004));
    }

    #[test]
    fn idle_is_bounded_even_with_query_and_does_not_invent_new_pointer_entry() {
        let mut h = HoverKeyboard {
            inside: true,
            ..Default::default()
        };
        let token = h.request(1, 0).unwrap();
        assert!(h.grant(token, 1, 1, true, 10));
        assert!(h.acquired(10));
        assert!(!h.expired(3_009));
        h.touch(2_500);
        assert!(!h.expired(5_499));
        assert!(h.expired(5_500));
        h.clear();
        assert!(h.inside);
        assert!(!h.active);
        assert!(h.pending.is_none());
    }
}
