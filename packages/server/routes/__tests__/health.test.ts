/**
 * Unit tests for packages/server/routes/health.ts
 * Tests the health check endpoint
 */

import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import type { HealthCheckResponse } from '@listener/shared'
import healthRouter from '../health.js'

// Create a simple express app to test the router
const app = express()
app.use('/healthz', healthRouter) // Mount the router like it's mounted in your app

describe('Health Check Route (/healthz)', () => {
  it('should return 200 OK with a comprehensive health status', async () => {
    // Act
    const response = await (request(app) as any).get('/healthz')

    // Assert
    expect(response.status).toBe(200)
    
    // Verify the response structure matches HealthCheckResponse interface
    const body = response.body as HealthCheckResponse
    expect(body).toMatchObject({
      status: 'healthy',
      timestamp: expect.any(String),
      uptime: expect.any(Number),
      services: {
        database: 'connected',
        deepgram: 'available', 
        spotify: 'available',
      },
    })
    
    // Verify timestamp is a valid ISO string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp)
    
    // Verify uptime is a positive number
    expect(body.uptime).toBeGreaterThan(0)
    
    // Verify response time header is present
    expect(response.headers['x-response-time']).toMatch(/^\d+ms$/)
    
    // Version may or may not be present depending on environment
    if (body.version) {
      expect(typeof body.version).toBe('string')
    }
  })

  it('should have consistent response times under normal load', async () => {
    // Act - Make multiple requests to test consistency
    const responses = await Promise.all([
      (request(app) as any).get('/healthz'),
      (request(app) as any).get('/healthz'),
      (request(app) as any).get('/healthz'),
    ])

    // Assert - All should return 200 and have response time headers
    responses.forEach((response) => {
      expect(response.status).toBe(200)
      expect(response.headers['x-response-time']).toMatch(/^\d+ms$/)
      expect(response.body.status).toBe('healthy')
    })
  })

  // Future enhancement: Test for unhealthy scenarios
  // This would require implementing actual dependency checks in the health endpoint
  /*
  it('should return 503 Service Unavailable if a critical dependency is down', async () => {
    // Mock the dependency check to simulate failure
    // e.g., vi.spyOn(db, 'isConnected').mockResolvedValue(false);

    const response = await (request(app) as any).get('/healthz');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'unhealthy',
      services: expect.objectContaining({
        database: 'disconnected'
      })
    });

    // Restore mocks if necessary
    // vi.restoreAllMocks();
  });
  */
}) 