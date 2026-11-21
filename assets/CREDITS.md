# Asset credits
Every file under assets/ needs a line here: source URL and licence. tools/check-budget.mjs fails without one.

## characters/ (hero spike, built by tools/build-hero.mjs)
- characters/hero.glb: derived from the MakeHuman hm08 base mesh (`makehuman/data/3dobjs/base.obj`), default skeleton (`makehuman/data/rigs/default.mhskel`) and default bone weights (`makehuman/data/rigs/default_weights.mhw`), reduced and re-rigged to 22 bones by our script. Source: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/ (repository https://github.com/makehumancommunity/makehuman). Licence: CC0 1.0 Universal (the files say so in their headers; LICENSE.md section C grants the assets, which include the base mesh and rigs, under CC0 1.0).
- characters/hero.sources.json: our own record of the five upstream files with their sha256, used to stop the build if upstream changes. No third-party content.
- characters/makehuman-LICENSE.md: copy of https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.md (MakeHuman licence overview; assets are CC0 1.0, source code is AGPL and is not used).
- characters/makehuman-LICENSE.ASSETS.md: copy of https://raw.githubusercontent.com/makehumancommunity/makehuman/master/LICENSE.ASSETS.md (the CC0 1.0 Universal legal text).
