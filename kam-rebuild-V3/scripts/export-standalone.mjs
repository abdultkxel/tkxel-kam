import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const assetsDir = join(projectRoot, 'dist', 'assets')
const specsDir = resolve(projectRoot, '..', 'Specs')
const outputPath = join(specsDir, 'tkxel-kam-platform-react-export-V3.html')

const assetFiles = readdirSync(assetsDir)
const cssFile = assetFiles.find(file => file.endsWith('.css'))
const jsFile = assetFiles.find(file => file.endsWith('.js'))

if (!cssFile || !jsFile) {
  throw new Error('Missing built CSS or JS assets. Run VITE_SINGLE_FILE_EXPORT=true npm run build first.')
}

const css = readFileSync(join(assetsDir, cssFile), 'utf8').replaceAll('</style', '<\\/style')
const js = readFileSync(join(assetsDir, jsFile), 'utf8')
  .replaceAll('</script', '<\\/script')
  .replaceAll('<!--', '<\\!--')

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tkxel KAM Platform V3</title>
    <link rel="icon" href="data:," />
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${js}
    </script>
  </body>
</html>
`

mkdirSync(specsDir, { recursive: true })
writeFileSync(outputPath, html)
console.log(outputPath)
