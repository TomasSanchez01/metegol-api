/**
 * Script de prueba para validar que todos los scripts tienen la sintaxis correcta
 * y que los tipos están bien definidos.
 * 
 * Uso: npx tsx scripts/test-scripts.ts
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface TestResult {
  script: string;
  syntax: boolean;
  typeCheck: boolean;
  error?: string;
}

async function testScript(scriptPath: string): Promise<TestResult> {
  const result: TestResult = {
    script: scriptPath,
    syntax: false,
    typeCheck: false,
  };

  try {
    // Verificar sintaxis con tsx --check
    const { stdout, stderr } = await execAsync(
      `npx tsx --check ${scriptPath}`
    );

    if (stderr && stderr.includes("error")) {
      result.error = stderr;
      return result;
    }

    result.syntax = true;
    result.typeCheck = true;
  } catch (error: any) {
    result.error = error.message || error.toString();
  }

  return result;
}

async function testAllScripts() {
  console.log("🧪 Probando scripts...\n");

  const scripts = [
    "scripts/checkCollections.ts",
    "scripts/seedFirebase.ts",
    "scripts/migrateCacheToSchema.ts",
  ];

  const results: TestResult[] = [];

  for (const script of scripts) {
    console.log(`📝 Probando ${script}...`);
    const result = await testScript(script);
    results.push(result);

    if (result.syntax && result.typeCheck) {
      console.log(`  ✅ Sintaxis correcta\n`);
    } else {
      console.log(`  ❌ Error: ${result.error}\n`);
    }
  }

  // Resumen
  console.log("\n📊 Resumen de pruebas:");
  console.log("=" .repeat(50));

  const passed = results.filter((r) => r.syntax && r.typeCheck).length;
  const failed = results.filter((r) => !r.syntax || !r.typeCheck).length;

  for (const result of results) {
    const status = result.syntax && result.typeCheck ? "✅" : "❌";
    console.log(`${status} ${result.script}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  console.log("=" .repeat(50));
  console.log(`✅ Pasaron: ${passed}/${results.length}`);
  console.log(`❌ Fallaron: ${failed}/${results.length}`);

  if (failed > 0) {
    process.exit(1);
  }
}

testAllScripts().catch((error) => {
  console.error("❌ Error fatal:", error);
  process.exit(1);
});

