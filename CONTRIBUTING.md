# Contributing to LinkSight

Thanks for your interest in contributing. This project welcomes bug reports, feature ideas, documentation improvements, and pull requests.

## Ways to contribute

- Report bugs or request features via [GitHub Issues](https://github.com/pomelo925/LinkSight/issues)
- Improve documentation (README, guides, comments)
- Submit code changes through a pull request

## Pull request workflow

1. **Fork** the repository on GitHub.
2. **Clone** your fork and create a branch from `main`:

   ```bash
   git clone https://github.com/<your-username>/LinkSight.git
   cd LinkSight
   git checkout -b feature/short-description
   ```

3. **Make your changes** and keep commits focused.
4. **Test locally** when possible (Docker is the recommended path):

   ```bash
   ./run.sh dev
   ```

5. **Push** your branch to your fork:

   ```bash
   git push -u origin feature/short-description
   ```

6. Open a **Pull Request** against `pomelo925/LinkSight` `main`.
   - Describe what changed and why
   - Link related issues if any
   - Note how you tested

## Guidelines

- Prefer small, reviewable pull requests over large mixed changes.
- Match existing code style and project structure.
- Do not commit secrets, credentials, or local-only env files.
- For UI changes, include a short description or screenshot when helpful.
- Linux is the supported platform; keep that in mind for tooling and packaging.

## Code of conduct (expected)

Be respectful in issues and reviews. Assume good intent, keep discussion technical, and help others get unblocked.

## Questions?

Open an issue if you are unsure where to start — maintainers are happy to point you in the right direction.
