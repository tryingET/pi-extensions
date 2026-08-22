--------------------- MODULE PiToolBoundaryV03 ---------------------
EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS Clients, Calls, MaxGeneration, MaxResources, MaxCredits, Generations

ASSUME /\ Clients # {}
       /\ Calls # {}
       /\ Generations # {}
       /\ MaxGeneration \in Nat \ {0}
       /\ MaxResources \in Nat \ {0}
       /\ MaxCredits \in Nat \ {0}

Operations == {"READ", "LIST", "GREP", "FIND", "WRITE", "EDIT", "EXEC"}
D0Operations == {"READ", "LIST", "GREP", "FIND"}
D1Operations == {"WRITE", "EDIT", "EXEC"}
Durabilities == {"D0", "D1"}
CallStates == {"NONE", "VALIDATED", "VOLATILE", "DURABLE", "QUEUED", "STARTED", "TERMINAL", "UNKNOWN", "CANCELLED"}
TerminalKinds == {"NONE", "SUCCESS", "FAILED", "UNKNOWN", "CANCELLED"}
LeaseStates == {"READY", "DRAINING", "QUARANTINED", "CLOSED"}

DurabilityOf(op) == IF op \in D0Operations THEN "D0" ELSE "D1"

VARIABLES
  leaseState,
  leaseGeneration,
  eligibleGenerations,
  clientEpoch,
  callClient,
  callEpoch,
  operation,
  durability,
  callState,
  terminal,
  executeCount,
  durableAdmission,
  durableTerminal,
  mutationOwner,
  workspaceGeneration,
  generationAtStart,
  workspaceKnown,
  descendants,
  credits,
  buffered,
  reservedResources

vars == <<
  leaseState, leaseGeneration, eligibleGenerations,
  clientEpoch, callClient, callEpoch, operation, durability,
  callState, terminal, executeCount, durableAdmission, durableTerminal,
  mutationOwner, workspaceGeneration, generationAtStart, workspaceKnown,
  descendants, credits, buffered, reservedResources
>>

Init ==
  /\ leaseState = "READY"
  /\ leaseGeneration \in Generations
  /\ eligibleGenerations = Generations
  /\ clientEpoch = [c \in Clients |-> 0]
  /\ callClient = [k \in Calls |-> CHOOSE c \in Clients : TRUE]
  /\ callEpoch = [k \in Calls |-> 0]
  /\ operation = [k \in Calls |-> "READ"]
  /\ durability = [k \in Calls |-> "D0"]
  /\ callState = [k \in Calls |-> "NONE"]
  /\ terminal = [k \in Calls |-> "NONE"]
  /\ executeCount = [k \in Calls |-> 0]
  /\ durableAdmission = [k \in Calls |-> FALSE]
  /\ durableTerminal = [k \in Calls |-> FALSE]
  /\ mutationOwner = "NONE"
  /\ workspaceGeneration = 1
  /\ generationAtStart = [k \in Calls |-> 0]
  /\ workspaceKnown = TRUE
  /\ descendants = [k \in Calls |-> FALSE]
  /\ credits = [k \in Calls |-> MaxCredits]
  /\ buffered = [k \in Calls |-> 0]
  /\ reservedResources = 0

RegisterNewEpoch(c) ==
  /\ clientEpoch' = [clientEpoch EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations,
                  callClient, callEpoch, operation, durability, callState,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered,
                  reservedResources>>

Validate(k, c, op) ==
  /\ callState[k] = "NONE"
  /\ leaseState = "READY"
  /\ leaseGeneration \in eligibleGenerations
  /\ op \in Operations
  /\ callClient' = [callClient EXCEPT ![k] = c]
  /\ callEpoch' = [callEpoch EXCEPT ![k] = clientEpoch[c]]
  /\ operation' = [operation EXCEPT ![k] = op]
  /\ durability' = [durability EXCEPT ![k] = DurabilityOf(op)]
  /\ callState' = [callState EXCEPT ![k] = "VALIDATED"]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered,
                  reservedResources>>

