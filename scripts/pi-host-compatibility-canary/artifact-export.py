"""Post-reap allowlist FD exporter; no cleanup, rename, archive interpretation or execution."""
import hashlib
import os
from pathlib import Path
import runpy
from types import SimpleNamespace

if 'C' not in globals():
    C = SimpleNamespace(**runpy.run_path(str(Path(__file__).with_name('artifact-contract.py'))))


def open_source(d, name, maximum):
    fd = os.open(C.leaf(name), os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=d)
    try:
        C.regular(fd, maximum, owned=True)
        return fd
    except BaseException:
        os.close(fd)
        raise


def hash_source(d, row, maximum=C.ARCHIVE_MAX):
    fd = open_source(d, row['file'], maximum)
    try:
        before = C.regular(fd, maximum, owned=True)
        C.require(before.st_size == row['bytes'], 'export size')
        hashes = [hashlib.sha256(), hashlib.sha512()]
        used = 0
        while block := os.read(fd, C.CHUNK):
            used += len(block)
            C.require(used <= row['bytes'], 'export read bound')
            for h in hashes:
                h.update(block)
        C.require(used == row['bytes'] and C.identity(before) == C.identity(os.fstat(fd)), 'source changed')
        C.require([h.hexdigest() for h in hashes] == [row['sha256'], row['sha512']], 'export hash')
        return before
    finally:
        os.close(fd)


def copy_file(source, destination, row, maximum=C.ARCHIVE_MAX):
    """Rehash during exclusive copy; failed partial remains, never becomes a success receipt."""
    C.require((os.fstat(source).st_dev, os.fstat(source).st_ino) !=
              (os.fstat(destination).st_dev, os.fstat(destination).st_ino), 'directory alias')
    C.leaf(row['file']); C.digest(row['sha256']); C.digest(row['sha512'], 128)
    C.integer(row['bytes'], 1, maximum)
    src = open_source(source, row['file'], maximum)
    dst = None
    try:
        before = C.regular(src, maximum, owned=True)
        C.require(before.st_size == row['bytes'], 'source size')
        dst = C.create(destination, row['file'])
        out = C.regular(dst, maximum, owned=True)
        C.require((before.st_dev, before.st_ino) != (out.st_dev, out.st_ino), 'file alias')
        h256, h512, used = hashlib.sha256(), hashlib.sha512(), 0
        while used < row['bytes']:
            block = os.read(src, min(C.CHUNK, row['bytes'] - used))
            C.require(bool(block), 'source truncated')
            used += len(block)
            h256.update(block); h512.update(block)
            C.write_all(dst, block)
        C.require(not os.read(src, 1), 'source oversized')
        C.require(C.identity(before) == C.identity(os.fstat(src)), 'source changed')
        C.require(h256.hexdigest() == row['sha256'] and h512.hexdigest() == row['sha512'], 'copied hash')
        os.fsync(dst)
        after = C.regular(dst, maximum, owned=True)
        linked = os.stat(row['file'], dir_fd=destination, follow_symlinks=False)
        C.require(after.st_size == used and C.identity(after) == C.identity(linked), 'destination changed')
    finally:
        os.close(src)
        if dst is not None:
            os.close(dst)


def inventory(source, manifest):
    fd = open_source(source, 'worker-receipt.json', C.RECEIPT_MAX)
    try:
        raw = C.read_fd(fd, C.RECEIPT_MAX)
    finally:
        os.close(fd)
    receipt = C.decode(raw)
    C.keys(receipt, 'schema status inputSha256 bodyBytes archives qualification')
    C.require(receipt['schema'] == 'ak5597-artifact-worker.v1' and receipt['status'] == 'complete'
              and receipt['inputSha256'] == C.INPUT_SHA256 and receipt['qualification'] is False,
              'worker receipt')
    seed = manifest['seededTooling'][0]
    expected = {a['filename']: a['sha512Hex'] for a in manifest['networkArchives']}
    expected[seed['file']] = C.sri(seed['integrity'])
    C.require(type(receipt['archives']) is list and len(receipt['archives']) == 166, 'export count')
    seen, total = set(), 0
    for row in receipt['archives']:
        C.keys(row, 'file bytes sha256 sha512')
        C.leaf(row['file']); C.digest(row['sha256']); C.digest(row['sha512'], 128)
        total += C.integer(row['bytes'], 1, C.ARCHIVE_MAX)
        C.require(row['file'] in expected and row['file'] not in seen
                  and row['sha512'] == expected[row['file']], 'export allowlist')
        seen.add(row['file'])
        C.require(total <= C.TOTAL_MAX, 'export cumulative bound')
        if row['file'] == seed['file']:
            C.require(row['bytes'] == seed['bytes'] and row['sha256'] == seed['sha256'], 'export seed')
        hash_source(source, row)
    C.integer(receipt['bodyBytes'], 1, C.TOTAL_MAX)
    C.require(total <= C.TOTAL_MAX and receipt['bodyBytes'] == total and seen == set(expected), 'export total')
    C.require(set(C.directory_names(source)) == seen | {'worker-receipt.json'}, 'unexpected output entry')
    receipt_row = dict(file='worker-receipt.json', bytes=len(raw),
                       sha256=hashlib.sha256(raw).hexdigest(), sha512=hashlib.sha512(raw).hexdigest())
    return receipt['archives'], receipt_row


