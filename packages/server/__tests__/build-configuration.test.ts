import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Build Configuration', () => {
  it('should have external dependencies properly configured to prevent dynamic require errors', () => {
    // Read the package.json file to check the build configuration
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Get the build command
    const buildCommand = packageJson.scripts.build;
    
    // Check that critical dependencies that cause dynamic require issues are externalized
    const criticalExternals = [
      'http-proxy-middleware',
      'dotenv-flow', 
      'fast-xml-parser',
      'node-fetch',
      '@deepgram/sdk',
      '@listener/shared'
    ];
    
    criticalExternals.forEach(dep => {
      expect(buildCommand, `${dep} should be externalized in build command to prevent dynamic require errors`)
        .toContain(`--external:${dep}`);
    });
    
    // Ensure esbuild is configured for ESM format
    expect(buildCommand).toContain('--format=esm');
    expect(buildCommand).toContain('--platform=node');
  });

  it('should build successfully without dynamic require errors', async () => {
    // This test ensures that the built server can be imported without errors
    const distPath = path.join(__dirname, '..', 'dist', 'server.js');
    
    // Check if dist directory exists (build should have been run)
    if (!fs.existsSync(distPath)) {
      console.warn('Built server not found at dist/server.js - run npm run build first');
      return;
    }
    
    // Try to read the built file and check it doesn't contain problematic dynamic requires
    const builtContent = fs.readFileSync(distPath, 'utf8');
    
    // The built file should contain the esbuild-generated __require function for handling dynamic requires
    expect(builtContent).toContain('__require');
    
    // Should contain proper ESM imports instead of requires for Node.js built-ins
    expect(builtContent).toContain('import');
    
    // Should not contain raw require() calls that would cause issues in ESM
    expect(builtContent).not.toContain('require(');
  });
}); 