"""Replay the captured absence/next-boot contradiction; never issue device work."""
import json
from pathlib import Path
import sys

apply = json.loads((Path(sys.argv[1]) / 'command-014.json').read_bytes())
startup = json.loads((Path(sys.argv[2]) / 'command-005.json').read_bytes())
absent = ('An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=2):\n'
          'The operation couldn’t be completed. No such file or directory\n'
          'No such file or directory\n')
assert (apply['returncode'], apply['stdout'], apply['stderr']) == (2, '', absent)
consistent = (startup['returncode'], startup['stdout'], startup['stderr']) == (2, '', absent)
print(json.dumps({'canonicalAbsenceAfterUninstall': True,
                  'nextBootLookupReturncode': startup['returncode'],
                  'nextBootLookupPath': startup['stdout'].strip(),
                  'absenceSurvivedNextBoot': consistent}, indent=2))
raise SystemExit(0 if consistent else 1)