def export(source, parent, name, manifest, supervision, cancel=None):
    """Caller must have reaped its own sandbox child before calling, including on failure."""
    C.require(supervision['childReaped'] is True or
              (supervision.get('childCreated') is False and supervision['reason'] == 'launch-failed'),
              'child not reaped')
    C.owned_dir(source); C.owned_dir(parent)
    good = (supervision['returncode'] == 0 and supervision['reason'] == 'exited'
            and supervision.get('cancelled', False) is False and not (cancel and cancel.pending))
    rows, worker = [], None
    if good:
        try:
            rows, worker = inventory(source, manifest)
        except (OSError, ValueError, TypeError, KeyError):
            good = False
            supervision = dict(supervision, reason='output-validation-failed')
    destination = C.new_dir(parent, name)
    try:
        raw = C.encode(supervision)
        C.put(destination, 'supervisor-receipt.json', raw)
        copy_failed = False
        if good:
            try:
                for row in rows:
                    if cancel:
                        cancel.check()
                    copy_file(source, destination, row)
                if cancel:
                    cancel.check()
                copy_file(source, destination, worker, C.RECEIPT_MAX)
            except (OSError, ValueError):
                good, copy_failed = False, True
        good = good and not (cancel and cancel.pending)
        # Copy-stage marker only: it precedes final directory fsyncs and both exits.
        # Even status=complete cannot certify durability/acceptance by itself.
        marker = dict(schema='ak5597-artifact-export.v1', status='complete' if good else 'failed',
                      inputSha256=C.INPUT_SHA256, qualification=False, copyFailed=copy_failed,
                      durabilityCertified=False,
                      acceptanceRequires=['driver-exit-0', 'owner-wrapper-exit-0',
                                          'independent-export-verification'],
                      supervisorSha256=hashlib.sha256(raw).hexdigest(),
                      archives=rows if good else [], workerReceipt=worker if good else None)
        C.put(destination, 'export-receipt.json', C.encode(marker))
        # Intentionally propagate even post-marker fsync errors: driver must fail.
        os.fsync(destination); os.fsync(parent)
        return bool(good) and not (cancel and cancel.pending)
    finally:
        os.close(destination)


def export_probe(source, parent, name, supervision, row, cancel=None):
    """Only bounded probe/supervisor receipts; write specimen stays in the retained new run.
    Caller verifies before passing row. Return pinned destination FD, close it on error.
    No acquisition marker, archive count, or qualification/durability certification.
    """
    C.require(supervision['childReaped'] is True or
              (supervision.get('childCreated') is False and supervision['returncode'] is None
               and supervision['reason'] == 'launch-failed'), 'probe not reaped')
    C.owned_dir(source); C.owned_dir(parent)
    destination = C.new_dir(parent, name)
    try:
        cancelled = bool(supervision.get('cancelled', False) or (cancel and cancel.pending))
        if cancelled:
            row = None
        supervision = dict(supervision, cancelled=cancelled, probeVerified=row is not None,
                           probeReceiptSha256=row['sha256'] if row else None,
                           acquisition=False, qualification=False, durabilityCertified=False,
                           acceptanceRequires=['driver-exit-0', 'owner-wrapper-exit-0',
                                               'independent-export-verification'])
        C.put(destination, 'supervisor-receipt.json', C.encode(supervision))
        if row is not None:
            C.require(row['file'] == 'probe-receipt.json', 'probe receipt name')
            copy_file(source, destination, row, C.RECEIPT_MAX)
        else:
            C.put(destination, 'probe-receipt.json', C.encode(dict(schema='ak5597-artifact-probe-failure.v1',
                  status='failed', acquisition=False, qualification=False, verified=False)))
        os.fsync(destination); os.fsync(parent)
        return destination
    except BaseException:
        os.close(destination)
        raise


def begin_observation(parent, name):
    """NEW private sibling of other exports, outside owner /out. Never reuse a destination.
    trace.raw is streamed here directly, not copied through the two-entry probe output.
    """
    C.owned_dir(parent)
    C.require(C.leaf(name).startswith('ak5597-artifacts-observation-'), 'observation export name')
    destination = C.new_dir(parent, name)
    try:
        fd = C.create(destination, 'trace.raw')
        return destination, fd
    except BaseException:
        os.close(destination)  # Retain directory/partial file, never cleanup.
        raise


