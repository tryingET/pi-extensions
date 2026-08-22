---------------------- MODULE ControllerSafety ----------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Calls, MaxCredits, MaxGeneration

ASSUME /\ Calls # {}
       /\ MaxCredits \in Nat \ {0}
       /\ MaxGeneration \in Nat \ {0, 1}

Effects == {"none", "read", "mutation"}
States == {
  "NONE",
  "ADMITTED",
  "QUEUED",
  "STARTED",
  "CANCEL_REQUESTED",
  "TERMINAL_KNOWN",
  "TERMINAL_CANCELLED_KNOWN",
  "TERMINAL_UNKNOWN",
  "CANCELLED_PRE_EFFECT"
}
LeaseStates == {"READY", "QUARANTINED"}
TerminalStates == {
  "TERMINAL_KNOWN",
  "TERMINAL_CANCELLED_KNOWN",
  "TERMINAL_UNKNOWN",
  "CANCELLED_PRE_EFFECT"
}

VARIABLES
  state,
  effect,
  processBacked,
  durableAdmitted,
  startedCount,
  activeReaders,
  mutationOwner,
  descendants,
  generation,
  credits,
  pending,
  emittedSeq,
  ackSeq,
  leaseState

vars == <<
  state,
  effect,
  processBacked,
  durableAdmitted,
  startedCount,
  activeReaders,
  mutationOwner,
  descendants,
  generation,
  credits,
  pending,
  emittedSeq,
  ackSeq,
  leaseState
>>

Init ==
  /\ state = [c \in Calls |-> "NONE"]
  /\ effect = [c \in Calls |-> "none"]
  /\ processBacked = [c \in Calls |-> FALSE]
  /\ durableAdmitted = [c \in Calls |-> FALSE]
  /\ startedCount = [c \in Calls |-> 0]
  /\ activeReaders = {}
  /\ mutationOwner = "NONE"
  /\ descendants = [c \in Calls |-> FALSE]
  /\ generation = 1
  /\ credits = [c \in Calls |-> MaxCredits]
  /\ pending = [c \in Calls |-> 0]
  /\ emittedSeq = [c \in Calls |-> 0]
  /\ ackSeq = [c \in Calls |-> 0]
  /\ leaseState = "READY"

AdmitRead(c, backed) ==
  /\ leaseState = "READY"
  /\ state[c] = "NONE"
  /\ backed \in BOOLEAN
  /\ state' = [state EXCEPT ![c] = "ADMITTED"]
  /\ effect' = [effect EXCEPT ![c] = "read"]
  /\ processBacked' = [processBacked EXCEPT ![c] = backed]
  /\ UNCHANGED <<durableAdmitted, startedCount, activeReaders,
                  mutationOwner, descendants, generation, credits,
                  pending, emittedSeq, ackSeq, leaseState>>

AdmitMutation(c, backed) ==
  /\ leaseState = "READY"
  /\ state[c] = "NONE"
  /\ backed \in BOOLEAN
  /\ state' = [state EXCEPT ![c] = "ADMITTED"]
  /\ effect' = [effect EXCEPT ![c] = "mutation"]
  /\ processBacked' = [processBacked EXCEPT ![c] = backed]
  /\ durableAdmitted' = [durableAdmitted EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<startedCount, activeReaders, mutationOwner,
                  descendants, generation, credits, pending,
                  emittedSeq, ackSeq, leaseState>>

Queue(c) ==
  /\ state[c] = "ADMITTED"
  /\ state' = [state EXCEPT ![c] = "QUEUED"]
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, mutationOwner,
                  descendants, generation, credits, pending,
                  emittedSeq, ackSeq, leaseState>>

StartRead(c) ==
  /\ state[c] \in {"ADMITTED", "QUEUED"}
  /\ effect[c] = "read"
  /\ mutationOwner = "NONE"
  /\ state' = [state EXCEPT ![c] = "STARTED"]
  /\ startedCount' = [startedCount EXCEPT ![c] = @ + 1]
  /\ activeReaders' = activeReaders \cup {c}
  /\ descendants' = [descendants EXCEPT ![c] = processBacked[c]]
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  mutationOwner, generation, credits, pending,
                  emittedSeq, ackSeq, leaseState>>

StartMutation(c) ==
  /\ state[c] \in {"ADMITTED", "QUEUED"}
  /\ effect[c] = "mutation"
  /\ durableAdmitted[c]
  /\ activeReaders = {}
  /\ mutationOwner = "NONE"
  /\ state' = [state EXCEPT ![c] = "STARTED"]
  /\ startedCount' = [startedCount EXCEPT ![c] = @ + 1]
  /\ mutationOwner' = c
  /\ descendants' = [descendants EXCEPT ![c] = processBacked[c]]
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  activeReaders, generation, credits, pending,
                  emittedSeq, ackSeq, leaseState>>