AcceptD0(k) ==
  /\ callState[k] = "VALIDATED"
  /\ durability[k] = "D0"
  /\ callEpoch[k] = clientEpoch[callClient[k]]
  /\ callState' = [callState EXCEPT ![k] = "VOLATILE"]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, terminal,
                  executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered,
                  reservedResources>>

AcceptD1(k) ==
  /\ callState[k] = "VALIDATED"
  /\ durability[k] = "D1"
  /\ callEpoch[k] = clientEpoch[callClient[k]]
  /\ callState' = [callState EXCEPT ![k] = "DURABLE"]
  /\ durableAdmission' = [durableAdmission EXCEPT ![k] = TRUE]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, terminal,
                  executeCount, durableTerminal, mutationOwner,
                  workspaceGeneration, generationAtStart, workspaceKnown,
                  descendants, credits, buffered, reservedResources>>

Queue(k) ==
  /\ callState[k] \in {"VOLATILE", "DURABLE"}
  /\ callState' = [callState EXCEPT ![k] = "QUEUED"]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, terminal,
                  executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered,
                  reservedResources>>

StartD0(k) ==
  /\ callState[k] \in {"VOLATILE", "QUEUED"}
  /\ durability[k] = "D0"
  /\ callEpoch[k] = clientEpoch[callClient[k]]
  /\ executeCount[k] = 0
  /\ callState' = [callState EXCEPT ![k] = "STARTED"]
  /\ executeCount' = [executeCount EXCEPT ![k] = 1]
  /\ generationAtStart' = [generationAtStart EXCEPT ![k] = workspaceGeneration]
  /\ descendants' = [descendants EXCEPT ![k] = TRUE]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, terminal,
                  durableAdmission, durableTerminal, mutationOwner,
                  workspaceGeneration, workspaceKnown, credits, buffered,
                  reservedResources>>

StartD1(k) ==
  /\ callState[k] \in {"DURABLE", "QUEUED"}
  /\ durability[k] = "D1"
  /\ durableAdmission[k]
  /\ mutationOwner = "NONE"
  /\ workspaceKnown
  /\ callEpoch[k] = clientEpoch[callClient[k]]
  /\ executeCount[k] = 0
  /\ callState' = [callState EXCEPT ![k] = "STARTED"]
  /\ executeCount' = [executeCount EXCEPT ![k] = 1]
  /\ generationAtStart' = [generationAtStart EXCEPT ![k] = workspaceGeneration]
  /\ descendants' = [descendants EXCEPT ![k] = TRUE]
  /\ mutationOwner' = k
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, terminal,
                  durableAdmission, durableTerminal, workspaceGeneration,
                  workspaceKnown, credits, buffered, reservedResources>>

Cleanup(k) ==
  /\ callState[k] = "STARTED"
  /\ descendants[k]
  /\ descendants' = [descendants EXCEPT ![k] = FALSE]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, callState,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, credits, buffered, reservedResources>>

FinishD0(k, result) ==
  /\ callState[k] = "STARTED"
  /\ durability[k] = "D0"
  /\ ~descendants[k]
  /\ result \in {"SUCCESS", "FAILED"}
  /\ workspaceGeneration = generationAtStart[k]
  /\ callState' = [callState EXCEPT ![k] = "TERMINAL"]
  /\ terminal' = [terminal EXCEPT ![k] = result]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, executeCount,
                  durableAdmission, durableTerminal, mutationOwner,
                  workspaceGeneration, generationAtStart, workspaceKnown,
                  descendants, credits, buffered, reservedResources>>

