export function renderErrorPage(diagnostic?: string): string {
  const isConfigError = diagnostic?.includes('VITE_SUPABASE_URL') || diagnostic?.includes('VITE_SUPABASE_ANON_KEY');
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${isConfigError ? 'Configuration Fault' : "This page didn't load"}</h1>
      <p>${isConfigError ? 'Critical environment variables are missing.' : 'Something went wrong on our end. You can try refreshing or head back home.'}</p>
      ${diagnostic ? `
      <div style="text-align: left; background: #fee2e2; border: 1px solid #fca5a5; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; overflow-x: auto;">
        <div style="font-size: 10px; font-weight: bold; color: #991b1b; text-transform: uppercase; margin-bottom: 0.5rem;">Diagnostic Data</div>
        <pre style="margin: 0; font-family: monospace; font-size: 11px; color: #b91c1c;">${diagnostic}</pre>
      </div>
      ` : ''}
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
