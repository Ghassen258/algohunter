"""Assemble a publishable static site using only the Python standard library."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
if dist.exists():
    shutil.rmtree(dist)
shutil.copytree(root / 'web', dist)
engine = dist / 'engine'
engine.mkdir()
shutil.copy2(root / 'algohunter' / 'core.py', engine / 'core.py')
(dist / '.nojekyll').touch()
for path in ['index.html','app.js','worker.js','styles.css','sample.json','engine/core.py']:
    if not (dist / path).is_file():
        raise SystemExit(f'missing site asset: {path}')
print('Created dist/ with browser interface and live Python source')