Emit(c) ==
  /\ state[c] \in {"STARTED", "CANCEL_REQUESTED"}
  /\ credits[c] > 0
  /\ credits' = [credits EXCEPT ![c] = @ - 1]
  /\ pending' = [pending EXCEPT ![c] = @ + 1]
  /\ emittedSeq' = [emittedSeq EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<state, effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, mutationOwner,
                  descendants, generation, ackSeq, leaseState>>

Acknowledge(c) ==
  /\ state[c] \in {"STARTED", "CANCEL_REQUESTED"}
  /\ pending[c] > 0
  /\ ackSeq[c] < emittedSeq[c]
  /\ credits' = [credits EXCEPT ![c] = @ + 1]
  /\ pending' = [pending EXCEPT ![c] = @ - 1]
  /\ ackSeq' = [ackSeq EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<state, effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, mutationOwner,
                  descendants, generation, emittedSeq, leaseState>>

ReplayAck(c) ==
  /\ ackSeq[c] > 0
  /\ UNCHANGED vars

RequestCancel(c) ==
  /\ state[c] = "STARTED"
  /\ state' = [state EXCEPT ![c] = "CANCEL_REQUESTED"]
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, mutationOwner,
                  descendants, generation, credits, pending,
                  emittedSeq, ackSeq, leaseState>>

CancelPreEffect(c) ==
  /\ state[c] \in {"ADMITTED", "QUEUED"}
  /\ state' = [state EXCEPT ![c] = "CANCELLED_PRE_EFFECT"]
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, mutationOwner,
                  descendants, generation, credits, pending,
                  emittedSeq, ackSeq, leaseState>>

Cleanup(c) ==
  /\ state[c] \in {"STARTED", "CANCEL_REQUESTED"}
  /\ descendants[c]
  /\ descendants' = [descendants EXCEPT ![c] = FALSE]
  /\ UNCHANGED <<state, effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, mutationOwner,
                  generation, credits, pending, emittedSeq,
                  ackSeq, leaseState>>

FinishRead(c) ==
  /\ state[c] = "STARTED"
  /\ effect[c] = "read"
  /\ ~descendants[c]
  /\ state' = [state EXCEPT ![c] = "TERMINAL_KNOWN"]
  /\ activeReaders' = activeReaders \ {c}
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, mutationOwner, descendants,
                  generation, credits, pending, emittedSeq,
                  ackSeq, leaseState>>

FinishMutation(c) ==
  /\ state[c] = "STARTED"
  /\ effect[c] = "mutation"
  /\ mutationOwner = c
  /\ ~descendants[c]
  /\ generation < MaxGeneration
  /\ state' = [state EXCEPT ![c] = "TERMINAL_KNOWN"]
  /\ mutationOwner' = "NONE"
  /\ generation' = generation + 1
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, descendants,
                  credits, pending, emittedSeq, ackSeq, leaseState>>

FinishCancelledRead(c) ==
  /\ state[c] = "CANCEL_REQUESTED"
  /\ effect[c] = "read"
  /\ ~descendants[c]
  /\ state' = [state EXCEPT ![c] = "TERMINAL_CANCELLED_KNOWN"]
  /\ activeReaders' = activeReaders \ {c}
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, mutationOwner, descendants,
                  generation, credits, pending, emittedSeq,
                  ackSeq, leaseState>>

FinishCancelledMutationNoChange(c) ==
  /\ state[c] = "CANCEL_REQUESTED"
  /\ effect[c] = "mutation"
  /\ mutationOwner = c
  /\ ~descendants[c]
  /\ state' = [state EXCEPT ![c] = "TERMINAL_CANCELLED_KNOWN"]
  /\ mutationOwner' = "NONE"
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, descendants,
                  generation, credits, pending, emittedSeq,
                  ackSeq, leaseState>>

FinishCancelledMutationKnown(c) ==
  /\ state[c] = "CANCEL_REQUESTED"
  /\ effect[c] = "mutation"
  /\ mutationOwner = c
  /\ ~descendants[c]
  /\ generation < MaxGeneration
  /\ state' = [state EXCEPT ![c] = "TERMINAL_CANCELLED_KNOWN"]
  /\ mutationOwner' = "NONE"
  /\ generation' = generation + 1
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, activeReaders, descendants,
                  credits, pending, emittedSeq, ackSeq, leaseState>>