FinishD1(k, result) ==
  /\ callState[k] = "STARTED"
  /\ durability[k] = "D1"
  /\ mutationOwner = k
  /\ ~descendants[k]
  /\ workspaceKnown
  /\ result \in {"SUCCESS", "FAILED"}
  /\ workspaceGeneration = generationAtStart[k]
  /\ workspaceGeneration < MaxGeneration
  /\ callState' = [callState EXCEPT ![k] = "TERMINAL"]
  /\ terminal' = [terminal EXCEPT ![k] = result]
  /\ durableTerminal' = [durableTerminal EXCEPT ![k] = TRUE]
  /\ mutationOwner' = "NONE"
  /\ workspaceGeneration' = workspaceGeneration + 1
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, executeCount,
                  durableAdmission, generationAtStart, workspaceKnown,
                  descendants, credits, buffered, reservedResources>>

LoseD1(k) ==
  /\ callState[k] = "STARTED"
  /\ durability[k] = "D1"
  /\ mutationOwner = k
  /\ callState' = [callState EXCEPT ![k] = "UNKNOWN"]
  /\ terminal' = [terminal EXCEPT ![k] = "UNKNOWN"]
  /\ durableTerminal' = [durableTerminal EXCEPT ![k] = TRUE]
  /\ mutationOwner' = "NONE"
  /\ workspaceKnown' = FALSE
  /\ leaseState' = "QUARANTINED"
  /\ descendants' = [descendants EXCEPT ![k] = FALSE]
  /\ UNCHANGED <<leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, executeCount,
                  durableAdmission, workspaceGeneration, generationAtStart,
                  credits, buffered, reservedResources>>

CancelPreEffect(k) ==
  /\ callState[k] \in {"VALIDATED", "VOLATILE", "DURABLE", "QUEUED"}
  /\ callState' = [callState EXCEPT ![k] = "CANCELLED"]
  /\ terminal' = [terminal EXCEPT ![k] = "CANCELLED"]
  /\ durableTerminal' = [durableTerminal EXCEPT ![k] = IF durability[k] = "D1" THEN TRUE ELSE @]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, executeCount,
                  durableAdmission, mutationOwner, workspaceGeneration,
                  generationAtStart, workspaceKnown, descendants, credits,
                  buffered, reservedResources>>

Emit(k, amount) ==
  /\ callState[k] = "STARTED"
  /\ amount \in 1..credits[k]
  /\ buffered[k] + amount <= MaxCredits
  /\ credits' = [credits EXCEPT ![k] = @ - amount]
  /\ buffered' = [buffered EXCEPT ![k] = @ + amount]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, callState,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, reservedResources>>

GrantCredit(k, amount) ==
  /\ amount \in 1..buffered[k]
  /\ credits[k] + amount <= MaxCredits
  /\ credits' = [credits EXCEPT ![k] = @ + amount]
  /\ buffered' = [buffered EXCEPT ![k] = @ - amount]
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, callState,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, reservedResources>>

Reserve(amount) ==
  /\ amount \in 1..MaxResources
  /\ reservedResources + amount <= MaxResources
  /\ reservedResources' = reservedResources + amount
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, callState,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered>>

Release(amount) ==
  /\ amount \in 1..reservedResources
  /\ reservedResources' = reservedResources - amount
  /\ UNCHANGED <<leaseState, leaseGeneration, eligibleGenerations, clientEpoch,
                  callClient, callEpoch, operation, durability, callState,
                  terminal, executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered>>

InstallGeneration(g) ==
  /\ g \in Generations
  /\ eligibleGenerations' = eligibleGenerations \cup {g}
  /\ UNCHANGED <<leaseState, leaseGeneration, clientEpoch, callClient,
                  callEpoch, operation, durability, callState, terminal,
                  executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered,
                  reservedResources>>

DrainGeneration(g) ==
  /\ g \in eligibleGenerations
  /\ g # leaseGeneration
  /\ eligibleGenerations' = eligibleGenerations \ {g}
  /\ UNCHANGED <<leaseState, leaseGeneration, clientEpoch, callClient,
                  callEpoch, operation, durability, callState, terminal,
                  executeCount, durableAdmission, durableTerminal,
                  mutationOwner, workspaceGeneration, generationAtStart,
                  workspaceKnown, descendants, credits, buffered,
                  reservedResources>>

