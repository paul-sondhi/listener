#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Fetches the Taddy GraphQL schema and saves it to a local file for codegen.
 * This script is used by the GraphQL Code Generator to create typed SDK.
 * 
 * The schema is used by both TaddyFreeClient and TaddyBusinessClient for 
 * type-safe GraphQL operations. The same schema works for both Free and 
 * Business tier APIs.
 * 
 * Usage: ts-node scripts/fetch-taddy-schema.ts
 * 
 * Environment Variables Required:
 * - TADDY_API_KEY: Your Taddy API key (works with Free or Business tier)
 * - TADDY_USER_ID: Your Taddy user ID (required by the API for all requests)
 */
async function fetchTaddySchema(): Promise<void> {
  const apiKey = process.env.TADDY_API_KEY;
  const userId = process.env.TADDY_USER_ID;
  
  if (!apiKey || !userId) {
    console.error('❌ TADDY_API_KEY and TADDY_USER_ID environment variables are required');
    console.error('   Add them to your .env file or environment');
    if (!apiKey) console.error('   ⚠️  Missing: TADDY_API_KEY');
    if (!userId) console.error('   ⚠️  Missing: TADDY_USER_ID');
    process.exit(1);
  }

  const schemaUrl = 'https://api.taddy.org/graphql';
  const outputPath = path.join(process.cwd(), 'taddy-schema.graphql');

  try {
    console.log('🔍 Fetching Taddy GraphQL schema...');
    
    // Perform introspection query to get the schema
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
          types {
            ...FullType
          }
          directives {
            name
            description
            locations
            args {
              ...InputValue
            }
          }
        }
      }

      fragment FullType on __Type {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            ...InputValue
          }
          type {
            ...TypeRef
          }
          isDeprecated
          deprecationReason
        }
        inputFields {
          ...InputValue
        }
        interfaces {
          ...TypeRef
        }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        possibleTypes {
          ...TypeRef
        }
      }

      fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
      }

      fragment TypeRef on __Type {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(schemaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
        'X-USER-ID': userId,
        'User-Agent': 'listener-app/1.0.0 (GraphQL Schema Fetch)'
      },
      body: JSON.stringify({
        query: introspectionQuery
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`);
    }

    if (!result.data || !result.data.__schema) {
      throw new Error('Invalid schema response - missing __schema data');
    }

    // Convert introspection result to SDL (Schema Definition Language)
    const schema = introspectionToSDL(result.data.__schema);
    
    // Write schema to file
    fs.writeFileSync(outputPath, schema, 'utf8');
    
    console.log('✅ Taddy GraphQL schema fetched successfully');
    console.log(`   Saved to: ${outputPath}`);
    console.log(`   Schema size: ${schema.length} characters`);
    
  } catch (error) {
    console.error('❌ Failed to fetch Taddy GraphQL schema:');
    console.error('  ', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Converts GraphQL introspection result to Schema Definition Language (SDL)
 * This is a simplified conversion - for production use, consider using
 * @graphql-tools/utils or similar library for more robust conversion.
 */
function introspectionToSDL(schema: any): string {
  const types = schema.types.filter((type: any) => 
    !type.name.startsWith('__') // Filter out introspection types
  );

  let sdl = '';

  // Add scalar types first
  const scalars = types.filter((type: any) => type.kind === 'SCALAR');
  scalars.forEach((scalar: any) => {
    if (!['String', 'Int', 'Float', 'Boolean', 'ID'].includes(scalar.name)) {
      sdl += `scalar ${scalar.name}\n\n`;
    }
  });

  // Add enums
  const enums = types.filter((type: any) => type.kind === 'ENUM');
  enums.forEach((enumType: any) => {
    sdl += `enum ${enumType.name} {\n`;
    enumType.enumValues.forEach((value: any) => {
      sdl += `  ${value.name}\n`;
    });
    sdl += '}\n\n';
  });

  // Add object types
  const objects = types.filter((type: any) => type.kind === 'OBJECT');
  objects.forEach((objectType: any) => {
    sdl += `type ${objectType.name} {\n`;
    if (objectType.fields) {
      objectType.fields.forEach((field: any) => {
        const fieldType = typeToString(field.type);
        sdl += `  ${field.name}: ${fieldType}\n`;
      });
    }
    sdl += '}\n\n';
  });

  // Add input types
  const inputs = types.filter((type: any) => type.kind === 'INPUT_OBJECT');
  inputs.forEach((inputType: any) => {
    sdl += `input ${inputType.name} {\n`;
    if (inputType.inputFields) {
      inputType.inputFields.forEach((field: any) => {
        const fieldType = typeToString(field.type);
        sdl += `  ${field.name}: ${fieldType}\n`;
      });
    }
    sdl += '}\n\n';
  });

  return sdl;
}

/**
 * Helper function to convert GraphQL type reference to string
 */
function typeToString(type: any): string {
  if (type.kind === 'NON_NULL') {
    return typeToString(type.ofType) + '!';
  }
  if (type.kind === 'LIST') {
    return '[' + typeToString(type.ofType) + ']';
  }
  return type.name;
}

// Run the script if called directly
if (require.main === module) {
  fetchTaddySchema().catch(console.error);
}

export { fetchTaddySchema }; 