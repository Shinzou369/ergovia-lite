'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');

function createPageRoutes() {
  const router = Router();
  const publicDir = path.resolve(__dirname, '../../public');

  // Control Panel routes
  const panelPages = ['login', 'register', 'onboarding', 'dashboard', 'settings', 'properties'];
  router.get('/control-panel', (req, res) => res.redirect('/control-panel/login'));
  for (const page of panelPages) {
    router.get(`/control-panel/${page}`, (req, res) => {
      res.sendFile(path.join(publicDir, `control-panel/${page}.html`));
    });
  }

  // Named page routes
  const namedPages = {
    '/taskforce': 'taskforce.html',
    '/etf-onboard': 'etf-onboard.html',
    '/etf-admin': 'etf-admin.html',
    '/pet-onboard': 'pet-onboard.html',
    '/login': 'login.html',
    '/signup': 'signup.html',
    '/chat': 'chat.html',
    '/token-dashboard': 'token-dashboard.html',
  };

  for (const [route, file] of Object.entries(namedPages)) {
    router.get(route, (req, res) => res.sendFile(path.join(publicDir, file)));
  }

  // Taskforce type redirects
  const taskforceTypes = ['pet-clinic', 'gym', 'contractors', 'tutoring', 'massage'];
  for (const type of taskforceTypes) {
    router.get(`/taskforce/${type}/onboard`, (req, res) => res.redirect(`/etf-onboard?type=${type}`));
  }

  // Root
  router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Clean URL fallback: try serving /:page as /page.html
  router.get('/:page', (req, res, next) => {
    const page = req.params.page;
    if (!/^[a-zA-Z0-9_-]+$/.test(page)) return next();

    const filePath = path.join(publicDir, `${page}.html`);
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) return next();
      res.sendFile(filePath);
    });
  });

  return router;
}

module.exports = { createPageRoutes };