Next ==
  \/ \E c \in Clients : RegisterNewEpoch(c)
  \/ \E k \in Calls, c \in Clients, op \in Operations : Validate(k, c, op)
  \/ \E k \in Calls : AcceptD0(k) \/ AcceptD1(k) \/ Queue(k)
  \/ \E k \in Calls : StartD0(k) \/ StartD1(k) \/ Cleanup(k)
  \/ \E k \in Calls : FinishD0(k, "SUCCESS") \/ FinishD0(k, "FAILED")
  \/ \E k \in Calls : FinishD1(k, "SUCCESS") \/ FinishD1(k, "FAILED") \/ LoseD1(k)
  \/ \E k \in Calls : CancelPreEffect(k)
  \/ \E k \in Calls, amount \in 1..MaxCredits : Emit(k, amount) \/ GrantCredit(k, amount)
  \/ \E amount \in 1..MaxResources : Reserve(amount) \/ Release(amount)
  \/ \E g \in Generations : InstallGeneration(g) \/ DrainGeneration(g)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ leaseState \in LeaseStates
  /\ leaseGeneration \in Generations
  /\ eligibleGenerations \subseteq Generations
  /\ clientEpoch \in [Clients -> Nat]
  /\ callClient \in [Calls -> Clients]
  /\ callEpoch \in [Calls -> Nat]
  /\ operation \in [Calls -> Operations]
  /\ durability \in [Calls -> Durabilities]
  /\ callState \in [Calls -> CallStates]
  /\ terminal \in [Calls -> TerminalKinds]
  /\ executeCount \in [Calls -> 0..1]
  /\ durableAdmission \in [Calls -> BOOLEAN]
  /\ durableTerminal \in [Calls -> BOOLEAN]
  /\ mutationOwner \in Calls \cup {"NONE"}
  /\ workspaceGeneration \in 1..MaxGeneration
  /\ generationAtStart \in [Calls -> 0..MaxGeneration]
  /\ workspaceKnown \in BOOLEAN
  /\ descendants \in [Calls -> BOOLEAN]
  /\ credits \in [Calls -> 0..MaxCredits]
  /\ buffered \in [Calls -> 0..MaxCredits]
  /\ reservedResources \in 0..MaxResources

DerivedDurability == \A k \in Calls : durability[k] = DurabilityOf(operation[k])
D1ExecutionDurable == \A k \in Calls : executeCount[k] = 1 /\ durability[k] = "D1" => durableAdmission[k]
D1AtMostOnce == \A k \in Calls : executeCount[k] <= 1
D1SuccessDurable == \A k \in Calls : terminal[k] = "SUCCESS" /\ durability[k] = "D1" => durableTerminal[k]
SuccessNoDescendants == \A k \in Calls : terminal[k] = "SUCCESS" => ~descendants[k]
UnknownQuarantines == (\E k \in Calls : terminal[k] = "UNKNOWN") => leaseState = "QUARANTINED"
D0DoesNotOwnMutation ==
  mutationOwner = "NONE" \/ (\E k \in Calls : mutationOwner = k /\ durability[k] = "D1")
CreditsBounded == \A k \in Calls : credits[k] + buffered[k] = MaxCredits
ResourcesBounded == reservedResources <= MaxResources
LeaseGenerationEligible == leaseState = "READY" => leaseGeneration \in eligibleGenerations
Safety ==
  /\ TypeOK
  /\ DerivedDurability
  /\ D1ExecutionDurable
  /\ D1AtMostOnce
  /\ D1SuccessDurable
  /\ SuccessNoDescendants
  /\ UnknownQuarantines
  /\ D0DoesNotOwnMutation
  /\ CreditsBounded
  /\ ResourcesBounded
  /\ LeaseGenerationEligible

=============================================================================