def observation_trace(destination):
    """Rehash only the bounded retained raw file, including an empty/failed capture."""
    fd = open_source(destination, 'trace.raw', 8 * 1024 * 1024)
    try:
        before = C.regular(fd, 8 * 1024 * 1024, owned=True)
        used, digest = 0, hashlib.sha256()
        while block := os.read(fd, min(4096, 8 * 1024 * 1024 + 1 - used)):
            used += len(block)
            C.require(used <= 8 * 1024 * 1024, 'trace read bound')
            digest.update(block)
        linked = os.stat('trace.raw', dir_fd=destination, follow_symlinks=False)
        C.require(used == before.st_size and C.identity(before) == C.identity(os.fstat(fd))
                  == C.identity(linked), 'trace custody changed')
        return dict(file='trace.raw', bytes=used, sha256=digest.hexdigest(),
                    metadata=dict(dev=before.st_dev, ino=before.st_ino, uid=before.st_uid,
                                  mode=before.st_mode, nlink=before.st_nlink, size=before.st_size,
                                  mtimeNs=before.st_mtime_ns, ctimeNs=before.st_ctime_ns))
    finally:
        os.close(fd)


def export_observation(source, destination, parent, supervision, candidate, cancel):
    """Nonraising best-effort custody, including unsettled tracer/failed capture.
    No ordinary export_probe guard is relaxed; no tracer->helper receipt adaptation.
    Exclusive files remain on failure. A missing/partial final receipt is failure, never a retry target.
    Caller owns destination FD. Cancellation is latched, not raised during settlement/export.
    """
    errors, trace, supervisor_row, probe_row = [], None, None, None
    def attempt(stage, action):
        try:
            return True, action()
        except BaseException:
            errors.append(stage)
            return False, None
    def put(name, value):
        raw = C.encode(value)
        C.put(destination, name, raw)
        return dict(file=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
    ok, _ = attempt('destination-guard', lambda: (
        C.owned_dir(parent), C.owned_dir(destination),
        C.require(set(C.directory_names(destination)) == {'trace.raw'}, 'observation exclusive entries'),
        C.require(supervision.get('schema') == 'ak5597-observation-supervisor.v1'
                  and supervision.get('childRole') == 'tracer', 'observation supervision type')))
    if not ok:
        return dict(exportComplete=False, errors=errors)  # No writes into unexpected/old evidence.
    ok, trace = attempt('trace-audit', lambda: observation_trace(destination))
    if ok:
        attempt('trace-binding', lambda: C.require(
            all(trace[k] == supervision['rawTrace'][k] for k in ('bytes', 'sha256', 'metadata')),
            'stream/custody mismatch'))
    snapshot = dict(supervision, cancelled=bool(cancel.pending or supervision.get('cancelled')),
                    probeVerified=False, acquisition=False, qualification=False, readiness=False)
    _, supervisor_row = attempt('supervisor-write', lambda: put('supervisor-receipt.json', snapshot))
    if candidate is not None and not cancel.pending and not errors:
        def copy_candidate():
            C.require(source is not None and candidate['file'] == 'probe-receipt.json', 'candidate source')
            copy_file(source, destination, candidate, C.RECEIPT_MAX)
            return candidate
        _, probe_row = attempt('probe-copy', copy_candidate)
    else:
        _, probe_row = attempt('probe-failure-write', lambda: put('probe-receipt.json', dict(
            schema='ak5597-artifact-observation-probe-unverified.v1', status='unavailable-or-incomplete',
            verified=False, acquisition=False, qualification=False)))
    attempt('pre-receipt-fsync', lambda: (os.fsync(destination), os.fsync(parent)))
    marker = dict(schema='ak5597-artifact-observation-receipt.v1',
        status='inconclusive', exportStageComplete=not errors and not cancel.pending,
        exportErrors=list(errors), cancelled=bool(cancel.pending), rawTrace=trace,
        streamedTrace=supervision['rawTrace'], supervisorReceipt=supervisor_row, probeReceipt=probe_row,
        reviewSha256=supervision.get('reviewSha256'), codeSha256=supervision.get('codeSha256'),
        observer=supervision.get('observer'), argvSha256=supervision.get('argvSha256'),
        captureComplete=bool(supervision.get('captureComplete')) and not errors and not cancel.pending,
        tracerReaped=supervision.get('tracerReaped'), settlementPending=supervision.get('settlementPending'),
        lineage=supervision.get('lineage'), calibrated=False, verifiedRuntimeLineage=False,
        probeVerified=False, topology='pending-independent-offline-analysis',
        helperReapedByDriver=False, descendantSettlementCertified=False,
        acquisition=False, qualification=False, readiness=False, durabilityCertified=False,
        acceptanceRequires=['independent-source-review', 'new-complete-freeze', 'fresh-separate-calibration-admission',
            'recognized-complete-actual-lineage', 'independent-112-object-topology-analysis',
            'strict-probe-verification', 'driver-and-canonical-owner-disposition', 'independent-export-verification'])
    attempt('observation-receipt-write', lambda: put('observation-receipt.json', marker))
    attempt('final-fsync', lambda: (os.fsync(destination), os.fsync(parent)))
    return dict(exportComplete=not errors and not cancel.pending, errors=errors)
