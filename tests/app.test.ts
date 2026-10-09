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

  it('renders the public About page and creator credit', async () => {
    const response = await request(app).get('/about');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('A clearer way to find what is happening on campus.');
    expect(response.text).toContain('cc daveolana');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await request(app).get('/non-existent-route');

    expect(response.status).toBe(404);
  });
});
