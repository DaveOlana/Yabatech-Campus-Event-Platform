import { describe, it, expect } from 'vitest';
import request from 'supertest';
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

  it('renders minimal YCEP landing page on GET /', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/html/);
    expect(response.text).toContain('YABATECH Campus Events Platform');
    expect(response.text).toContain('Running');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await request(app).get('/non-existent-route');

    expect(response.status).toBe(404);
  });
});
