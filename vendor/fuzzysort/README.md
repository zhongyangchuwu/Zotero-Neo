# fuzzysort vendored snapshot

- Upstream: https://github.com/farzher/fuzzysort
- Version: 4.0.2
- Upstream commit: ac4d42ec894a2125d78802ec9b5e74e43518d0fc
- License: MIT (see `LICENSE`)
- Vendored file: upstream `fuzzysort.min.js`, renamed to `fuzzysort.js`

Zotero Neo vendors this small zero-dependency ESM build so esbuild can inline it into the generated XPI. There is no CDN fetch, dynamic module load, native binary, or runtime package-manager dependency.
