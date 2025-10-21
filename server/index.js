/* eslint-disable no-console */
const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve static client
const staticDir = path.join(__dirname, '..', 'public');
app.use(express.static(staticDir));

// Google Earth Engine setup using gcloud Application Default Credentials (ADC)
// We will lazily initialize EE to avoid blocking startup.
const { GoogleAuth } = require('google-auth-library');
const { JSDOM } = require('jsdom');

// Set up a minimal DOM so the EE JS client can run in Node
const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.atob = dom.window.atob;
global.btoa = dom.window.btoa;

const tileSessions = new Map(); // sessionId -> { name, createdAt }
function makeSessionId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function computeTemperatureTileTemplate() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/earthengine.readonly'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to obtain ADC access token. Run `gcloud auth application-default login`.');

  const projectId = process.env.GCP_PROJECT_ID || 'california-weather-maps';
  const url = `https://earthengine.googleapis.com/v1beta/projects/${projectId}/maps:compute`;
  const palette = [
    '#081d58', '#225ea8', '#41b6c4', '#a1dab4', '#ffffcc',
    '#fed976', '#fd8d3c', '#f03b20', '#bd0026'
  ];

  const body = {
    expression: { // Compute the most recent GFS 2m temp in Celsius
      expression: "ImageCollection('NOAA/GFS0P25').select('temperature_2m_above_ground').sort('system:time_start', false).first().subtract(273.15)"
    },
    visualization: {
      range: { min: -30, max: 45 },
      palette
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': projectId
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`maps:compute failed: ${resp.status} ${txt}`);
  }
  const data = await resp.json();
  // Prefer public templates when available
  if (data.tileUrlTemplate) {
    return { urlTemplate: data.tileUrlTemplate };
  }
  if (data.mapid && data.token) {
    return { urlTemplate: `https://earthengine.googleapis.com/map/${data.mapid}/{z}/{x}/{y}?token=${data.token}` };
  }
  // Otherwise set up a proxy session using the v1 name requiring Authorization
  if (data.name) {
    const sessionId = makeSessionId();
    tileSessions.set(sessionId, { name: data.name, createdAt: Date.now() });
    return { urlTemplate: `/api/ee-tiles/${sessionId}/{z}/{x}/{y}` };
  }
  throw new Error('Unexpected response from maps:compute');
}

// Returns a map tile URL for global temperature visualization
app.get('/api/daymet-tiles', async (req, res) => {
  try {
    const date = req.query.date || '2020-07-15';
    const band = (req.query.band || 'tavg').toLowerCase(); // tavg | tmin | tmax
    const projectId = process.env.GCP_PROJECT_ID || 'california-weather-maps';

    const ee = require('@google/earthengine');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/earthengine.readonly'] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('ADC token not available');

    ee.data.setAuthToken('oauth2', 'Bearer', token, null, null, null, true, null, null);
    if (typeof ee.data.setCloudApiEnabled === 'function') {
      ee.data.setCloudApiEnabled(true);
    }
    if (typeof ee.data.setCloudApiUserProject === 'function') {
      ee.data.setCloudApiUserProject(projectId);
    }
    await new Promise((resolve, reject) => {
      ee.initialize(null, null, () => resolve(), (e) => reject(e), projectId);
    });

    const day = ee.Date(date);
    let img = ee.ImageCollection('NASA/ORNL/DAYMET_V4')
      .filterDate(day, day.advance(1, 'day'))
      .first();

    if (band === 'tmin') {
      img = img.select('tmin');
    } else if (band === 'tmax') {
      img = img.select('tmax');
    } else {
      img = img.expression('(tmin + tmax) / 2', { tmin: img.select('tmin'), tmax: img.select('tmax') }).rename('tavg');
    }

    const visParams = { min: -30, max: 45, palette: ['#081d58','#225ea8','#41b6c4','#a1dab4','#ffffcc','#fed976','#fd8d3c','#f03b20','#bd0026'] };
    const mapId = await new Promise((resolve, reject) => img.getMap(visParams, (r) => resolve(r), (e) => reject(e)));
    const urlTemplate = `https://earthengine.googleapis.com/map/${mapId.mapid}/{z}/{x}/{y}?token=${mapId.token}`;
    return res.json({ urlTemplate });
  } catch (err) {
    console.error('Failed to create Daymet tiles:', err);
    return res.status(500).json({ error: 'Failed to create tiles', details: String(err) });
  }
});

// Proxy tile route for templates that require Authorization header
app.get('/api/ee-tiles/:session/:z/:x/:y', async (req, res) => {
  try {
    const { session, z, x, y } = req.params;
    const sessionInfo = tileSessions.get(session);
    if (!sessionInfo) return res.status(404).send('Tile session not found');

    // Simple TTL cleanup: expire sessions older than 15 minutes
    if (Date.now() - sessionInfo.createdAt > 15 * 60 * 1000) {
      tileSessions.delete(session);
      return res.status(410).send('Tile session expired');
    }

    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/earthengine.readonly'] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    if (!token) return res.status(500).send('Auth token unavailable');

    const tileUrl = `https://earthengine.googleapis.com/v1/${sessionInfo.name}/tiles/${z}/${x}/${y}`;
    const tileResp = await fetch(tileUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!tileResp.ok) {
      const txt = await tileResp.text();
      return res.status(502).send(`Upstream tile error: ${tileResp.status} ${txt}`);
    }

    // Forward content-type and body
    const ct = tileResp.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', ct);
    const buf = Buffer.from(await tileResp.arrayBuffer());
    res.end(buf);
  } catch (e) {
    console.error('Tile proxy error:', e);
    res.status(500).send('Tile proxy error');
  }
});

// Fallback to index.html for root
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


