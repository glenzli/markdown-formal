const fs = require('node:fs/promises');
const path = require('node:path');

const outputDir = path.resolve(__dirname, '..', 'out');

fs.rm(outputDir, { recursive: true, force: true })
    .then(() => fs.mkdir(outputDir, { recursive: true }))
    .catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
