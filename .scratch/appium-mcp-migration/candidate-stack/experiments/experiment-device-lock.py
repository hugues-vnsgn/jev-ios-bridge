"""Hold one OS-account-owned experimental device lock across exec."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys

os.umask(0o077)
path = Path(sys.argv[1]).resolve()
fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
info = os.fstat(fd)
assert info.st_uid == os.getuid() and info.st_mode & 0o077 == 0
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print('EXPERIMENT_DEVICE_BUSY', file=sys.stderr)
    sys.exit(11)
record = {'version': 1, 'pid': os.getpid(), 'resource': str(path)}
os.ftruncate(fd, 0)
os.write(fd, json.dumps(record).encode())
os.fsync(fd)
held = fcntl.fcntl(fd, fcntl.F_DUPFD, 200)
os.close(fd)
os.set_inheritable(held, True)
os.environ['JEV_EXPERIMENT_LOCK_FD'] = str(held)
os.execv(sys.argv[2], sys.argv[2:])
