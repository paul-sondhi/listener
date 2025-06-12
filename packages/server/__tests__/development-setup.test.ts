import { describe, it, expect } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

/**
 * Development Setup Tests
 * 
 * These tests validate that the development environment is properly configured
 * and all necessary dependencies are available for running the server locally.
 * This helps catch configuration issues that would prevent developers from
 * starting the server during local development.
 */
describe('Development Setup', () => {
  
  /**
   * Test that tsx (TypeScript runner) is available and functional
   * This is critical because the dev script uses tsx to run TypeScript directly
   */
  it('should have tsx available for running TypeScript', async () => {
    try {
      // Check if tsx is available in node_modules
      const { stdout } = await execAsync('npx tsx --version', { 
        cwd: path.join(__dirname, '..') 
      })
      
      expect(stdout).toMatch(/\d+\.\d+\.\d+/) // Should return a version number
    } catch (error) {
      throw new Error(`tsx is not available or not working: ${error}`)
    }
  })

  /**
   * Test that the package.json dev script is properly configured
   * This ensures the dev script uses a valid TypeScript runner
   */
  it('should have a valid dev script configuration', async () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // Check that dev script exists
    expect(packageJson.scripts.dev).toBeDefined()
    
    // Check that it uses tsx (not ts-node which isn't installed)
    expect(packageJson.scripts.dev).toContain('tsx')
    expect(packageJson.scripts.dev).not.toContain('ts-node')
  })

  /**
   * Test that tsx dependency is properly listed in package.json
   * This ensures tsx is available as a dependency
   */
  it('should have tsx as a dependency', async () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // tsx should be in devDependencies
    expect(packageJson.devDependencies?.tsx).toBeDefined()
    expect(packageJson.devDependencies.tsx).toMatch(/^\d+\.\d+\.\d+$|^\^\d+\.\d+\.\d+$/) // Valid version format
  })

  /**
   * Test that the server file exists and is accessible
   * This validates the main server entry point exists
   */
  it('should have server.ts file in the correct location', async () => {
    const serverPath = path.join(__dirname, '..', 'server.ts')
    
    try {
      await fs.access(serverPath)
      const serverContent = await fs.readFile(serverPath, 'utf-8')
      
      // Basic validation that it's a proper server file
      expect(serverContent).toContain('express')
      expect(serverContent).toContain('app.listen') // or similar server startup logic
    } catch (error) {
      throw new Error(`Server file is not accessible: ${error}`)
    }
  })

  /**
   * Test that essential dependencies are available for development
   * This checks that critical packages needed for development are installed
   */
  it('should have essential development dependencies available', async () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // Check for nodemon (for development server auto-restart)
    expect(packageJson.devDependencies?.nodemon).toBeDefined()
    
    // Check for TypeScript
    expect(packageJson.devDependencies?.typescript).toBeDefined()
  })

}) 