export function renderErrorPage(message = "An unexpected server-side error occurred."): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Application Error</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0F17; color: #F8FAFC; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #111827; border: 1px solid #1F2937; border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { color: #EF4444; font-size: 20px; margin-bottom: 12px; }
    p { color: #9CA3AF; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    a { background: #3B82F6; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Application Error</h1>
    <p>${message}</p>
    <a href="/">Return to Dashboard</a>
  </div>
</body>
</html>`;
}