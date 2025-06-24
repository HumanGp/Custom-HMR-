import { parse, transform as babelTransform } from '@babel/core';
import { Visitor } from '@babel/traverse';
import * as t from '@babel/types';
import MagicString from 'magic-string';
//  @babel/traverse to walk the AST with the visitor
import traverse from '@babel/traverse';

type TransformResult = {
  code: string;
  deps: string[];
  exports: string[];
  map?: any;
};

export class TransformPipeline {
  private cache = new Map<string, TransformResult>();
  private astCache = new Map<string, t.File>();
  private version = 0;

  async transform(
    file: string,
    code: string,
    isHmrEnabled: boolean
  ): Promise<{ code: string; deps: string[]; exports: string[] }> {
    const cacheKey = `${file}:${this.version}:${isHmrEnabled}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Parse AST and cache it
    let ast = this.astCache.get(file);
    if (!ast) {
      ast = await this.parseToAST(file, code);
      this.astCache.set(file, ast);
    }

    // Analyze exports and dependencies
    const { exports, deps } = TransformPipeline.prototype.analyzeModule.call(this, ast, file);

    // Apply transformations
    const transformed = await this.applyTransformations(file, code, ast, isHmrEnabled);

    const result = { 
      code: transformed.code,
      deps,
      exports,
      map: transformed.map
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  private async parseToAST(file: string, code: string): Promise<t.File> {
    return parse(code, {
      sourceType: 'module',
      sourceFileName: file,
      plugins: [
        'typescript',
        'jsx',
      ]
    }) as t.File;
  }

  // Stub for import/export transformation
  private transformImportsAndExports(
    file: string,
    s: MagicString,
    ast: t.File
  ): void {
    // Transform bare import/export declarations to ensure compatibility 
    (traverse as any).default
      ? (traverse as any).default(ast, {
            ImportDeclaration(path: import('@babel/traverse').NodePath<t.ImportDeclaration>) {
            s.remove(path.node.start!, path.node.end!);
            },
            ExportNamedDeclaration(
            path: import('@babel/traverse').NodePath<t.ExportNamedDeclaration>
            ): void {
            if (path.node.declaration) {
              // Remove 'export' keyword, keep the declaration
              s.remove(path.node.start!, path.node.declaration.start!);
            } else {
              // Remove the entire export statement 
              s.remove(path.node.start!, path.node.end!);
            }
            },
            ExportDefaultDeclaration(path: import('@babel/traverse').NodePath<t.ExportDefaultDeclaration>) {
            // Replace 'export default' with 'module.exports ='
            if (path.node.declaration) {
              s.overwrite(
              path.node.start!,
              path.node.declaration.start!,
              'module.exports = '
              );
            }
            },
            ExportAllDeclaration(path: import('@babel/traverse').NodePath<t.ExportAllDeclaration>) {
            // Remove export all declarations 
            s.remove(path.node.start!, path.node.end!);
            }
        })
      : (traverse as any)(ast, {
            ImportDeclaration(path: import('@babel/traverse').NodePath<t.ImportDeclaration>) {
            s.remove(path.node.start!, path.node.end!);
            },
            ExportNamedDeclaration(path: import('@babel/traverse').NodePath<t.ExportNamedDeclaration>) {
              if (path.node.declaration) {
              s.remove(path.node.start!, path.node.declaration.start!);
            } else {
              s.remove(path.node.start!, path.node.end!);
            }
            },
            ExportDefaultDeclaration(path: import('@babel/traverse').NodePath<t.ExportDefaultDeclaration>) {
            if (path.node.declaration) {
              s.overwrite(
              path.node.start!,
              path.node.declaration.start!,
              'module.exports = '
              );
            }
            },
            ExportAllDeclaration(path: import('@babel/traverse').NodePath<t.ExportAllDeclaration>) {
            s.remove(path.node.start!, path.node.end!);
            }
        });

  }

  private analyzeModule(ast: t.File, file: string): { exports: string[]; deps: string[] } {
    const exports = new Set<string>();
    const deps = new Set<string>();

    const visitor: Visitor = {
      ExportNamedDeclaration(path) {
        if (path.node.declaration) {
          if (t.isVariableDeclaration(path.node.declaration)) {
            path.node.declaration.declarations.forEach(decl => {
              if (t.isIdentifier(decl.id)) {
                exports.add(decl.id.name);
              }
            });
          } else if (t.isFunctionDeclaration(path.node.declaration) || 
                    t.isClassDeclaration(path.node.declaration)) {
            if (path.node.declaration.id) {
              exports.add(path.node.declaration.id.name);
            }
          }
        }

        if (path.node.specifiers) {
          path.node.specifiers.forEach(spec => {
            if (t.isExportSpecifier(spec)) {
              if (t.isIdentifier(spec.exported)) {
                exports.add(spec.exported.name);
              } else if (t.isStringLiteral(spec.exported)) {
                exports.add(spec.exported.value);
              }
            }
          });
        }
      },
      ExportDefaultDeclaration() {
        exports.add('default');
      },
      ExportAllDeclaration(path) {
        if (path.node.source) {
          deps.add(path.node.source.value);
        }
      },
      ImportDeclaration(path) {
        if (path.node.source) {
          deps.add(path.node.source.value);
        }
      },
      CallExpression(path) {
        if (t.isImport(path.node.callee) && 
            path.node.arguments.length > 0 && 
            t.isStringLiteral(path.node.arguments[0])) {
          deps.add(path.node.arguments[0].value);
        }
      }
    };

 
    (traverse as any).default
      ? (traverse as any).default(ast, visitor)
      : (traverse as any)(ast, visitor);

    return {
      exports: Array.from(exports),
      deps: Array.from(deps)
    };
  }

  private async applyTransformations(
    file: string,
    code: string,
    ast: t.File,
    isHmrEnabled: boolean
  ): Promise<{ code: string; map?: any }> {
    const s = new MagicString(code);

    // 1. ------------ Apply import/export transformations
    this.transformImportsAndExports(file, s, ast);

    // 2. Inject HMR runtime if enabled --------------------
    if (isHmrEnabled) {
      this.injectHmrRuntime(s, ast);
    }

    // 3. -------------Apply other optimizations
    this.applyOptimizations(s, ast);

    return {
      code: s.toString(),
      map: s.generateMap({
        source: file,
        includeContent: true,
        hires: true
      })
    };
  }

  // Stub for optimizations
  private applyOptimizations(s: MagicString, ast: t.File): void {
    // Example optimization: i will remove console.log statements later
    (traverse as any).default
      ? (traverse as any).default(ast, {
        CallExpression(path: import('@babel/traverse').NodePath<t.CallExpression>) {
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object, { name: 'console' }) &&
          t.isIdentifier(path.node.callee.property, { name: 'log' })
        ) {
          s.remove(path.node.start!, path.node.end!);
        }
        }
      })
      : (traverse as any)(ast, {
        CallExpression(path: import('@babel/traverse').NodePath<t.CallExpression>) {
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object, { name: 'console' }) &&
          t.isIdentifier(path.node.callee.property, { name: 'log' })
        ) {
          s.remove(path.node.start!, path.node.end!);
        }
        }
      });
  }

  // Stub for HMR runtime injection
  private injectHmrRuntime(s: MagicString, ast: t.File): void {
    // Inject a simple HMR runtime snippet at the top of the file
    s.prepend(
      `
  if (import.meta && import.meta.hot) {
    import.meta.hot.accept();
  }
  `.trim() + '\n'
    );
  }

}