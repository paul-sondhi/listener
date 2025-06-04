/**
 * Unit tests for backup-restore migration functionality
 * Step 8.1: Test backup-restore scripts for reliability
 */

const { BackupRestoreTest } = require('../backup-restore-test');
const { MigrationValidator } = require('../validate-migration');

// Mock Supabase client
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
  rpc: jest.fn(),
};

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    NODE_ENV: 'test',
    TEST_SECRET_COUNT: '2'
  };
  
  jest.clearAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

// Mock fs operations
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
}));

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe('MigrationValidator', () => {
  describe('constructor', () => {
    it('should initialize with valid environment variables', () => {
      const validator = new MigrationValidator();
      expect(validator).toBeDefined();
    });

    it('should throw error with missing environment variables', () => {
      delete process.env.SUPABASE_URL;
      
      expect(() => {
        new MigrationValidator();
      }).toThrow('Missing required Supabase environment variables');
    });
  });

  describe('verifyVaultAccess', () => {
    it('should pass when vault is accessible', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 3, error: null });
      
      const validator = new MigrationValidator();
      await expect(validator.verifyVaultAccess()).resolves.not.toThrow();
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('test_vault_count');
    });

    it('should fail when vault is inaccessible', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Connection failed' } 
      });
      
      const validator = new MigrationValidator();
      await expect(validator.verifyVaultAccess()).rejects.toThrow('Vault access verification failed');
    });
  });

  describe('checkExistingSecrets', () => {
    it('should check existing secrets successfully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 5, error: null });
      
      const validator = new MigrationValidator();
      await expect(validator.checkExistingSecrets()).resolves.not.toThrow();
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('test_vault_count');
    });

    it('should handle empty vault', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 0, error: null });
      
      const validator = new MigrationValidator();
      await expect(validator.checkExistingSecrets()).resolves.not.toThrow();
    });
  });

  describe('testVaultFunctionality', () => {
    it('should test vault functionality successfully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 3, error: null });
      
      const validator = new MigrationValidator();
      await expect(validator.testVaultFunctionality()).resolves.not.toThrow();
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('test_vault_count');
    });

    it('should fail on invalid vault data', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 'invalid', error: null });
      
      const validator = new MigrationValidator();
      await expect(validator.testVaultFunctionality()).rejects.toThrow('Vault returned invalid count data');
    });
  });

  describe('validate', () => {
    it('should complete full validation successfully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 3, error: null });
      
      const validator = new MigrationValidator();
      const result = await validator.validate();
      
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle validation failure', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Database connection failed' } 
      });
      
      const validator = new MigrationValidator();
      const result = await validator.validate();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Vault access verification failed');
    });
  });
});

describe('BackupRestoreTest', () => {
  describe('constructor', () => {
    it('should initialize with valid environment variables', () => {
      const test = new BackupRestoreTest();
      expect(test).toBeDefined();
    });

    it('should throw error with missing environment variables', () => {
      delete process.env.SUPABASE_URL;
      
      expect(() => {
        new BackupRestoreTest();
      }).toThrow('Missing required environment variable');
    });
  });

  describe('createBackup', () => {
    it('should create backup successfully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 3, error: null });
      mockSupabase.single.mockResolvedValue({ data: [], error: null });
      
      const test = new BackupRestoreTest();
      await expect(test.createBackup()).resolves.not.toThrow();
    });

    it('should handle backup errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Connection failed' } 
      });
      mockSupabase.single.mockResolvedValue({ data: [], error: null });
      
      const test = new BackupRestoreTest();
      // Should not throw, just warn and continue
      await expect(test.createBackup()).resolves.not.toThrow();
    });
  });

  describe('endToEndVaultTest', () => {
    it('should complete vault test successfully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 3, error: null });
      
      const test = new BackupRestoreTest();
      const result = await test.endToEndVaultTest();
      
      expect(result.success).toBe(true);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('test_vault_count');
    });

    it('should fail on vault connectivity issues', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Vault connectivity failed' } 
      });
      
      const test = new BackupRestoreTest();
      const result = await test.endToEndVaultTest();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Vault connectivity failed');
    });
  });
});

describe('Integration Tests', () => {
  describe('Full CI Pipeline Simulation', () => {
    it('should run migration validation before backup-restore test', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 3, error: null });
      mockSupabase.single.mockResolvedValue({ data: [], error: null });
      
      const validator = new MigrationValidator();
      const validationResult = await validator.validate();
      
      expect(validationResult.success).toBe(true);
      
      // If validation passes, proceed with backup-restore test
      if (validationResult.success) {
        const test = new BackupRestoreTest();
        const testResult = await test.run();
        expect(testResult.success).toBe(true);
      }
    });

    it('should fail CI if migration validation fails', async () => {
      mockSupabase.rpc.mockResolvedValue({ 
        data: null, 
        error: { message: 'Vault connection failed' } 
      });
      
      const validator = new MigrationValidator();
      const result = await validator.validate();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Vault access verification failed');
    });
  });
}); 