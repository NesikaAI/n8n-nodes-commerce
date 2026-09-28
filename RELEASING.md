# Releasing

This package publishes to npm as `@nesika-ai/n8n-nodes-commerce`. n8n installs community nodes
by npm package name, so publishing is what ships the node.

## One-off setup, done once for the package

npm's trusted publishing gives GitHub Actions a short-lived login instead of a stored token, and
npm then adds a provenance statement, which is a signed record of the commit and workflow that
built the package. n8n requires provenance for verification. Trusted publishing can only be
configured for a package that already exists, so the first version goes up by hand.

1. **Publish 0.1.0 from a machine**, signed in as a member of the `nesika-ai` organisation:

   ```sh
   npm login
   npm publish --access public
   ```

   `--access public` is needed because the package is scoped, and scoped packages default to
   private.

2. **Configure trusted publishing** on npmjs.com, under the package's Settings, then
   "Publish access" and "Trusted Publishers". Add a GitHub Actions publisher with:

   | Field | Value |
   |---|---|
   | Repository owner | `NesikaAI` |
   | Repository name | `n8n-nodes-commerce` |
   | Workflow name | `publish.yml` |
   | Environment | leave blank |

3. **Turn on "Require two-factor authentication and disallow tokens"** in the same settings, so
   nothing can publish except this workflow.

4. **Leave `NPM_TOKEN` unset** in the repository secrets. The workflow falls back to a token only
   if one exists, and trusted publishing is the safer path.

## Every release after that

```sh
npm run release
```

That command lints, builds, asks for the version, updates the changelog, commits, tags and
pushes. The tag push runs `.github/workflows/publish.yml`, which publishes with provenance.

Check afterwards that the npm page shows the provenance badge, and that the version installs:

```sh
npx @n8n/scan-community-package @nesika-ai/n8n-nodes-commerce
```

That scanner is the check n8n runs during verification, so it should pass before any submission.

## Submitting for verification

A verified node appears in the node panel of every n8n instance, including n8n Cloud. Submit at
https://creators.n8n.io/nodes. n8n's published requirements, and where this package meets them:

| Requirement | Where |
|---|---|
| Public repository that the npm page links to | `repository` in `package.json` |
| MIT licence | `LICENSE` |
| No runtime dependencies | `package.json` has none, only peer and dev |
| Published from GitHub Actions with provenance | `.github/workflows/publish.yml` |
| Linter passes | `npm run lint`, and the scanner above |
| README with usage, examples and auth | `README.md` |
| No environment variables and no file access | the node reads only node parameters and the credential |
| English only | throughout |
