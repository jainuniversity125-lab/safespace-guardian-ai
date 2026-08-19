import { readdir, readFile, writeFile } from "node:fs/promises";

async function findSsrModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await findSsrModules(path));
    else if (entry.name === "ssr.mjs") files.push(path);
  }

  return files;
}

for (const root of [".output", ".vercel/output"]) {
  for (const outputPath of await findSsrModules(root)) {
    const source = await readFile(outputPath, "utf8");
    const patched = source.replace(
      "export { ssr_exports as a, server_default as default,",
      "var ssr_exports = { default: server_default, fetch: server_default };\nexport { ssr_exports as a, server_default as default, server_default as fetch,",
    ).replace(
      "export { getServerFnById as i,",
      "var ssr_exports = { default: server_default, fetch: server_default };\nexport { ssr_exports as a, server_default as default, server_default as fetch, getServerFnById as i,",
    );

    if (patched !== source) {
      await writeFile(outputPath, patched);
      console.log(`[build] Patched invalid SSR export in ${outputPath}`);
    }
  }
}
