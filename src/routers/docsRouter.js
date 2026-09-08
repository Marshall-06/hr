const express = require('express');
const path = require('path');
const openapi = require('../docs/openapi');

const router = express.Router();

let swaggerDist;
try {
  swaggerDist = path.dirname(require.resolve('swagger-ui-dist/package.json'));
} catch {
  swaggerDist = null;
}

router.get('/openapi.json', (req, res) => {
  res.json(openapi);
});

if (swaggerDist) {
  router.use('/static', express.static(swaggerDist, { maxAge: '1d' }));
}

router.get(['/', ''], (req, res) => {
  const title = `${openapi.info?.title || 'API'} — Swagger`;
  if (!swaggerDist) {
    return res.status(500).type('html').send(
      '<h1>Swagger UI paket ýok</h1><p><code>npm install swagger-ui-dist</code></p>',
    );
  }

  res.type('html').send(`<!DOCTYPE html>
<html lang="tk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="/api/docs/static/swagger-ui.css">
  <link rel="icon" type="image/png" href="/api/docs/static/favicon-32x32.png">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar { display: none !important; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/static/swagger-ui-bundle.js"></script>
  <script src="/api/docs/static/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        persistAuthorization: true,
        tryItOutEnabled: true,
        displayRequestDuration: true,
      });
    };
  </script>
</body>
</html>`);
});

module.exports = router;
