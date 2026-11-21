# Third-party licenses

## three.js (MIT)

- Version: 0.187.0
- File: `src/vendor/three-lite.js` is a tree-shaken, minified build that contains only the classes the game uses. The full MIT license text is in `src/vendor/three.LICENSE.txt`.
- How it was built (in a temporary folder outside the repo): `npm install three esbuild`, then bundle an entry file that re-exports the needed classes from `three`:
  `npx esbuild entry.js --bundle --minify --format=esm --legal-comments=none --outfile=src/vendor/three-lite.js`
- The list of exported classes is the import list in `src/renderer3d.js` plus the ones it uses (WebGLRenderer, Scene, PerspectiveCamera, lights, basic geometries, Lambert and Basic materials, InstancedMesh, Sprite, CanvasTexture and a few helpers).
