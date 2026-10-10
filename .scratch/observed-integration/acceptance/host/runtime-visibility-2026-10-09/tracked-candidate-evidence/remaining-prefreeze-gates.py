import subprocess, sys
for mode, node, label in [
    ('owned', '24', 'final-green-node24'),
    ('focused', '26', 'focused-node26'), ('focused', '24', 'focused-node24'),
    ('coverage', '26', 'coverage-node26'), ('coverage', '24', 'coverage-node24'),
    ('typecheck', '26', 'typecheck-node26'), ('typecheck', '24', 'typecheck-node24'),
    ('build', '26', 'build-node26'), ('build', '24', 'build-node24')]:
    result = subprocess.run([sys.executable, '.scratch/installed-tracked-runtime/gate-recorder.py', mode, node, label])
    if result.returncode: raise SystemExit(result.returncode)
