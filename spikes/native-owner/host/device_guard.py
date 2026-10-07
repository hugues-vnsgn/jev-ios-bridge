"""Private research exclusion using the Bridge's existing device-lease files.

Callers persist ``provenance`` before take and examine ``created`` on failure.
Only settled, restored work may call release; this Module cannot establish native
settlement. Before removal, write/inspection uncertainty forbids later release.
Claims intentionally survive frontend exit, with an unknown ``pid`` and a truthful
``hostPID``. Noncooperating tools and different lease roots are outside this guard.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import re
import stat
import uuid


def default_lease_root():
    """Match Node os.tmpdir() on the native study's Unix host, without caching."""
    return Path(os.environ.get("TMPDIR") or os.environ.get("TMP") or
                os.environ.get("TEMP") or "/tmp") / "jev-ios-bridge-device-locks"


class DeviceGuardError(Exception):
    """``reason`` is stable; callers must preserve created claims on uncertainty."""
    def __init__(self, reason, detail):
        self.reason = reason
        super().__init__(reason + ": " + detail)


@contextmanager
def _directory(path, create=False):
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        opened = os.fstat(descriptor)
        named = path.lstat()
        if (not stat.S_ISDIR(named.st_mode) or _identity(opened) != _identity(named)
                or opened.st_uid != os.getuid()):
            raise OSError("directory identity or ownership is uncertain")
        yield descriptor
    finally:
        os.close(descriptor)


def _identity(info):
    return info.st_dev, info.st_ino


def _write_all(descriptor, content):
    offset = 0
    while offset < len(content):
        count = os.write(descriptor, content[offset:])
        if count <= 0:
            raise OSError("claim write made no progress")
        offset += count
    os.fsync(descriptor)


class DeviceGuard:
    """One-use take/check/release; ``root=None`` selects the Bridge namespace.

    ``created`` means O_EXCL created a claim, even if its write later failed.
    ``released`` means successful matching-claim unlink, without deletion durability.
    ``provenance`` is a defensive copy, also written as an immutable intent before
    acquisition. The intent alone does not prove that acquisition succeeded.
    """
    def __init__(self, root, device_id, request_id, evidence_directory):
        if (not isinstance(device_id, str) or not re.fullmatch(
                r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", device_id)
                or not isinstance(request_id, str) or not request_id
                or len(request_id.encode("utf-8")) > 1024):
            raise DeviceGuardError("DEVICE_GUARD_CONFIGURATION", "invalid device or run identity")
        self._root = Path(root if root is not None else default_lease_root()).absolute()
        self._evidence = Path(evidence_directory).absolute()
        self._name = device_id.upper() + ".lock"
        self._record = {"schema": "jev.native-owner.device-guard/1", "pid": None,
                        "hostPID": os.getpid(), "token": str(uuid.uuid4()),
                        "deviceId": device_id.upper(), "runId": request_id,
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                        "evidenceDirectory": str(self._evidence),
                        "kind": "native-owner-research"}
        self._bytes = json.dumps(self._record, separators=(",", ":")).encode("utf-8")
        self._created = self._released = self._complete = self._attempted = False
        self._uncertain = False
        self._root_identity = self._file_identity = None

    @property
    def created(self):
        return self._created

    @property
    def released(self):
        return self._released

    @property
    def provenance(self):
        return {"path": str(self._root / self._name), "record": dict(self._record)}

    def _intent(self):
        content = json.dumps({"state": "pending", **self.provenance},
                             separators=(",", ":")).encode("utf-8")
        with _directory(self._evidence, create=True) as directory:
            descriptor = os.open("device-guard-intent.json", os.O_WRONLY | os.O_CREAT |
                                 os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            try:
                os.fchmod(descriptor, 0o600)
                _write_all(descriptor, content)
            finally:
                os.close(descriptor)
            os.fsync(directory)

    def take(self):
        if self._attempted:
            raise DeviceGuardError("DEVICE_GUARD_ALREADY_ATTEMPTED", "take is one-use")
        self._attempted = True
        try:
            self._intent()
            with _directory(self._root, create=True) as directory:
                self._root_identity = _identity(os.fstat(directory))
                try:
                    descriptor = os.open(self._name, os.O_WRONLY | os.O_CREAT |
                                         os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
                except FileExistsError as error:
                    raise DeviceGuardError("DEVICE_GUARD_BUSY", "existing device lease") from error
                self._created = True
                try:
                    self._file_identity = _identity(os.fstat(descriptor))
                    os.fchmod(descriptor, 0o600)
                    _write_all(descriptor, self._bytes)
                finally:
                    os.close(descriptor)
                os.fsync(directory)
            self._complete = True
            return self.check()
        except OSError as error:
            self._refuse_uncertain(error)

    def _refuse_uncertain(self, error):
        self._uncertain = True
        raise DeviceGuardError("DEVICE_GUARD_UNCERTAIN", str(error)) from error

    def _require_owned(self):
        if self._uncertain or (self.created and not self._complete):
            raise DeviceGuardError("DEVICE_GUARD_UNCERTAIN", "claim certainty was lost")
        if not self.created or self.released:
            raise DeviceGuardError("DEVICE_GUARD_NOT_HELD", "no owned claim")

    def _verify(self, directory):
        if _identity(os.fstat(directory)) != self._root_identity:
            raise OSError("lease directory was replaced")
        descriptor = os.open(self._name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=directory)
        try:
            info = os.fstat(descriptor)
            if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or
                    stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid() or
                    _identity(info) != self._file_identity):
                raise OSError("claim file identity, mode or ownership changed")
            content = b""
            while len(content) <= len(self._bytes):
                chunk = os.read(descriptor, len(self._bytes) + 1 - len(content))
                if not chunk:
                    break
                content += chunk
            if content != self._bytes:
                raise OSError("claim record changed")
            named = os.stat(self._name, dir_fd=directory, follow_symlinks=False)
            if _identity(named) != self._file_identity or named.st_nlink != 1:
                raise OSError("claim changed during inspection")
            if _identity(self._root.lstat()) != self._root_identity:
                raise OSError("lease directory changed during inspection")
        finally:
            os.close(descriptor)

    def check(self):
        self._require_owned()
        try:
            with _directory(self._root) as directory:
                self._verify(directory)
            return self.provenance
        except OSError as error:
            self._refuse_uncertain(error)

    def release(self):
        """Caller attests its work/restoration settled; never a native fence."""
        self._require_owned()
        try:
            with _directory(self._root) as directory:
                os.fsync(directory)
                self._verify(directory)
                os.unlink(self._name, dir_fd=directory)
                self._released = True
        except OSError as error:
            if not self.released:
                self._refuse_uncertain(error)
            # A later descriptor-close error cannot undo observed claim removal.
        return self.provenance
