/* Worker isolates computationally intensive Python from the main UI thread. */
const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.8/full/';
let pyodide;
let readyPromise;

async function ensureReady() {
  if (!readyPromise) readyPromise = (async () => {
    self.postMessage({ type: 'status', message: 'Downloading Python / WebAssembly runtime…' });
    importScripts(CDN + 'pyodide.js');
    pyodide = await loadPyodide({ indexURL: CDN });
    self.postMessage({ type: 'status', message: 'Loading evolutionary Python source…' });
    const file = await fetch('./engine/core.py');
    if (!file.ok) throw new Error('Could not load Python source: HTTP ' + file.status);
    pyodide.FS.writeFile('/home/pyodide/algohunter_core.py', await file.text());
    pyodide.runPython("import sys; sys.path.insert(0, '/home/pyodide'); import algohunter_core");
    self.postMessage({ type: 'ready' });
  })();
  return readyPromise;
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try { await ensureReady(); } catch(error) {
      self.postMessage({ type: 'error', message: String(error.message || error) });
    }
    return;
  }
  if (data.type !== 'run') return;
  try {
    await ensureReady();
    pyodide.globals.set('job_config', JSON.stringify(data.config));
    pyodide.globals.set('emit_progress', payload => {
      self.postMessage({ type: 'progress', value: JSON.parse(payload) });
    });
    const output = pyodide.runPython('algohunter_core.run_experiment_json(job_config, emit_progress)');
    self.postMessage({ type: 'result', value: JSON.parse(output) });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error.message || error) });
  } finally {
    if (pyodide) {
      pyodide.globals.delete('job_config');
      pyodide.globals.delete('emit_progress');
    }
  }
};
