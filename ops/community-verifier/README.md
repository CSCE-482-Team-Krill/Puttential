# Verifier prototype and deployment gate

The selected target is one Ubuntu 24.04 DigitalOcean VM, two vCPUs, 4 GiB RAM,
with one credentialed supervisor and precisely two fixed execution units (`@0`, `@1`).
No resource is provisioned and no production credential is changed by these files.

The child implements bounded strict JSON IPC, exact artifact checksum verification,
canonical preparation/proof checking, trusted replay and a 7200-step benchmark. It
has no database or publication-commit API. The committed systemd template contains
the proposed OS controls; it has **not** been installed or tested on the selected VM.
No production supervisor, privileged launcher or DB finalization service is enabled.
Do not grant a runtime user unrestricted `systemctl` or deploy the child in the web app.

The local child test proves execution and IPC, not process-group isolation, total-memory
containment, watchdog independence, trusted result finalization or global slot capacity.
Its environment excludes database credentials. The actual deployment must independently
make network access, shell/service-manager access and access to credentials impossible.

Before PR1/M1 can pass, Hurdamert must supply access to the approved VM and an isolated
PostgreSQL environment supporting dedicated owner/web/runner identities. Do not use
the existing owner-like runtime login as evidence of a restricted web identity.

Run and retain evidence for:

- Cold/warm monotonic timing from before launch through confirmed group-empty exit,
  including complete bounded output and hashes; success is accepted only within 5000 ms.
- Independent startup/runtime/stop watchdogs, native/WASM memory exhaustion, child
  descendants, supervisor failure, cancellation and buffered near-deadline output.
- Two actual live groups at most; fixed unit ownership; no surge; old host destruction
  before replacement; uncertain death quarantines a held reservation.
- V4's exact partial reservation index, concurrent claims, stale-fence denial, single
  release after confirmed exit, terminal jobs retaining uncertain reservations.
- Actual web-login denial of candidate/result/version writes and runner RPCs; runner
  limited to its claim/fence; generation/login rotation rejects old results.
- Immutable attempt journal prefixes, duplicate completion and accepted-version evidence
  retention; one original 120-second queue deadline for all five possible attempts.
- One/zero healthy-unit admission behavior, queue fairness, health heartbeat expiry,
  off-host monitoring and a delivered alert; no public jobs while unattended.

Use independent database connections and selected-host process/cgroup traces. Keep
credentials, proofs and raw inputs out of operational evidence. Windows unit tests,
mocked role tests and merely checking this unit text cannot satisfy these gates.

The full-cap benchmark calls the unchanged engine for 7200 steps. The engine freezes
after out-of-bounds failure; such remaining steps cannot represent worst-case live
physics work. Dense/adversarial continuously active benchmark fixtures and measured
target-host limits remain mandatory, alongside the author's successful proof.
