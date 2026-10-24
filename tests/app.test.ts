import { describe, it, expect } from 'vitest';
import request from './helpers/http.js';
import { app } from '../src/app.js';

describe('YCEP Application Foundation', () => {
  it('starts correctly and responds to GET /health with ok status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(typeof response.body.uptime).toBe('number');
  });

  it('renders the public event discovery page on GET /', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('Campus life');
    expect(response.text).toContain('Upcoming events');
    expect(response.text).not.toContain('href="/admin/login">Management</a>');
    expect(response.text).not.toContain('Running');
  });

  it('renders the public About page and discreet portfolio signature', async () => {
    const response = await request(app).get('/about');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('A clearer way to find what is happening on campus.');
    expect(response.text).toContain('/assets/brand/developer-logo.png');
    expect(response.text).toContain('href="http://daveolana.tech/"');
    expect(response.text).not.toContain('cc daveolana');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await request(app).get('/non-existent-route');

    expect(response.status).toBe(404);
  });

  it('serves non-cropping poster and event-form recovery assets', async () => {
    const css = await request(app).get('/css/style.css').expect(200);
    expect(css.text).toContain('.poster-upload-preview img');
    expect(css.text).toContain('object-fit: contain');
    expect(css.text).not.toContain('.poster-upload-preview img { width: 100%; height: 100%; object-fit: cover; }');

    const recovery = await request(app).get('/js/event-form-recovery.js').expect(200);
    expect(recovery.text).toContain("sessionStorage");
    expect(recovery.text).toContain("name === '_csrf'");
    expect(recovery.text).toContain("posterWasSelected");
    expect(recovery.text).toContain("restoreValues(form, saved.values)");

    const picker = await request(app).get('/js/department-picker.js').expect(200);
    expect(picker.text).toContain('selectAll.textContent = "Select all"');
    expect(picker.text).toContain('[data-checklist-actions]');
  });
});
