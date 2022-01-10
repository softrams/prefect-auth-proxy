# Contributing

When contributing to this repository, please first discuss the change you wish to make via issue with the owners of this repository before making a change.

## Contributing to Development

Issues will be labelled with `help wanted` or `good first issue`

- `Help wanted` label indicates tasks where the project team would appreciate community help
- `Good first issue` label indicates a task that introduce developers to the project, have low complexity, and are isolated

## Version Control

The project uses git as its version control system and GitHub as the central server and collaboration platform.

### Branching model

This repository is maintained to enable trunk based development with just one branch, `main` kept active. For all active development, 
create a branch off of main and push a PR to merge to main.

### Versioning

Any release from main will have a unique version

`MAJOR.MINOR.PATCH` will be incremented by:

1. `MAJOR` version when breaking changes occur
2. `MINOR` version with new functionality that is backwards-compatible
3. `PATCH` version with backwards-compatible bug fixes

## Pull Request Process

1. All work must be done in a fork off the main branch
2. Ensure any install or build dependencies are removed
3. Increase version numbers [accordingly](#versioning)
4. Docker container should build without error
5. No dependencies outside package.json
6. Build and test (currently do not have automated tests, so please double check not to break any current functionality)
7. Open pull request to merge to main branch