LoseOutcome(c) ==
  /\ state[c] \in {"STARTED", "CANCEL_REQUESTED"}
  /\ state' = [state EXCEPT ![c] = "TERMINAL_UNKNOWN"]
  /\ activeReaders' = activeReaders \ {c}
  /\ mutationOwner' = IF mutationOwner = c THEN "NONE" ELSE mutationOwner
  /\ leaseState' =
       IF effect[c] = "mutation" \/ descendants[c]
       THEN "QUARANTINED"
       ELSE leaseState
  /\ UNCHANGED <<effect, processBacked, durableAdmitted,
                  startedCount, descendants, generation,
                  credits, pending, emittedSeq, ackSeq>>

Idle == UNCHANGED vars

Next ==
  \/ \E c \in Calls, backed \in BOOLEAN : AdmitRead(c, backed)
  \/ \E c \in Calls, backed \in BOOLEAN : AdmitMutation(c, backed)
  \/ \E c \in Calls : Queue(c)
  \/ \E c \in Calls : StartRead(c)
  \/ \E c \in Calls : StartMutation(c)
  \/ \E c \in Calls : Emit(c)
  \/ \E c \in Calls : Acknowledge(c)
  \/ \E c \in Calls : ReplayAck(c)
  \/ \E c \in Calls : RequestCancel(c)
  \/ \E c \in Calls : CancelPreEffect(c)
  \/ \E c \in Calls : Cleanup(c)
  \/ \E c \in Calls : FinishRead(c)
  \/ \E c \in Calls : FinishMutation(c)
  \/ \E c \in Calls : FinishCancelledRead(c)
  \/ \E c \in Calls : FinishCancelledMutationNoChange(c)
  \/ \E c \in Calls : FinishCancelledMutationKnown(c)
  \/ \E c \in Calls : LoseOutcome(c)
  \/ Idle

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ state \in [Calls -> States]
  /\ effect \in [Calls -> Effects]
  /\ processBacked \in [Calls -> BOOLEAN]
  /\ durableAdmitted \in [Calls -> BOOLEAN]
  /\ startedCount \in [Calls -> Nat]
  /\ activeReaders \subseteq Calls
  /\ mutationOwner \in Calls \cup {"NONE"}
  /\ descendants \in [Calls -> BOOLEAN]
  /\ generation \in 1..MaxGeneration
  /\ credits \in [Calls -> 0..MaxCredits]
  /\ pending \in [Calls -> 0..MaxCredits]
  /\ emittedSeq \in [Calls -> Nat]
  /\ ackSeq \in [Calls -> Nat]
  /\ leaseState \in LeaseStates

NoReadMutationOverlap ==
  mutationOwner = "NONE" \/ activeReaders = {}

OwnerMatchesStartedMutation ==
  \A c \in Calls :
    state[c] \in {"STARTED", "CANCEL_REQUESTED"} /\ effect[c] = "mutation"
      => mutationOwner = c

ReaderMatchesStartedRead ==
  \A c \in Calls :
    state[c] \in {"STARTED", "CANCEL_REQUESTED"} /\ effect[c] = "read"
      => c \in activeReaders

D1ExecutionDurable ==
  \A c \in Calls : startedCount[c] > 0 /\ effect[c] = "mutation"
    => durableAdmitted[c]

AtMostOnceStart ==
  \A c \in Calls : startedCount[c] <= 1

KnownTerminalCleanup ==
  \A c \in Calls :
    state[c] \in {"TERMINAL_KNOWN", "TERMINAL_CANCELLED_KNOWN"}
      => ~descendants[c]

UnknownMutationQuarantines ==
  (\E c \in Calls : state[c] = "TERMINAL_UNKNOWN" /\ effect[c] = "mutation")
    => leaseState = "QUARANTINED"

UnknownCleanupQuarantines ==
  (\E c \in Calls : state[c] = "TERMINAL_UNKNOWN" /\ descendants[c])
    => leaseState = "QUARANTINED"

CreditsConserved ==
  \A c \in Calls : credits[c] + pending[c] = MaxCredits

AckBounded ==
  \A c \in Calls : ackSeq[c] <= emittedSeq[c]

TerminalHasNoOwnership ==
  \A c \in Calls :
    state[c] \in TerminalStates
      => c \notin activeReaders /\ mutationOwner # c

Safety ==
  /\ TypeOK
  /\ NoReadMutationOverlap
  /\ OwnerMatchesStartedMutation
  /\ ReaderMatchesStartedRead
  /\ D1ExecutionDurable
  /\ AtMostOnceStart
  /\ KnownTerminalCleanup
  /\ UnknownMutationQuarantines
  /\ UnknownCleanupQuarantines
  /\ CreditsConserved
  /\ AckBounded
  /\ TerminalHasNoOwnership

=====================================================================
